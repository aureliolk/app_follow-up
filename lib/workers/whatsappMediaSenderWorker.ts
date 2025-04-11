import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { sendWhatsappMediaMessage } from '@/lib/channel/whatsappSender';
import { WHATSAPP_OUTGOING_MEDIA_QUEUE } from '@/lib/queues/whatsappOutgoingMediaQueue';

interface MediaJobData {
  messageId: string;
}

const processor = async (job: Job<MediaJobData>) => {
  const { messageId } = job.data;
  console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Iniciando processamento do job ${job.id} para messageId: ${messageId}`);

  try {
    // 1. Buscar a mensagem e dados relacionados CORRIGIDO
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            client: true,    // Inclui o cliente
            workspace: true, // Inclui o workspace (onde estão os dados do WhatsApp)
          },
        },
      },
    });

    if (!message) {
      throw new Error(`Mensagem com ID ${messageId} não encontrada.`);
    }

    if (!message.conversation) {
        throw new Error(`Conversa não encontrada para a mensagem ${messageId}.`);
    }

    // Extrair dados CORRIGIDO
    const { conversation } = message;
    const { client, workspace } = conversation; // Obter client e workspace da conversa

    if (!workspace) {
        throw new Error(`Workspace não encontrado para a conversa ${conversation.id}.`);
    }

    if (!client) {
        throw new Error(`Cliente não encontrado para a conversa ${conversation.id}.`);
    }

    // 2. Validar dados necessários CORRIGIDO
    if (!message.media_url) {
      throw new Error(`media_url ausente na mensagem ${messageId}.`);
    }
    if (!message.media_mime_type) {
        throw new Error(`media_mime_type ausente na mensagem ${messageId}.`);
    }
    // Validar dados do Workspace
    if (!workspace.whatsappPhoneNumberId) {
        throw new Error(`whatsappPhoneNumberId ausente no workspace ${workspace.id}.`);
    }
    if (!workspace.whatsappAccessToken) {
        throw new Error(`whatsappAccessToken ausente no workspace ${workspace.id}.`);
    }
    // Validar dados do Cliente
    if (!client.phone_number) { // Corrigido para phone_number do schema
        throw new Error(`phone_number ausente no cliente ${client.id}.`);
    }

    // 3. Decriptar o token CORRIGIDO
    const accessToken = decrypt(workspace.whatsappAccessToken);

    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Enviando mídia ${message.media_mime_type} (${message.media_url}) para ${client.phone_number} via ${workspace.whatsappPhoneNumberId}`); // Corrigido

    // 4. Chamar a função de envio CORRIGIDO
    const sendResult = await sendWhatsappMediaMessage({
      phoneNumberId: workspace.whatsappPhoneNumberId,
      toPhoneNumber: client.phone_number,
      accessToken: accessToken,
      mediaUrl: message.media_url,
      mimeType: message.media_mime_type,
      filename: message.media_filename || undefined,
      caption: message.content || undefined,
    });

    // 5. Processar o resultado (sem alterações aqui, já estava correto)
    if (sendResult.success) {
      console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Mídia enviada com sucesso para ${client.phone_number}. Provider ID: ${sendResult.messageId}`); // Corrigido
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: "SENT",
          providerMessageId: sendResult.messageId,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Status da mensagem ${messageId} atualizado para SENT.`);
    } else {
      const errorMessage = typeof sendResult.error?.message === 'string' ? sendResult.error.message : 'Erro desconhecido no envio';
      console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha ao enviar mídia para ${client.phone_number}. Erro: ${errorMessage}`); // Corrigido
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: "FAILED",
          errorMessage: errorMessage.substring(0, 255),
        },
      });
      throw new Error(`Falha no envio da mídia: ${errorMessage}`);
    }

  } catch (error: any) {
    console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Erro processando job ${job.id} para messageId: ${messageId}:`, error.message);
    try {
        await prisma.message.update({
            where: { id: messageId },
            data: {
              status: "FAILED",
              errorMessage: (error.message || 'Erro inesperado no worker').substring(0, 255),
            },
          });
    } catch (updateError: any) {
        console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha CRÍTICA ao tentar atualizar status da mensagem ${messageId} para FAILED após erro:`, updateError.message);
    }
    throw error;
  }
};

// Criação e exportação da instância do Worker
export const whatsappMediaSenderWorker = new Worker<MediaJobData>(
  WHATSAPP_OUTGOING_MEDIA_QUEUE,
  processor,
  {
    connection: redisConnection,
    concurrency: 5, // Ajuste conforme necessário
    removeOnComplete: { count: 1000 }, // Mantém os últimos 1000 jobs completos
    removeOnFail: { count: 5000 }, // Mantém os últimos 5000 jobs com falha
  }
);

// Listeners de eventos para logging
whatsappMediaSenderWorker.on('completed', (job: Job<MediaJobData>, result: any) => {
  console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Job ${job.id} (messageId: ${job.data.messageId}) concluído com sucesso.`);
});

whatsappMediaSenderWorker.on('failed', (job: Job<MediaJobData> | undefined, error: Error) => {
  if (job) {
    console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Job ${job.id} (messageId: ${job.data.messageId}) falhou:`, error.message);
  } else {
    console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Um job desconhecido falhou:`, error.message);
  }
});

whatsappMediaSenderWorker.on('error', (error: Error) => {
  // Erro geral no worker, não necessariamente ligado a um job específico
  console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Erro no worker:`, error);
});

console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Worker inicializado e escutando a fila.`);

