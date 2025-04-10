import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { uploadWhatsappMedia, sendWhatsappMediaMessage } from '@/lib/channel/whatsappSender';
import { WHATSAPP_OUTGOING_MEDIA_QUEUE } from '@/lib/queues/whatsappOutgoingMediaQueue';
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, s3BucketName } from '@/lib/s3Client';
import { Readable } from 'stream';

// --- Helper para converter Stream para Buffer ---
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// --- Helper para mapear Mime Type para WhatsApp Type ---
// (Pode ser movido para utils se usado em mais lugares)
function getWhatsAppMessageTypeFromMime(mimeType: string): 'image' | 'audio' | 'video' | 'document' | null {
    if (!mimeType) return null;
    const lowerMime = mimeType.toLowerCase();
    if (lowerMime.startsWith('image/')) return 'image';
    if (lowerMime.startsWith('audio/')) return 'audio';
    if (lowerMime.startsWith('video/')) return 'video';
    // Assumir documento para outros tipos comuns ou desconhecidos que podem ser enviados
    if (lowerMime.startsWith('application/') || lowerMime.startsWith('text/')) return 'document';
    return null; // Retorna null se não for um tipo reconhecido para envio
}

interface MediaJobData {
  messageId: string;
}

const processor = async (job: Job<MediaJobData>) => {
  const { messageId } = job.data;
  console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Iniciando processamento do job ${job.id} para messageId: ${messageId}`);

  // Variáveis para guardar dados importantes
  let workspaceId: string | undefined;
  let clientPhoneNumber: string | undefined;
  let messageDetails: any; // Para guardar detalhes da mensagem para logs de erro

  try {
    // 1. Buscar a mensagem e dados relacionados
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            client: true,
            workspace: true,
          },
        },
      },
    });

    // Guardar detalhes para logs
    messageDetails = message;
    if (message?.conversation?.workspace?.id) workspaceId = message.conversation.workspace.id;
    if (message?.conversation?.client?.phone_number) clientPhoneNumber = message.conversation.client.phone_number;


    if (!message) throw new Error(`Mensagem ${messageId} não encontrada.`);
    if (!message.conversation) throw new Error(`Conversa não encontrada para msg ${messageId}.`);
    const { conversation } = message;
    const { client, workspace } = conversation;
    if (!workspace) throw new Error(`Workspace não encontrado para conversa ${conversation.id}.`);
    if (!client) throw new Error(`Cliente não encontrado para conversa ${conversation.id}.`);
    if (!s3BucketName) throw new Error('STORAGE_BUCKET_NAME não configurado no ambiente.'); // Validar bucket

    // 2. Validar dados necessários
    const mediaUrl = message.media_url;
    const mimeType = message.media_mime_type;
    const filename = message.media_filename || 'media'; // Default filename
    const phoneNumberId = workspace.whatsappPhoneNumberId;
    const encryptedToken = workspace.whatsappAccessToken;
    const recipientPhoneNumber = client.phone_number;
    const caption = message.content || undefined;

    if (!mediaUrl) throw new Error(`media_url ausente na msg ${messageId}.`);
    if (!mimeType) throw new Error(`media_mime_type ausente na msg ${messageId}.`);
    if (!phoneNumberId) throw new Error(`whatsappPhoneNumberId ausente no workspace ${workspace.id}.`);
    if (!encryptedToken) throw new Error(`whatsappAccessToken ausente no workspace ${workspace.id}.`);
    if (!recipientPhoneNumber) throw new Error(`phone_number ausente no cliente ${client.id}.`);

     // 3. Decriptar o token
    const accessToken = decrypt(encryptedToken);

    // 4. Extrair S3 Key da URL
    let s3Key: string;
    try {
      const url = new URL(mediaUrl);
      // Remove o primeiro '/' se houver e o nome do bucket (se incluído no path)
      // Exemplo: /bucketname/path/to/file.ext -> path/to/file.ext
      s3Key = url.pathname.substring(1).replace(`${s3BucketName}/`, '');
      if (!s3Key) throw new Error('Não foi possível extrair a chave S3 da URL.');
      console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Extraída S3 key: ${s3Key} de ${mediaUrl}`);
    } catch (urlError) {
      throw new Error(`URL da mídia inválida (${mediaUrl}): ${urlError instanceof Error ? urlError.message : String(urlError)}`);
    }

    // 5. Baixar arquivo do S3
    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Baixando ${s3Key} do bucket ${s3BucketName}...`);
    let fileBuffer: Buffer;
    try {
      const command = new GetObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
      });
      const { Body } = await s3Client.send(command);

      if (!Body || !(Body instanceof Readable)) {
        throw new Error('Corpo do objeto S3 não é um stream legível.');
      }
      fileBuffer = await streamToBuffer(Body);
       console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Arquivo ${s3Key} baixado (${fileBuffer.length} bytes).`);
    } catch (s3Error) {
      console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Erro ao baixar ${s3Key} do S3:`, s3Error);
      throw new Error(`Falha ao baixar mídia do S3: ${s3Error instanceof Error ? s3Error.message : String(s3Error)}`);
    }

    // 6. Upload para Meta API
     console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Fazendo upload da mídia (${filename}, ${mimeType}) para Meta...`);
    const uploadResult = await uploadWhatsappMedia(
        fileBuffer,
        filename,
        mimeType,
        phoneNumberId,
        accessToken
    );

    if (!uploadResult.success || !uploadResult.mediaId) {
      const uploadErrorMsg = uploadResult.error?.message || 'Erro desconhecido no upload para Meta.';
      console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha no upload para Meta: ${uploadErrorMsg}`);
      throw new Error(`Falha no upload para Meta API: ${uploadErrorMsg}`);
    }
    const mediaId = uploadResult.mediaId;
    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Upload para Meta bem-sucedido. Media ID: ${mediaId}`);

     // 7. Determinar o tipo de mensagem do WhatsApp
    const messageType = getWhatsAppMessageTypeFromMime(mimeType);
    if (!messageType) {
        // Log warning, mas tenta enviar como documento se possível? Ou falha?
        // Por segurança, vamos falhar se o tipo não for mapeado.
        console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Tipo MIME não mapeado para tipo de mensagem WhatsApp: ${mimeType}`);
        throw new Error(`Tipo de mídia não suportado para envio WhatsApp: ${mimeType}`);
    }

    // 8. Enviar mensagem usando Media ID
    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Enviando mensagem com Media ID ${mediaId} (${messageType}) para ${recipientPhoneNumber}...`);
    const sendResult = await sendWhatsappMediaMessage({
      phoneNumberId: phoneNumberId,
      toPhoneNumber: recipientPhoneNumber,
      accessToken: accessToken,
      mediaId: mediaId,
      messageType: messageType,
      caption: caption, // Passar caption se existir
    });

    // 9. Processar o resultado final do envio
    if (sendResult.success) {
      console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Mensagem com Media ID ${mediaId} enviada com sucesso para ${recipientPhoneNumber}. Provider ID: ${sendResult.messageId}`);
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
      const errorMessage = typeof sendResult.error?.message === 'string' ? sendResult.error.message : 'Erro desconhecido no envio final';
      console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha ao enviar mensagem com Media ID ${mediaId} para ${recipientPhoneNumber}. Erro: ${errorMessage}`);
      // Não lançar erro aqui necessariamente, apenas atualiza o status da msg
      await prisma.message.update({
            where: { id: messageId },
            data: {
              status: "FAILED",
              errorMessage: errorMessage.substring(0, 255),
            },
       });
       // Lançar erro para que o BullMQ registre a falha do job
       throw new Error(`Falha no envio final da mídia (Media ID: ${mediaId}): ${errorMessage}`);
    }

  } catch (error: any) {
    // Log aprimorado com mais contexto
    console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Erro processando job ${job?.id} para messageId: ${messageId} (Workspace: ${workspaceId}, Cliente: ${clientPhoneNumber}):`, error.message);
    console.error("Detalhes da Mensagem:", JSON.stringify(messageDetails, null, 2)); // Logar detalhes da msg no erro
    // Atualiza status da mensagem para FAILED se ainda não foi atualizado
     try {
        // Verifica se a mensagem já foi marcada como falha para evitar update desnecessário
        const currentMessage = await prisma.message.findUnique({ where: { id: messageId }, select: { status: true } });
        if (currentMessage?.status !== "FAILED") {
            await prisma.message.update({
                where: { id: messageId },
                data: {
                  status: "FAILED",
                  errorMessage: (error.message || 'Erro inesperado no worker').substring(0, 255),
                },
              });
        }
    } catch (updateError: any) {
        console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha CRÍTICA ao tentar atualizar status da mensagem ${messageId} para FAILED após erro:`, updateError.message);
    }
    // Re-throw para que o BullMQ marque o job como falhado
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

