// lib/workers/messageSender.ts

import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { MESSAGE_SENDER_QUEUE } from '@/lib/queues/messageQueue';
import { prisma } from '@/lib/db';
import { sendWhatsappTemplateMessage, SendResult, WhatsAppApiErrorData } from '@/lib/channel/whatsappSender';
import { decrypt } from '@/lib/encryption';
// TODO: Importar serviços de canal (ex: import { sendWhatsAppMessage } from '@/lib/channel/whatsappService')

console.log(`[Worker] Inicializando Worker para a fila: ${MESSAGE_SENDER_QUEUE}`);

// Definir a estrutura esperada dos dados do job
interface MessageJobData {
    campaignContactId: string;
    campaignId: string;
    workspaceId: string;
    // Outros dados podem ser adicionados aqui se necessário
}

/**
 * Worker que processa o envio individual de mensagens para contatos de campanha.
 */
const messageSenderWorker = new Worker<MessageJobData>(
  MESSAGE_SENDER_QUEUE,
  async (job: Job<MessageJobData>) => {
    const { campaignContactId, campaignId, workspaceId } = job.data;
    console.log(`[MessageSender] Recebido job ${job.id} para enviar mensagem ao contato: ${campaignContactId} (Campanha: ${campaignId})`);

    if (!campaignContactId || !campaignId || !workspaceId) {
        console.error(`[MessageSender] Erro: Job ${job.id} não contém dados necessários.`, job.data);
        throw new Error("Job data is missing required fields (campaignContactId, campaignId, workspaceId)");
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

      // Se o contato não estiver PENDING, talvez já tenha sido processado por outro job?
      if (campaignContact.status !== 'PENDING') {
        console.warn(`[MessageSender] Contato ${campaignContactId} não está PENDING (status: ${campaignContact.status}). Pulando envio.`);
        return; // Evita reprocessamento
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


      // 5. Chamar o serviço do WhatsApp
      console.log(`[MessageSender] Enviando template ${campaignContact.campaign.templateName} para ${campaignContact.contactInfo}`);
      const sendResult = await sendWhatsappTemplateMessage({
          phoneNumberId: workspace.whatsappPhoneNumberId,
          toPhoneNumber: campaignContact.contactInfo, // Assume contactInfo is the phone number
          accessToken: accessToken,
          templateName: campaignContact.campaign.templateName,
          templateLanguage: campaignContact.campaign.templateLanguage,
          variables: variables,
      });


      // 6. Atualizar status do CampaignContact no banco
      const finalStatus = sendResult.success ? 'SENT' : 'FAILED';
      let errorMessage: string | null = null;
      if (!sendResult.success) {
           if (sendResult.error && typeof sendResult.error === 'object' && 'message' in sendResult.error) {
                errorMessage = `API Error: ${sendResult.error.message}`;
                if ('type' in sendResult.error) errorMessage += ` (Type: ${sendResult.error.type})`;
                if ('code' in sendResult.error) errorMessage += ` (Code: ${sendResult.error.code})`;
                if ('error_subcode' in sendResult.error) errorMessage += ` (Subcode: ${sendResult.error.error_subcode})`;
                if ('fbtrace_id' in sendResult.error) errorMessage += ` (Trace: ${sendResult.error.fbtrace_id})`;
           } else if (sendResult.error) {
                errorMessage = String(sendResult.error);
           } else {
                errorMessage = "Erro desconhecido no envio";
           }
           console.error(`[MessageSender] Falha ao enviar para ${campaignContact.contactInfo}. Erro: ${errorMessage}`);
      }

      await prisma.campaignContact.update({
          where: { id: campaignContactId },
          data: {
              status: finalStatus,
              sentAt: sendResult.success ? new Date() : null,
              error: errorMessage,
          }
      });
      console.log(`[MessageSender] Status do contato ${campaignContactId} atualizado para ${finalStatus}.`);
      // Publish progress update via Redis
      try {
        await redisConnection.publish(
          `campaign-progress:${campaignId}`,
          JSON.stringify({ contactId: campaignContactId, status: finalStatus })
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
      console.error(`[MessageSender] Erro ao processar job ${job.id} para contato ${campaignContactId}:`, error);
      // Tenta atualizar o status do contato para FAILED se possível
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