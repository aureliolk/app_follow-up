import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { pusherServer } from '@/lib/pusher';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { uploadWhatsappMedia, sendWhatsappMediaMessage } from '@/lib/channel/whatsappSender';
import { WHATSAPP_OUTGOING_MEDIA_QUEUE } from '@/lib/queues/whatsappOutgoingMediaQueue';
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, s3BucketName } from '@/lib/s3Client';
import { Readable } from 'stream';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

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

// <<< Lista de tipos de áudio aceitos pela Meta (simplificada, pode refinar) >>>
const WHATSAPP_ACCEPTED_AUDIO_TYPES = [
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg', // Inclui variantes com codecs como opus
  'audio/opus',
];

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
  let tempInputPath: string | null = null; // Para limpeza de arquivos temporários
  let tempOutputPath: string | null = null; // Para limpeza de arquivos temporários

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

    // <<< INÍCIO DA LÓGICA DE CONVERSÃO >>>
    let finalFileBuffer = fileBuffer;
    let finalMimeType = mimeType;
    let finalFilename = filename;
    const targetMimeType = 'audio/ogg'; // O formato OGG com Opus é geralmente uma boa escolha
    const targetExtension = '.ogg';

    const isAudio = mimeType.startsWith('audio/');
    // Verifica se é áudio e se o tipo MIME *base* não está na lista de aceitos
    // (ex: 'audio/ogg; codecs=opus' deve ser tratado como 'audio/ogg' para esta verificação)
    const needsConversion = isAudio && !WHATSAPP_ACCEPTED_AUDIO_TYPES.includes(mimeType.split(';')[0]);

    if (needsConversion) {
      console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Mime type ${mimeType} precisa de conversão para ${targetMimeType}. Iniciando ffmpeg...`);

      const tempId = randomUUID();
      const originalExtension = path.extname(filename) || '.rawaudio'; // Extensão original ou fallback
      tempInputPath = path.join(os.tmpdir(), `${tempId}_input${originalExtension}`);
      tempOutputPath = path.join(os.tmpdir(), `${tempId}_output${targetExtension}`);

      try {
        // Escrever buffer original no arquivo temporário de entrada
        await fs.writeFile(tempInputPath, fileBuffer);
        console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Arquivo temporário de entrada criado: ${tempInputPath}`);

        // Construir e executar comando ffmpeg
        // -i: input file
        // -vn: no video output
        // -acodec libopus: use opus codec
        // -b:a 64k: audio bitrate 64kbps (ajuste se necessário)
        // -vbr on: variable bitrate enabled
        // -compression_level 10: highest compression (0-10)
        // -application voip: optimize for voice audio
        // -y: overwrite output file if exists
        const ffmpegCommand = `ffmpeg -i "${tempInputPath}" -vn -acodec libopus -b:a 64k -vbr on -compression_level 10 -application voip -y "${tempOutputPath}"`;
        console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Executando ffmpeg: ${ffmpegCommand}`);

        execSync(ffmpegCommand, { stdio: 'inherit' }); // Mostra output do ffmpeg nos logs do worker

        console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Conversão ffmpeg concluída: ${tempOutputPath}`);

        // Ler o arquivo convertido de volta para o buffer
        finalFileBuffer = await fs.readFile(tempOutputPath);
        finalMimeType = targetMimeType; // Atualiza o mime type
        // Atualiza o nome do arquivo para ter a extensão correta
        finalFilename = path.basename(filename, path.extname(filename)) + targetExtension;

        console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Arquivo convertido lido (${finalFileBuffer.length} bytes). MimeType: ${finalMimeType}, Filename: ${finalFilename}`);

      } catch (conversionError: any) {
        console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Erro durante a conversão com ffmpeg:`, conversionError);
        // Decide se quer falhar o job ou tentar enviar o original
        // Por segurança, vamos falhar o job se a conversão falhar.
        throw new Error(`Falha ao converter áudio com ffmpeg: ${conversionError.message}`);
      } finally {
        // Limpeza dos arquivos temporários
        if (tempInputPath) {
            try { await fs.unlink(tempInputPath); console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Arquivo temporário de entrada removido: ${tempInputPath}`); }
            catch (unlinkError:any) { console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Aviso: Falha ao remover arquivo temporário de entrada ${tempInputPath}: ${unlinkError.message}`); }
        }
        if (tempOutputPath) {
             try { await fs.unlink(tempOutputPath); console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Arquivo temporário de saída removido: ${tempOutputPath}`); }
             catch (unlinkError:any) { console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Aviso: Falha ao remover arquivo temporário de saída ${tempOutputPath}: ${unlinkError.message}`); }
        }
        tempInputPath = null;
        tempOutputPath = null;
      }
    } else if (isAudio) {
        console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Mime type ${mimeType} já é compatível, conversão não necessária.`);
    }
    // <<< FIM DA LÓGICA DE CONVERSÃO >>>

    // 6. Upload para Meta API (usando os dados finais)
     console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Fazendo upload da mídia (${finalFilename}, ${finalMimeType}) para Meta...`);
    const uploadResult = await uploadWhatsappMedia(
        finalFileBuffer,  // <<< Usar buffer final
        finalFilename,    // <<< Usar nome final
        finalMimeType,    // <<< Usar mime type final
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

     // 7. Determinar o tipo de mensagem do WhatsApp (usando mime type final)
    const messageType = getWhatsAppMessageTypeFromMime(finalMimeType); // <<< Usar mime type final
    if (!messageType) {
        // Log warning, mas tenta enviar como documento se possível? Ou falha?
        // Por segurança, vamos falhar se o tipo não for mapeado.
        console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Tipo MIME final não mapeado para tipo de mensagem WhatsApp: ${finalMimeType}`);
        throw new Error(`Tipo de mídia final não suportado para envio WhatsApp: ${finalMimeType}`);
    }

    // 8. Enviar mensagem usando Media ID
    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Enviando mensagem com Media ID ${mediaId} (${messageType}) para ${recipientPhoneNumber}...`);
    const sendResult = await sendWhatsappMediaMessage({
      phoneNumberId: phoneNumberId,
      toPhoneNumber: recipientPhoneNumber,
      accessToken: accessToken,
      mediaId: mediaId,
      messageType: messageType,
    });

    if (!sendResult.success || !sendResult.wamid) {
      const sendErrorMsg = sendResult.error?.message || 'Erro desconhecido ao enviar mensagem via Meta.';
      console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha ao enviar mensagem: ${sendErrorMsg}`);
      // Atualizar status para FAILED
       const failedUpdate = await prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'FAILED',
          metadata: {
            ...(message.metadata as object || {}),
            error: sendErrorMsg,
            failed_at: new Date().toISOString(),
          },
        },
      });
      const conversationChannelFail = `chat-updates:${failedUpdate.conversation_id}`;
      await pusherServer.trigger(conversationChannelFail, 'message_status_updated', {
        messageId: failedUpdate.id,
        conversation_id: failedUpdate.conversation_id,
        newStatus: 'FAILED',
        errorMessage: sendErrorMsg,
      });
      throw new Error(`Falha ao enviar mensagem WhatsApp: ${sendErrorMsg}`);
    }

    const wamid = sendResult.wamid;
    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Mensagem enviada com sucesso. WAMID: ${wamid}`);

    // 9. Atualizar mensagem no banco para SENT
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'SENT',
        providerMessageId: wamid,
        // Atualizar o content para o caption original ou null se não houver caption
        content: caption || null,
        // Se houve conversão, atualizamos os dados da mídia
        ...(needsConversion && {
            media_mime_type: finalMimeType,
            media_filename: finalFilename,
            // A URL do S3 continua a mesma, mas o conteúdo no S3 é o original.
            // Se precisássemos da URL do arquivo convertido, teríamos que fazer upload dele.
        })
      },
       select: {
           id: true,
           conversation_id: true,
           status: true,
           providerMessageId: true,
           media_url: true,
           content: true,
           media_mime_type: true,
           media_filename: true,
       }
    });
    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Mensagem ${messageId} atualizada para SENT no DB (content: ${updatedMessage.content}).`);

    // 10. Publicar atualização de status no Redis/SSE (INCLUIR media_url e content)
    const conversationChannel = `chat-updates:${updatedMessage.conversation_id}`;
    await pusherServer.trigger(conversationChannel, 'message_status_updated', {
      messageId: updatedMessage.id,
      conversation_id: updatedMessage.conversation_id,
      newStatus: 'SENT',
      providerMessageId: updatedMessage.providerMessageId,
      media_url: updatedMessage.media_url,
      content: updatedMessage.content,
      media_mime_type: updatedMessage.media_mime_type,
      media_filename: updatedMessage.media_filename,
    });
    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Evento message_status_updated (SENT) enviado via Pusher para ${conversationChannel}`);

    console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Job ${job.id} para messageId ${messageId} concluído com sucesso.`);

  } catch (error: any) {
    console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Erro CRÍTICO no job ${job?.id} para messageId ${messageId}:`, error);
    console.error(`Detalhes da mensagem no erro:`, messageDetails); // Log message details on error

    // Tentativa de atualizar status para FAILED se ainda não foi feito
    if (messageId) {
      try {
         const currentMessage = await prisma.message.findUnique({ where: { id: messageId }, select: { status: true } });
         if (currentMessage && currentMessage.status !== 'FAILED') {
            const errorMsgForDb = error.message || 'Erro desconhecido no worker.';
            await prisma.message.update({
                where: { id: messageId },
                data: {
                  status: 'FAILED',
                  metadata: {
                    ...(messageDetails?.metadata as object || {}),
                    error: errorMsgForDb,
                    failed_at: new Date().toISOString(),
                  },
                },
            });
            // Publicar falha no Redis/SSE
            if (workspaceId && clientPhoneNumber && messageDetails?.conversation?.id) {
                 const conversationChannelFail = `chat-updates:${messageDetails.conversation.id}`;
                 await pusherServer.trigger(conversationChannelFail, 'message_status_updated', {
                    messageId: messageId,
                    conversation_id: messageDetails.conversation.id,
                    newStatus: 'FAILED',
                    errorMessage: errorMsgForDb,
                });
                console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Status da mensagem ${messageId} atualizado para FAILED (catch geral) e evento enviado via Pusher.`);
            } else {
                 console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Não foi possível publicar evento FAILED (catch geral) por falta de dados.`);
            }
         } else {
             console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Status da mensagem ${messageId} já era FAILED ou mensagem não encontrada.`);
         }
      } catch (updateError: any) {
        console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha ao tentar atualizar msg ${messageId} para FAILED no bloco catch: ${updateError.message}`);
      }
    }
    // Rethrow para que BullMQ saiba que o job falhou
    throw error;
  } finally {
     // Limpeza final de arquivos temporários caso um erro ocorra após a criação e antes do finally no bloco de conversão
     if (tempInputPath) {
         try { await fs.unlink(tempInputPath); console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Arquivo temporário de entrada removido (finally): ${tempInputPath}`); }
         catch (unlinkError:any) { console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Aviso: Falha ao remover arquivo temporário de entrada (finally) ${tempInputPath}: ${unlinkError.message}`); }
     }
     if (tempOutputPath) {
          try { await fs.unlink(tempOutputPath); console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Arquivo temporário de saída removido (finally): ${tempOutputPath}`); }
          catch (unlinkError:any) { console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Aviso: Falha ao remover arquivo temporário de saída (finally) ${tempOutputPath}: ${unlinkError.message}`); }
     }
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
  // <<< RESULTADO NÃO É USADO DIRETAMENTE AQUI, a publicação ocorre DENTRO do processor >>>
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

