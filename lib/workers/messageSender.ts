// lib/workers/messageSender.ts

import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { MESSAGE_SENDER_QUEUE } from '@/lib/queues/messageQueue';
import { prisma } from '@/lib/db';
import { sendWhatsappTemplateMessage, SendResult, WhatsAppApiErrorData } from '@/lib/channel/whatsappSender';
import { decrypt } from '@/lib/encryption';
import { publishConversationUpdate } from '@/lib/services/notifierService';
import { Prisma } from '@prisma/client';
// TODO: Importar serviços de canal (ex: import { sendWhatsAppMessage } from '@/lib/channel/whatsappService')

console.log(`[Worker] Inicializando Worker para a fila: ${MESSAGE_SENDER_QUEUE}`);

// Definir a estrutura esperada dos dados do job
interface MessageJobData {
    campaignContactId: string;
    campaignId: string;
    workspaceId: string;
    messageIdToUpdate: string;
    conversationId: string;
    // Outros dados podem ser adicionados aqui se necessário
}

/**
 * Worker que processa o envio individual de mensagens para contatos de campanha.
 */
const messageSenderWorker = new Worker<MessageJobData>(
  MESSAGE_SENDER_QUEUE,
  async (job: Job<MessageJobData>) => {
    const { campaignContactId, campaignId, workspaceId, messageIdToUpdate, conversationId } = job.data;
    console.log(`[MessageSender] Recebido job ${job.id} para enviar mensagem ${messageIdToUpdate} (Contato: ${campaignContactId}, Campanha: ${campaignId}, Conv: ${conversationId})`);

    if (!campaignContactId || !campaignId || !workspaceId || !messageIdToUpdate || !conversationId) {
        console.error(`[MessageSender] Erro: Job ${job.id} não contém dados necessários.`, job.data);
        throw new Error("Job data is missing required fields (campaignContactId, campaignId, workspaceId, messageIdToUpdate, conversationId)");
    }

    try {
      // --- Lógica Principal de Envio ---
      // 1. Buscar detalhes completos do CampaignContact e da Campaign (mensagem/template)
      const campaignContact = await prisma.campaignContact.findUnique({
          where: { id: campaignContactId },
          include: {
              campaign: {
                  select: { message: true, isTemplate: true, templateName: true, templateLanguage: true, workspaceId: true }
              }
          }
      });

      if (!campaignContact || !campaignContact.campaign) {
          console.error(`[MessageSender] CampaignContact ${campaignContactId} ou Campanha associada não encontrada.`);
          throw new Error(`CampaignContact ${campaignContactId} or its Campaign not found.`);
      }

      // Check if it's a template message (add more checks if other types are supported later)
      if (!campaignContact.campaign.isTemplate || !campaignContact.campaign.templateName || !campaignContact.campaign.templateLanguage) {
        console.error(`[MessageSender] Campanha ${campaignId} não é um template válido ou falta nome/linguagem.`);
        throw new Error(`Campaign ${campaignId} is not a valid template or missing name/language.`);
      }

      // Se o contato não estiver SCHEDULED, algo está errado (já foi processado, falhou no processor, etc.)
      if (campaignContact.status !== 'SCHEDULED') {
        console.warn(`[MessageSender] Contato ${campaignContactId} não está SCHEDULED (status: ${campaignContact.status}). Pulando envio.`);
        return; // Evita processar contatos que não estão no estado esperado
      }

      console.log(`[MessageSender] Preparando envio para: ${campaignContact.contactInfo}, Mensagem/Template: ${campaignContact.campaign.templateName || campaignContact.campaign.message.substring(0, 30)}...`);

      // 2. Fetch Workspace Credentials
      const workspace = await prisma.workspace.findUnique({
        where: { id: campaignContact.campaign.workspaceId }, // Get workspaceId from campaign
        select: { whatsappPhoneNumberId: true, whatsappAccessToken: true }
      });

      if (!workspace || !workspace.whatsappPhoneNumberId || !workspace.whatsappAccessToken) {
          console.error(`[MessageSender] Workspace ${campaignContact.campaign.workspaceId} ou credenciais WhatsApp não encontradas/configuradas.`);
          // Update contact status to FAILED before throwing
          await prisma.campaignContact.update({
              where: { id: campaignContactId },
              data: { status: 'FAILED', error: 'Workspace or WhatsApp credentials not found/configured.' }
          });
          throw new Error(`Workspace ${campaignContact.campaign.workspaceId} or WhatsApp credentials not found/configured.`);
      }

      // 3. Decrypt Token
      let accessToken: string;
      try {
        accessToken = decrypt(workspace.whatsappAccessToken);
      } catch (decryptionError) {
          console.error(`[MessageSender] Falha ao decriptar token do workspace ${workspaceId}:`, decryptionError);
           await prisma.campaignContact.update({
              where: { id: campaignContactId },
              data: { status: 'FAILED', error: 'Failed to decrypt access token.' }
          });
          throw new Error(`Failed to decrypt access token for workspace ${workspaceId}.`);
      }


      // 4. Prepare Variables (ensure it's a Record<string, string>)
      const variables = typeof campaignContact.variables === 'object' && campaignContact.variables !== null && !Array.isArray(campaignContact.variables)
                        ? campaignContact.variables as Record<string, string>
                        : {};


      // 5. Chamar o serviço do WhatsApp e atualizar Message + Notificar UI
      let sendResult: SendResult | null = null;
      let finalMessageStatus: 'SENT' | 'FAILED' = 'FAILED'; // Assume falha inicialmente
      let errorMessageForDb: string | null = 'Unknown error during sending process';
      let wamid: string | null = null;

      try {
          console.log(`[MessageSender ${job.id}] Enviando template ${campaignContact.campaign.templateName} para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate})`);
          sendResult = await sendWhatsappTemplateMessage({
              phoneNumberId: workspace.whatsappPhoneNumberId,
              toPhoneNumber: campaignContact.contactInfo, // Assume contactInfo is the phone number
              accessToken: accessToken,
              templateName: campaignContact.campaign.templateName,
              templateLanguage: campaignContact.campaign.templateLanguage,
              variables: variables,
          });

          // Processa resultado DENTRO do try
          if (sendResult.success) {
              finalMessageStatus = 'SENT';
              wamid = sendResult.wamid;
              errorMessageForDb = null;
              console.log(`[MessageSender ${job.id}] Envio bem-sucedido para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate}, WAMID: ${wamid})`);
          } else {
              // Monta mensagem de erro detalhada
              if (sendResult.error && typeof sendResult.error === 'object' && 'message' in sendResult.error) {
                  errorMessageForDb = `API Error: ${sendResult.error.message}`;
                  if ('type' in sendResult.error) errorMessageForDb += ` (Type: ${sendResult.error.type})`;
                  if ('code' in sendResult.error) errorMessageForDb += ` (Code: ${sendResult.error.code})`;
                  if ('error_subcode' in sendResult.error) errorMessageForDb += ` (Subcode: ${sendResult.error.error_subcode})`;
                  if ('fbtrace_id' in sendResult.error) errorMessageForDb += ` (Trace: ${sendResult.error.fbtrace_id})`;
              } else if (sendResult.error) {
                  errorMessageForDb = String(sendResult.error);
              } else {
                  errorMessageForDb = "Erro desconhecido retornado pela API";
              }
              console.error(`[MessageSender ${job.id}] Falha ao enviar para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate}). Erro: ${errorMessageForDb}`);
              // finalMessageStatus já é 'FAILED'
          }

      } catch (sendError: any) {
          // Captura erros na própria chamada ou processamento do resultado
          console.error(`[MessageSender ${job.id}] Erro EXCEPCIONAL durante sendWhatsappTemplateMessage ou processamento do resultado para Msg ${messageIdToUpdate}:`, sendError);
          errorMessageForDb = `Exception during send: ${sendError?.message || String(sendError)}`;
          finalMessageStatus = 'FAILED';
      }

      // 6. <<< ATUALIZAR A MENSAGEM no banco de dados >>>
      try {
          // Buscar metadados existentes para não sobrescrever
          const existingMessage = await prisma.message.findUnique({ where: { id: messageIdToUpdate }, select: { metadata: true } });
          const currentMetadata = (typeof existingMessage?.metadata === 'object' && existingMessage.metadata !== null) ? existingMessage.metadata : {};

          const dataToUpdate: Prisma.MessageUpdateInput = {
              status: finalMessageStatus,
              ...(wamid && { channel_message_id: wamid }), // Adiciona wamid se SUCESSO
              ...(finalMessageStatus === 'FAILED' && {
                  metadata: { // Adiciona/atualiza erro no metadata se FALHA
                      ...currentMetadata,
                      sendError: errorMessageForDb
                  }
              })
          };

          await prisma.message.update({
              where: { id: messageIdToUpdate },
              data: dataToUpdate
          });
          console.log(`[MessageSender ${job.id}] Mensagem ${messageIdToUpdate} atualizada no DB para status ${finalMessageStatus}.`);

          // 7. <<< PUBLICAR ATUALIZAÇÃO DE STATUS NO REDIS (para UI) >>>
          await publishConversationUpdate(
              `chat-updates:${conversationId}`,
              {
                  type: 'message_status_updated',
                  payload: {
                      messageId: messageIdToUpdate,
                      conversation_id: conversationId,
                      newStatus: finalMessageStatus,
                      providerMessageId: wamid, // Envia o WAMID se disponível
                      timestamp: new Date().toISOString(),
                      ...(finalMessageStatus === 'FAILED' && { errorMessage: errorMessageForDb })
                  }
              }
          );
          console.log(`[MessageSender ${job.id}] Notificação 'message_status_updated' enviada para chat-updates:${conversationId}`);

      } catch (dbOrRedisError: any) {
          console.error(`[MessageSender ${job.id}] Erro ao atualizar DB ou publicar status Redis para Mensagem ${messageIdToUpdate}:`, dbOrRedisError);
          // Logar o erro, mas não necessariamente falhar o job aqui,
          // pois o contato da campanha será atualizado a seguir.
          // Considerar uma fila de retentativa para essas atualizações secundárias?
      }

      // 8. <<< ATUALIZAR STATUS DO CAMPAIGN CONTACT (lógica existente) >>>
      await prisma.campaignContact.update({
          where: { id: campaignContactId },
          data: {
              status: finalMessageStatus, // Usa o mesmo status final (SENT ou FAILED)
              sentAt: finalMessageStatus === 'SENT' ? new Date() : null,
              error: errorMessageForDb, // Salva a mensagem de erro detalhada
          }
      });
      console.log(`[MessageSender ${job.id}] Status do CampaignContact ${campaignContactId} atualizado para ${finalMessageStatus}.`);
      
      // Publish progress update via Redis (lógica existente)
      try {
        await redisConnection.publish(
          `campaign-progress:${campaignId}`,
          JSON.stringify({ contactId: campaignContactId, status: finalMessageStatus })
        );
      } catch (pubErr: any) {
        console.error(`[MessageSender] Erro ao publicar progresso do contato ${campaignContactId}:`, pubErr);
      }

      // --- Início: Lógica de Finalização da Campanha ---
      // Verifica se ainda existem outros contatos PENDING nesta campanha
      const pendingCount = await prisma.campaignContact.count({
        where: {
          campaignId: campaignId,
          status: 'PENDING',
        },
      });

      if (pendingCount === 0) {
        console.log(`[MessageSender] Último contato processado para campanha ${campaignId}. Atualizando status para COMPLETED.`);
        try {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'COMPLETED' },
          });

          // Publica notificação de campanha completa no mesmo canal de progresso
          await redisConnection.publish(
            `campaign-progress:${campaignId}`,
            JSON.stringify({
              type: 'campaignCompleted', // Adiciona um tipo para diferenciar do progresso
              campaignId: campaignId,
              status: 'COMPLETED'
            })
          );
          console.log(`[MessageSender] Notificação de conclusão publicada para campanha ${campaignId}.`);

        } catch (campaignUpdateError) {
          console.error(`[MessageSender] Falha ao atualizar status final ou publicar conclusão da campanha ${campaignId}:`, campaignUpdateError);
          // Não relançar o erro aqui para não falhar o job do contato individual,
          // mas logar é importante.
        }
      }
      // --- Fim: Lógica de Finalização da Campanha ---

    } catch (error) {
      console.error(`[MessageSender] Erro GERAL ao processar job ${job.id} para contato ${campaignContactId}:`, error);
      
      // <<< INÍCIO: Tentativa de Marcar Mensagem como FAILED em caso de erro GERAL >>>
      // Tenta marcar a mensagem associada como FAILED se um erro geral ocorrer
      // ANTES da atualização normal da mensagem.
      if (messageIdToUpdate) { // Verifica se temos o ID da mensagem
        try {
            console.warn(`[MessageSender ${job.id}] Tentando marcar mensagem ${messageIdToUpdate} como FAILED devido a erro GERAL.`);
            // Buscar metadados existentes
            const existingMessage = await prisma.message.findUnique({ where: { id: messageIdToUpdate }, select: { metadata: true } });
            const currentMetadata = (typeof existingMessage?.metadata === 'object' && existingMessage.metadata !== null) ? existingMessage.metadata : {};
            
            await prisma.message.update({
                where: { id: messageIdToUpdate },
                data: {
                    status: 'FAILED',
                    metadata: { 
                        ...currentMetadata,
                        jobError: `General Error: ${error instanceof Error ? error.message : String(error)}`
                    }
                }
            });
            // Tenta notificar a UI sobre a falha
             if (conversationId) {
                 await publishConversationUpdate(
                     `chat-updates:${conversationId}`,
                     {
                         type: 'message_status_updated',
                         payload: {
                             messageId: messageIdToUpdate,
                             conversation_id: conversationId,
                             newStatus: 'FAILED',
                             errorMessage: `General Error: ${error instanceof Error ? error.message : String(error)}`,
                             timestamp: new Date().toISOString(),
                         }
                     }
                 );
             }
        } catch (failMsgError) {
            console.error(`[MessageSender ${job.id}] Falha ANINHADA ao tentar marcar mensagem ${messageIdToUpdate} como FAILED após erro geral:`, failMsgError);
        }
      }
      // <<< FIM: Tentativa de Marcar Mensagem como FAILED >>>

      // Tenta atualizar o status do contato para FAILED se possível (lógica existente)
      try {
           await prisma.campaignContact.update({
                where: { id: campaignContactId },
                data: {
                    status: 'FAILED',
                    error: error instanceof Error ? error.message : String(error),
                }
           });
      } catch (updateError) {
          console.error(`[MessageSender] Falha ao tentar atualizar status para FAILED do contato ${campaignContactId} após erro principal:`, updateError);
      }
      // Lança o erro original para que BullMQ possa tentar novamente ou marcar como falho
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 10, // Pode processar mais envios simultaneamente (ajustar)
    limiter: {        // Limitar chamadas à API externa (ex: WhatsApp)
      max: 50,        // Ex: 50 chamadas
      duration: 10000, // a cada 10 segundos
    },
  }
);

messageSenderWorker.on('completed', (job: Job<MessageJobData>) => {
  console.log(`[MessageSender] Job ${job.id} para contato ${job.data.campaignContactId} concluído.`);
});

messageSenderWorker.on('failed', (job: Job<MessageJobData> | undefined, err: Error) => {
  if (job) {
    console.error(`[MessageSender] Job ${job.id} para contato ${job.data?.campaignContactId} falhou:`, err);
  } else {
    console.error(`[MessageSender] Um job de envio falhou sem ID definido:`, err);
  }
});

messageSenderWorker.on('error', err => {
    console.error('[MessageSender] Erro no worker:', err);
});

export { messageSenderWorker }; 