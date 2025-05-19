// lib/workers/messageSender.ts

import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { MESSAGE_SENDER_QUEUE } from '@/lib/queues/messageQueue';
import { prisma } from '@/lib/db';
import { sendWhatsappTemplateMessage, SendResult as SendTemplateResult } from '@/lib/channel/whatsappSender';
import { sendWhatsAppMessage, sendEvolutionMessage } from "@/lib/services/channelService";
import { decrypt } from '@/lib/encryption';
import pusher from '@/lib/pusher';
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
                  select: { message: true, isTemplate: true, templateName: true, templateLanguage: true, workspaceId: true, channelIdentifier: true }
              }
          }
      });

      if (!campaignContact || !campaignContact.campaign) {
          console.error(`[MessageSender] CampaignContact ${campaignContactId} ou Campanha associada não encontrada.`);
          throw new Error(`CampaignContact ${campaignContactId} or its Campaign not found.`);
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
        select: {
          whatsappPhoneNumberId: true,
          whatsappAccessToken: true,
          evolution_api_instance_name: true,
          evolution_api_token: true,
        }
      });

      if (!workspace) {
          console.error(`[MessageSender] Workspace ${campaignContact.campaign.workspaceId} não encontrado. Não é possível obter credenciais.`);
          // Marcar contato como FAILED antes de lançar o erro fatal para o job
          await prisma.campaignContact.update({
              where: { id: campaignContactId },
              data: { status: 'FAILED', error: `Workspace ${campaignContact.campaign.workspaceId} not found.` }
          });
          throw new Error(`Workspace ${campaignContact.campaign.workspaceId} not found. Cannot fetch credentials.`);
      }

      // 4. Prepare Variables (ensure it's a Record<string, string>)
      const variables = typeof campaignContact.variables === 'object' && campaignContact.variables !== null && !Array.isArray(campaignContact.variables)
                        ? campaignContact.variables as Record<string, string>
                        : {};


      // 5. Chamar o serviço do canal e atualizar Message + Notificar UI
      let sendResult: (SendTemplateResult | { success: boolean; messageId?: string; error?: any }) | null = null;
      let finalMessageStatus: 'SENT' | 'FAILED' = 'FAILED';
      let errorMessageForDb: string | null = 'Unknown error during sending process';
      let providerMessageId: string | null = null;

      const { campaign } = campaignContact;
      const channel = campaign.channelIdentifier;

      try {
        if (channel === 'WHATSAPP_CLOUDAPI') {
          if (!workspace.whatsappPhoneNumberId || !workspace.whatsappAccessToken) {
            errorMessageForDb = `Workspace ${campaign.workspaceId} or WhatsApp Cloud API credentials not found/configured.`;
            console.error(`[MessageSender] ${errorMessageForDb}`);
            throw new Error(errorMessageForDb);
          }
          const accessToken = decrypt(workspace.whatsappAccessToken);

          if (campaign.isTemplate) {
            if (!campaign.templateName || !campaign.templateLanguage) {
              errorMessageForDb = `Campaign ${campaignId} is a Cloud API template but missing name/language.`;
              console.error(`[MessageSender] ${errorMessageForDb}`);
              throw new Error(errorMessageForDb);
            }
            console.log(`[MessageSender ${job.id}] Enviando template ${campaign.templateName} (CloudAPI) para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate})`);
            sendResult = await sendWhatsappTemplateMessage({
                phoneNumberId: workspace.whatsappPhoneNumberId,
                toPhoneNumber: campaignContact.contactInfo,
                accessToken: accessToken,
                templateName: campaign.templateName,
                templateLanguage: campaign.templateLanguage,
                variables: variables,
            });
            if (sendResult.success && 'wamid' in sendResult && sendResult.wamid) {
              providerMessageId = sendResult.wamid;
            }
          } else {
            console.log(`[MessageSender ${job.id}] Enviando mensagem de texto (CloudAPI) para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate})`);
            const textSendResult = await sendWhatsAppMessage(
              workspace.whatsappPhoneNumberId,
              campaignContact.contactInfo,
              workspace.whatsappAccessToken,
              campaign.message,
              "Campanha"
            );
            sendResult = textSendResult;
            if (sendResult.success && 'wamid' in sendResult && sendResult.wamid) {
                providerMessageId = sendResult.wamid;
            }
          }
        } else if (channel === 'WHATSAPP_EVOLUTION') {
          if (!workspace.evolution_api_instance_name || !workspace.evolution_api_token) {
            errorMessageForDb = `Workspace ${campaign.workspaceId} or Evolution API credentials not found/configured.`;
            console.error(`[MessageSender] ${errorMessageForDb}`);
            throw new Error(errorMessageForDb);
          }
          
          if (campaign.isTemplate) {
            console.log(`[MessageSender ${job.id}] Enviando template ${campaign.templateName} (Evolution) para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate})`);
            errorMessageForDb = "Envio de template via Evolution API ainda não implementado.";
            console.error(`[MessageSender ${job.id}] ${errorMessageForDb}`);
            finalMessageStatus = 'FAILED';
          } else {
            console.log(`[MessageSender ${job.id}] Enviando mensagem de texto (Evolution) para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate})`);
            const evoTextSendResult = await sendEvolutionMessage({
              endpoint: process.env.apiUrlEvolution!,
              apiKey: workspace.evolution_api_token,
              instanceName: workspace.evolution_api_instance_name,
              toPhoneNumber: campaignContact.contactInfo,
              messageContent: campaign.message,
              senderName: "Campanha"
            });
            sendResult = evoTextSendResult;
            if (sendResult.success && 'messageId' in sendResult && sendResult.messageId) {
                providerMessageId = sendResult.messageId;
            }
          }
        } else {
          errorMessageForDb = `Canal de envio desconhecido ou não suportado: ${channel}`;
          console.error(`[MessageSender ${job.id}] ${errorMessageForDb}`);
          throw new Error(errorMessageForDb);
        }

        // Processa resultado do envio
        if (errorMessageForDb !== "Envio de template via Evolution API ainda não implementado.") {
            if (sendResult && sendResult.success) {
                finalMessageStatus = 'SENT';
                errorMessageForDb = null;
                console.log(`[MessageSender ${job.id}] Envio bem-sucedido para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate}, ProviderMsgID: ${providerMessageId})`);
            } else {
                finalMessageStatus = 'FAILED';
                if (sendResult && sendResult.error && typeof sendResult.error === 'object' && 'message' in sendResult.error) {
                    errorMessageForDb = `API Error: ${(sendResult.error as any).message}`;
                } else if (sendResult && sendResult.error) {
                    errorMessageForDb = String(sendResult.error);
                } else if (!sendResult && !errorMessageForDb) { 
                    errorMessageForDb = "Resultado de envio não recebido da API.";
                }
                if (!errorMessageForDb) errorMessageForDb = "Erro desconhecido durante o envio.";
                console.error(`[MessageSender ${job.id}] Falha ao enviar para ${campaignContact.contactInfo} (Msg: ${messageIdToUpdate}). Erro: ${errorMessageForDb}`);
            }
        }

      } catch (sendError: any) {
          console.error(`[MessageSender ${job.id}] Erro DURANTE o processo de envio para Msg ${messageIdToUpdate}:`, sendError);
          finalMessageStatus = 'FAILED';
          errorMessageForDb = `Exception during send process: ${sendError?.message || String(sendError)}`;
      }

      // 6. <<< ATUALIZAR A MENSAGEM no banco de dados >>>
      try {
          const existingMessage = await prisma.message.findUnique({ where: { id: messageIdToUpdate }, select: { metadata: true } });
          const currentMetadata = (typeof existingMessage?.metadata === 'object' && existingMessage.metadata !== null) ? existingMessage.metadata : {};

          const dataToUpdate: Prisma.MessageUpdateInput = {
              status: finalMessageStatus,
              ...(providerMessageId && { channel_message_id: providerMessageId }),
              ...(finalMessageStatus === 'FAILED' && {
                  metadata: { 
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

          // 7. Notificar atualização de status via Pusher
          const pusherChannel = `private-workspace-${workspaceId}`;
          await pusher.trigger(
            pusherChannel,
            'message_status_update',
            {
              payload: {
                messageId: messageIdToUpdate,
                conversation_id: conversationId,
                newStatus: finalMessageStatus,
                providerMessageId: providerMessageId,
                timestamp: new Date().toISOString(),
                ...(finalMessageStatus === 'FAILED' && { errorMessage: errorMessageForDb })
              }
            }
          );
          console.log(`[MessageSender ${job.id}] Evento 'message_status_update' enviado para ${pusherChannel}`);

      } catch (dbOrRedisError: any) {
          console.error(`[MessageSender ${job.id}] Erro ao atualizar DB ou publicar status Redis para Mensagem ${messageIdToUpdate}:`, dbOrRedisError);
      }

      // 8. <<< ATUALIZAR STATUS DO CAMPAIGN CONTACT (lógica existente) >>>
      await prisma.campaignContact.update({
          where: { id: campaignContactId },
          data: {
              status: finalMessageStatus,
              sentAt: finalMessageStatus === 'SENT' ? new Date() : null,
              error: errorMessageForDb,
          }
      });
      console.log(`[MessageSender ${job.id}] Status do CampaignContact ${campaignContactId} atualizado para ${finalMessageStatus}.`);
      
      // Publicar progresso via Pusher
      try {
        const progressChannel = `private-workspace-${workspaceId}`;
        await pusher.trigger(progressChannel, 'campaign_progress', {
          contactId: campaignContactId,
          status: finalMessageStatus,
          error: errorMessageForDb,
          campaignId
        });
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

          // Notifica conclusão da campanha via Pusher
          const progressChannel = `private-workspace-${workspaceId}`;
          await pusher.trigger(progressChannel, 'campaign_progress', {
            type: 'campaignCompleted',
            campaignId: campaignId,
            status: 'COMPLETED'
          });
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
                const pusherChannel = `private-workspace-${workspaceId}`;
                await pusher.trigger(
                    pusherChannel,
                    'message_status_update',
                    {
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