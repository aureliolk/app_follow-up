import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
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

    // 9. Processar o resultado final do envio
    if (sendResult.success) {
      console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Mensagem com Media ID ${mediaId} enviada com sucesso para ${recipientPhoneNumber}. Provider ID: ${sendResult.messageId}`);
      // <<< ATUALIZAR e OBTER DADOS da mensagem para publicar >>>
      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: {
          status: "SENT",
          providerMessageId: sendResult.messageId,
          sentAt: new Date(),
          errorMessage: null,
        },
        // <<< SELECIONAR dados para publicar >>>
        select: {
            id: true,
            conversation_id: true, // Necessário para o canal Redis
            status: true,
            providerMessageId: true,
        }
      });
      console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Status da mensagem ${messageId} atualizado para SENT.`);

      // <<< PUBLICAR ATUALIZAÇÃO DE STATUS (SUCESSO) >>>
      if (updatedMessage.conversation_id) { // Verificar se temos o ID da conversa
          const conversationChannel = `chat-updates:${updatedMessage.conversation_id}`;
          const statusPayload = {
              type: 'message_status_updated',
              payload: {
                  messageId: updatedMessage.id,
                  newStatus: updatedMessage.status as 'SENT',
                  providerMessageId: updatedMessage.providerMessageId,
                  timestamp: new Date().toISOString(),
              }
          };
          await redisConnection.publish(conversationChannel, JSON.stringify(statusPayload));
          console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Publicado status SENT para ${updatedMessage.id} em ${conversationChannel}`);
      } else {
           console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Não foi possível publicar status SENT para msg ${messageId} pois conversation_id não foi encontrado após update.`);
      }

    } else {
      const errorMessage = typeof sendResult.error?.message === 'string' ? sendResult.error.message : 'Erro desconhecido no envio final';
      console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha ao enviar mensagem com Media ID ${mediaId} para ${recipientPhoneNumber}. Erro: ${errorMessage}`);
      // Não lançar erro aqui necessariamente, apenas atualiza o status da msg
      const updatedMessage = await prisma.message.update({ // <<< ATUALIZAR e OBTER DADOS da mensagem para publicar >>>
            where: { id: messageId },
            data: {
              status: "FAILED",
              errorMessage: errorMessage.substring(0, 255),
            },
            // <<< SELECIONAR dados para publicar >>>
             select: {
                id: true,
                conversation_id: true, // Necessário para o canal Redis
                status: true,
                errorMessage: true
            }
       });
       console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Status da mensagem ${messageId} atualizado para FAILED.`);

       // <<< PUBLICAR ATUALIZAÇÃO DE STATUS (FALHA NO ENVIO FINAL) >>>
        if (updatedMessage.conversation_id) { // Verificar se temos o ID da conversa
            const conversationChannel = `chat-updates:${updatedMessage.conversation_id}`;
            const statusPayload = {
                type: 'message_status_updated',
                payload: {
                    messageId: updatedMessage.id,
                    newStatus: updatedMessage.status as 'FAILED',
                    errorMessage: updatedMessage.errorMessage,
                    timestamp: new Date().toISOString(),
                }
            };
            await redisConnection.publish(conversationChannel, JSON.stringify(statusPayload));
            console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Publicado status FAILED (send error) para ${updatedMessage.id} em ${conversationChannel}`);
        } else {
             console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Não foi possível publicar status FAILED para msg ${messageId} pois conversation_id não foi encontrado após update.`);
        }

       // Lançar erro para que o BullMQ registre a falha do job
       throw new Error(`Falha no envio final da mídia (Media ID: ${mediaId}): ${errorMessage}`);
    }

  } catch (error: any) { // <<< Garantir que error seja 'any' ou 'unknown'
    // Log aprimorado com mais contexto
    console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Erro processando job ${job?.id} para messageId: ${messageId} (Workspace: ${workspaceId}, Cliente: ${clientPhoneNumber}):`, error.message);
    console.error("Detalhes da Mensagem (se disponíveis):", JSON.stringify(messageDetails, null, 2)); // Logar detalhes da msg no erro
    console.error("Stack do Erro:", error.stack); // <<< Adicionar log do stack trace

    // Atualiza status da mensagem para FAILED se ainda não foi atualizado
     try {
        // Verifica se a mensagem já foi marcada como falha para evitar update desnecessário
        const currentMessage = await prisma.message.findUnique({ 
             where: { id: messageId }, 
             // <<< SELECIONAR conversation_id para publicar no canal correto >>>
             select: { status: true, conversation_id: true } 
        });

        if (currentMessage && currentMessage.status !== "FAILED" && currentMessage.conversation_id) { // Verifica se currentMessage não é null E TEM conversation_id
            const updatedMessage = await prisma.message.update({
                where: { id: messageId },
                data: {
                  status: "FAILED",
                  errorMessage: (error.message || 'Erro inesperado no worker').substring(0, 255),
                },
                // <<< SELECIONAR dados para publicar >>>
                select: {
                    id: true,
                    conversation_id: true, // <<< ADICIONAR AQUI TAMBÉM
                    status: true,
                    errorMessage: true
                }
              });
             console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Status da mensagem ${messageId} atualizado para FAILED devido ao erro.`);

             // <<< PUBLICAR ATUALIZAÇÃO DE STATUS (FALHA) >>>
             const conversationChannel = `chat-updates:${updatedMessage.conversation_id}`; // Usa o ID da conversa do updatedMessage
             const statusPayload = {
                 type: 'message_status_updated',
                 payload: {
                    messageId: updatedMessage.id,
                    newStatus: updatedMessage.status as 'FAILED',
                    errorMessage: updatedMessage.errorMessage,
                    timestamp: new Date().toISOString(),
                 }
             };
             await redisConnection.publish(conversationChannel, JSON.stringify(statusPayload));
             console.log(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Publicado status FAILED (catch error) para ${updatedMessage.id} em ${conversationChannel}`);

        } else if (!currentMessage) {
             console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Mensagem ${messageId} não encontrada ao tentar atualizar status para FAILED.`);
        }
    } catch (updateError: any) {
        console.error(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Falha CRÍTICA ao tentar atualizar status da mensagem ${messageId} para FAILED após erro:`, updateError.message);
    } finally {
        // <<< Limpeza final dos arquivos temporários em caso de erro >>>
        if (tempInputPath) {
            try { await fs.unlink(tempInputPath); }
            catch (unlinkError:any) { console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Aviso (Error Cleanup): Falha ao remover arquivo temporário de entrada ${tempInputPath}: ${unlinkError.message}`); }
        }
        if (tempOutputPath) {
             try { await fs.unlink(tempOutputPath); }
             catch (unlinkError:any) { console.warn(`[Worker:${WHATSAPP_OUTGOING_MEDIA_QUEUE}] Aviso (Error Cleanup): Falha ao remover arquivo temporário de saída ${tempOutputPath}: ${unlinkError.message}`); }
        }
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

