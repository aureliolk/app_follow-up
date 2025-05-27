// lib/workers/messageProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { MessageSenderType, Prisma } from '@prisma/client'; // Adicionar Prisma
import { CoreMessage } from 'ai'; // Tipo para Vercel AI SDK
// Importar função de descriptografia
import { decrypt } from '@/lib/encryption';
// <<< Novas importações >>>
import { getWhatsappMediaUrl } from '@/lib/channel/whatsappUtils';
import { s3Client, s3BucketName } from '@/lib/s3Client';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { lookup } from 'mime-types'; // Para obter extensão do mime type
// <<< Adicionar importações das funções de IA >>>
import { describeImage } from '@/lib/ai/describeImage';
import { transcribeAudio } from '@/lib/ai/transcribeAudio';
import { Readable } from 'stream';
import { processAIChat } from '../ai/chatService';

// Import Pusher server to notify real-time clients
import pusher from '@/lib/pusher';
// <<< Importar Channel Service >>>
import { sendWhatsAppMessage } from '../services/channelService';
// <<< Importar Carregador de Ferramentas >>>
import { sendEvolutionMessage } from '../services/channelService';

const QUEUE_NAME = 'message-processing';
const BUFFER_TIME_MS = 3000; // 3 segundos de buffer (ajuste se necessário)
const HISTORY_LIMIT = 20;   // Número máximo de mensagens no histórico para IA

interface JobData {
  conversationId: string;
  clientId: string;
  newMessageId: string;    // ID da mensagem do cliente que disparou ESTE job
  workspaceId: string;
  receivedTimestamp: number; // Timestamp de quando o webhook recebeu a mensagem
  delayBetweenMessages: number; // Delay entre mensagens
}

// Type guard for valid media metadata
const hasValidMetadata = (meta: any): meta is { mediaId: string; mimeType: string; [key: string]: any } => {
    return meta && typeof meta === 'object' && typeof meta.mediaId === 'string' && typeof meta.mimeType === 'string';
};

// Type for Message including the new field for select
type MessageWithAnalysis = Prisma.MessageGetPayload<{
    select: {
        id: true,
        conversation_id: true,
        sender_type: true,
        content: true,
        ai_media_analysis: true, // <<< Included
        timestamp: true,
        channel_message_id: true,
        metadata: true,
        media_url: true,
        media_mime_type: true,
        media_filename: true,
        status: true
    }
}>;

async function processJob(job: Job<JobData>) {
  const { conversationId, clientId, newMessageId, workspaceId, receivedTimestamp } = job.data;
  const jobId = job.id || 'unknown';
  console.log(`\n--- [MsgProcessor ${jobId}] INÍCIO ---`);
  console.log(`[MsgProcessor ${jobId}] Processando msg ${newMessageId} para Conv ${conversationId}, Cliente ${clientId}, Wks ${workspaceId}`);

  try {
    // --- 1. Buffer Inicial ---
    console.log(`[MsgProcessor ${jobId}] Aguardando ${BUFFER_TIME_MS}ms (buffer)...`);
    await new Promise(resolve => setTimeout(resolve, BUFFER_TIME_MS));
    console.log(`[MsgProcessor ${jobId}] Buffer inicial concluído.`);

    // --- 2. Buscar Dados Essenciais ---
    console.log(`[MsgProcessor ${jobId}] Buscando dados da mensagem ${newMessageId} e conversa ${conversationId}...`);
    const currentMessage = await prisma.message.findUnique({
        where: { id: newMessageId },
        // Select needed fields including the new ai_media_analysis
        select: {
            id: true,
            content: true,
            metadata: true,
            media_url: true, // Pre-existing media URL? Unlikely for incoming WPP but check
            media_mime_type: true,
            media_filename: true,
            ai_media_analysis: true, // <<< Select the new field
            status: true,
            sender_type: true,
            timestamp: true,
            channel_message_id: true,
            conversation: {
                select: { // Select necessary fields from conversation, client, and workspace
                    id: true,
                    is_ai_active: true,
                    channel: true,
                    status: true,
                    metadata: true,
                    client: {
                        select: {
                            id: true,
                            phone_number: true,
                            name: true,
                        }
                    },
                    workspace_id: true,
                    workspace: {
                        select: {
                            id: true,
                            ai_default_system_prompt: true,
                            ai_model_preference: true,
                            ai_name: true,
                            whatsappAccessToken: true,
                            whatsappPhoneNumberId: true,
                            // <<< Adicionar campos da Evolution API >>>
                            evolution_api_instance_name: true,
                            evolution_api_token: true 
                        }
                    }
                }
            }
        }
    });

    // --- Validations ---
    if (!currentMessage || !currentMessage.conversation) {
      console.error(`[MsgProcessor ${jobId}] Erro: Mensagem ${newMessageId} ou sua conversa não encontrada.`);
      throw new Error(`Mensagem ${newMessageId} ou conversa associada não encontrada.`);
    }
    if (!currentMessage.conversation.workspace) {
         console.error(`[MsgProcessor ${jobId}] Erro: Workspace associado à conversa ${conversationId} não encontrado.`);
         throw new Error(`Workspace para a conversa ${conversationId} não encontrado.`);
    }
    if (!currentMessage.conversation.client || !currentMessage.conversation.client.phone_number) {
         console.error(`[MsgProcessor ${jobId}] Erro: Cliente ou telefone do cliente não encontrado para Conv ${conversationId}.`);
         throw new Error(`Cliente ou telefone não encontrado para a conversa ${conversationId}.`);
    }

    const conversationData = currentMessage.conversation;
    const { channel, client, workspace } = conversationData;
    const clientPhoneNumber = client.phone_number;
    console.log(`[MsgProcessor ${jobId}] Dados lidos do DB. Canal: ${channel}`);

    if (!conversationData.is_ai_active) {
      console.log(`[MsgProcessor ${jobId}] IA inativa para conversa ${conversationId}. Pulando.`);
      return { status: 'skipped', handledBatch: false, reason: 'IA inativa' };
    }
    console.log(`[MsgProcessor ${jobId}] IA está ativa.`);

    // --- 3. Lógica Debounce/Batch --- 
     const lastAiMessage = await prisma.message.findFirst({ where: { conversation_id: conversationId, sender_type: MessageSenderType.AI }, orderBy: { timestamp: 'desc' }, select: { timestamp: true } });
     const fetchMessagesSince = lastAiMessage?.timestamp || new Date(0);
     console.log(`[MsgProcessor ${jobId}] Buscando mensagens do cliente desde: ${fetchMessagesSince.toISOString()}`);
     const newClientMessages = await prisma.message.findMany({ where: { conversation_id: conversationId, sender_type: MessageSenderType.CLIENT, timestamp: { gt: fetchMessagesSince } }, orderBy: { timestamp: 'asc' }, select: { id: true } });

     let shouldProcessBatch = false;
     if (newClientMessages.length > 0 && newMessageId === newClientMessages[newClientMessages.length - 1].id) {
        console.log(`[MsgProcessor ${jobId}] ESTE JOB (msg ${newMessageId}) É O RESPONSÁVEL PELO LOTE.`);
        shouldProcessBatch = true;
     } else {
        console.log(`[MsgProcessor ${jobId}] Nenhuma msg nova ou job não é o mais recente. Processamento IA será pulado.`);
     }

    // --- 4. Processar Mídia (Download, S3, IA) --- 
    let updatedMessageData: MessageWithAnalysis | null = null; // To store the updated message if media is processed
    let aiAnalysisResult: string | null = null; // Stores AI description/transcription
    let finalContentForDb: string | null = currentMessage.content; // Placeholder for DB, starts as original
    let mediaS3Url: string | null = null; // Definido fora para ser acessível depois
    let s3Key: string | null = null;     // Definido fora para ser acessível depois

    if (channel === 'WHATSAPP_CLOUDAPI') {
        const { whatsappAccessToken } = workspace;
        const metadataFromMessage = currentMessage.metadata; // Usar uma variável local para clareza
        const hasWppMedia = hasValidMetadata(metadataFromMessage); 

        if (hasWppMedia && whatsappAccessToken && metadataFromMessage.mediaId && metadataFromMessage.mimeType) { 
            console.log(`[MsgProcessor ${jobId}] Mídia WhatsApp detectada (ID: ${metadataFromMessage.mediaId}, Tipo: ${metadataFromMessage.mimeType}). Iniciando processamento...`);
            
            try {
                // --- Parte A: Obter URL e Baixar Mídia (WhatsApp) ---
                const decryptedAccessTokenForMedia = decrypt(whatsappAccessToken);
                if (!decryptedAccessTokenForMedia) throw new Error("Falha ao descriptografar token de acesso para mídia WhatsApp.");

                const mediaUrlString = await getWhatsappMediaUrl(metadataFromMessage.mediaId, decryptedAccessTokenForMedia);
                if (!mediaUrlString) {
                    throw new Error(`Falha ao obter URL de mídia WhatsApp para ID ${metadataFromMessage.mediaId}.`);
                }
                console.log(`[MsgProcessor ${jobId}] Baixando mídia WhatsApp de: ${mediaUrlString}`);
                const downloadResponse = await axios.get(mediaUrlString, {
                    responseType: 'arraybuffer',
                    headers: { Authorization: `Bearer ${decryptedAccessTokenForMedia}` },
                });
                const mediaBuffer = Buffer.from(downloadResponse.data);
                if (!mediaBuffer || mediaBuffer.length === 0) throw new Error("Falha no download da mídia WhatsApp (buffer vazio ou inválido).");

                // --- Parte B: Upload S3 (WhatsApp) ---
                s3Key = `whatsapp-media/${workspace.id}/${conversationId}/${newMessageId}${lookup(metadataFromMessage.mimeType) ? '.' + lookup(metadataFromMessage.mimeType) : ''}`;
                console.log(`[MsgProcessor ${jobId}] Fazendo upload (WhatsApp) para S3: Bucket=${s3BucketName}, Key=${s3Key}, ContentType=${metadataFromMessage.mimeType}`);
                await s3Client.send(new PutObjectCommand({
                    Bucket: s3BucketName,
                    Key: s3Key,
                    Body: mediaBuffer,
                    ContentType: metadataFromMessage.mimeType,
                }));
                const storageEndpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, '');
                mediaS3Url = `${storageEndpoint}/${s3BucketName}/${s3Key}`;
                console.log(`[MsgProcessor ${jobId}] Upload S3 (WhatsApp) concluído. URL: ${mediaS3Url}`);

                // --- Parte C: Processamento IA (WhatsApp) ---
                const mediaType = metadataFromMessage.mimeType.split('/')[0];
                finalContentForDb = `[${mediaType === 'image' ? 'Imagem' : mediaType === 'audio' ? 'Áudio' : mediaType === 'video' ? 'Vídeo' : 'Mídia'} Recebida]`;

                try {
                    console.log(`[MsgProcessor ${jobId}] Tentando processar mídia WhatsApp com IA (${metadataFromMessage.mimeType})...`);
                    if (mediaType === 'image') {
                        aiAnalysisResult = await describeImage(mediaBuffer);
                        console.log(`[MsgProcessor ${jobId}] Imagem WhatsApp descrita pela IA.`);
                    } else if (mediaType === 'audio' && metadataFromMessage.mimeType) {
                        aiAnalysisResult = await transcribeAudio(mediaBuffer, metadataFromMessage.mimeType, undefined, 'pt');
                        console.log(`[MsgProcessor ${jobId}] Áudio WhatsApp transcrito pela IA.`);
                    } else {
                        console.warn(`[MsgProcessor ${jobId}] Tipo de mídia WhatsApp ${mediaType} não suportado para processamento IA.`);
                        aiAnalysisResult = `[Tipo de mídia ${mediaType} não processado pela IA]`;
                    }
                } catch (aiError: any) {
                    console.error(`[MsgProcessor ${jobId}] Erro ao processar mídia WhatsApp com IA:`, aiError.message);
                    aiAnalysisResult = `[Erro no processamento IA: ${aiError.message}]`;
                    finalContentForDb = `[${mediaType} Recebido(a) (Erro IA)]`;
                }

                // --- Parte D: Atualizar Mensagem no Banco (WhatsApp) ---
                console.log(`[MsgProcessor ${jobId}] Atualizando mensagem WhatsApp ${newMessageId} no DB com content: "${finalContentForDb}", mediaUrl: ${mediaS3Url}, ai_media_analysis: "${aiAnalysisResult?.substring(0, 50)}..."`);
                const filename = (metadataFromMessage as any)?.whatsappMessage?.document?.filename ||
                                 (metadataFromMessage as any)?.whatsappMessage?.video?.filename ||
                                 (metadataFromMessage as any)?.whatsappMessage?.image?.filename ||
                                 null;

                updatedMessageData = await prisma.message.update({
                    where: { id: newMessageId },
                    data: {
                        content: finalContentForDb,
                        ai_media_analysis: aiAnalysisResult,
                        media_url: mediaS3Url,
                        media_mime_type: metadataFromMessage.mimeType,
                        media_filename: filename,
                        status: 'RECEIVED',
                        metadata: {
                            ...(metadataFromMessage || {}),
                            internalProcessing: {
                               mediaS3Url: mediaS3Url,
                               s3Key: s3Key,
                               uploadedToS3: true,
                               s3ContentType: metadataFromMessage.mimeType,
                               processedByAI: !!aiAnalysisResult && !aiAnalysisResult?.includes('[Erro'),
                               aiProcessingError: !!aiAnalysisResult && aiAnalysisResult?.includes('[Erro')
                            }
                        }
                    },
                    select: { 
                        id: true, conversation_id: true, sender_type: true, content: true, ai_media_analysis: true,
                        timestamp: true, channel_message_id: true, metadata: true, media_url: true,
                        media_mime_type: true, media_filename: true, status: true
                    }
                });
                console.log(`[MsgProcessor ${jobId}] Mensagem WhatsApp ${newMessageId} atualizada no DB após processamento de mídia.`);

            } catch (mediaError: any) {
                console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO no processamento de mídia WhatsApp para msg ${newMessageId}:`, mediaError);
                try {
                    const mediaTypeOnError = (metadataFromMessage as any)?.mimeType?.split('/')[0] || 'Mídia'; // Cast aqui também por segurança
                    finalContentForDb = `[${mediaTypeOnError} Recebida (Falha Processamento)]`;
                    aiAnalysisResult = `[Erro crítico no pipeline de mídia WhatsApp: ${mediaError.message}]`;
                    updatedMessageData = await prisma.message.update({
                        where: { id: newMessageId },
                        data: {
                            content: finalContentForDb,
                            ai_media_analysis: aiAnalysisResult,
                            status: 'FAILED_PROCESSING',
                            media_url: mediaS3Url, 
                            metadata: {
                                ...(metadataFromMessage || {}),
                                internalProcessingError: mediaError.message,
                                processedByAI: false,
                                aiProcessingError: true
                            }
                        },
                        select: {
                            id: true, conversation_id: true, sender_type: true, content: true, ai_media_analysis: true,
                            timestamp: true, channel_message_id: true, metadata: true, media_url: true,
                            media_mime_type: true, media_filename: true, status: true
                        }
                    });
                } catch (updateError: any) {
                    console.error(`[MsgProcessor ${jobId}] Falha GRAVE ao atualizar status de erro para msg WhatsApp ${newMessageId}:`, updateError);
                }
            }
        } else {
            console.log(`[MsgProcessor ${jobId}] Mensagem WhatsApp ${newMessageId} não contém mídia válida (mediaId/mimeType) ou token de acesso ausente. Pulando processamento de mídia.`);
        }

    } else if (channel === 'WHATSAPP_EVOLUTION') {
        const evolutionMediaUrl = (currentMessage.metadata as any)?.mediaUrl as string | undefined;
        const evolutionMimeType = (currentMessage.metadata as any)?.mediaType as string | undefined; // No webhook, salvamos como 'mediaType'
        const evolutionMediaBase64 = (currentMessage.metadata as any)?.mediaData_base64 as string | undefined;

        let mediaBuffer: Buffer | null = null;

        if (evolutionMediaBase64 && evolutionMimeType) {
            console.log(`[MsgProcessor ${jobId}] Mídia Evolution detectada (via base64 nos metadados). Tipo: ${evolutionMimeType}. Decodificando...`);
            try {
                mediaBuffer = Buffer.from(evolutionMediaBase64, 'base64');
                if (!mediaBuffer || mediaBuffer.length === 0) {
                    console.warn(`[MsgProcessor ${jobId}] Falha ao decodificar mediaData_base64 ou buffer resultante vazio. Tentando fallback para URL.`);
                    mediaBuffer = null; // Resetar para tentar o download via URL
                } else {
                    console.log(`[MsgProcessor ${jobId}] Mídia Evolution decodificada de base64 com sucesso (${mediaBuffer.length} bytes).`);
                }
            } catch (base64Error: any) {
                console.error(`[MsgProcessor ${jobId}] Erro ao decodificar mediaData_base64: ${base64Error.message}. Tentando fallback para URL.`);
                mediaBuffer = null; // Resetar para tentar o download via URL
            }
        }
        

        if (mediaBuffer && evolutionMimeType) { // Prosseguir somente se tivermos um buffer e mimetype
            console.log(`[MsgProcessor ${jobId}] Processando mídia Evolution (Buffer: ${mediaBuffer.length} bytes, Tipo: ${evolutionMimeType}).`);
            // A lógica original de try/catch para Upload S3, Processamento IA e Atualização no Banco
            // permanece, mas agora ela opera sobre o 'mediaBuffer' obtido acima.

            try {
                // --- Parte B: Upload S3 (Evolution) ---
                // Usar o ID da mensagem original da Evolution se disponível, senão o ID da nossa mensagem
                const originalMessageId = (currentMessage.metadata as any)?.messageIdFromProvider || newMessageId;
                s3Key = `evolution-media/${workspace.id}/${conversationId}/${originalMessageId}${lookup(evolutionMimeType) ? '.' + lookup(evolutionMimeType) : ''}`;
                console.log(`[MsgProcessor ${jobId}] Fazendo upload (Evolution) para S3: Bucket=${s3BucketName}, Key=${s3Key}, ContentType=${evolutionMimeType}`);
                await s3Client.send(new PutObjectCommand({
                    Bucket: s3BucketName,
                    Key: s3Key,
                    Body: mediaBuffer,
                    ContentType: evolutionMimeType,
                }));
                const storageEndpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, '');
                mediaS3Url = `${storageEndpoint}/${s3BucketName}/${s3Key}`;
                console.log(`[MsgProcessor ${jobId}] Upload S3 (Evolution) concluído. URL: ${mediaS3Url}`);

                // --- Parte C: Processamento IA (Evolution) ---
                const mediaType = evolutionMimeType.split('/')[0];
                finalContentForDb = `[${mediaType === 'image' ? 'Imagem' : mediaType === 'audio' ? 'Áudio' : mediaType === 'video' ? 'Vídeo' : 'Mídia'} Recebida]`;

                try {
                    console.log(`[MsgProcessor ${jobId}] Tentando processar mídia Evolution com IA (${evolutionMimeType})...`);
                    if (mediaType === 'image') {
                        aiAnalysisResult = await describeImage(mediaBuffer);
                        console.log(`[MsgProcessor ${jobId}] Imagem Evolution descrita pela IA.`);
                    } else if (mediaType === 'audio' && evolutionMimeType) {
                        // Se a Evolution API já fornecer 'seconds' nos metadados, poderíamos usá-lo.
                        // Por enquanto, o transcribeAudio não o usa diretamente, mas o filetype é importante.
                        aiAnalysisResult = await transcribeAudio(mediaBuffer, evolutionMimeType, undefined, 'pt');
                        console.log(`[MsgProcessor ${jobId}] Áudio Evolution transcrito pela IA.`);
                    } else {
                        console.warn(`[MsgProcessor ${jobId}] Tipo de mídia Evolution ${mediaType} não suportado para processamento IA.`);
                        aiAnalysisResult = `[Tipo de mídia ${mediaType} não processado pela IA]`;
                    }
                } catch (aiError: any) {
                    console.error(`[MsgProcessor ${jobId}] Erro ao processar mídia Evolution com IA:`, aiError.message);
                    aiAnalysisResult = `[Erro no processamento IA: ${aiError.message}]`;
                    finalContentForDb = `[${mediaType} Recebido(a) (Erro IA)]`;
                }
                
                // --- Parte D: Atualizar Mensagem no Banco (Evolution) ---
                console.log(`[MsgProcessor ${jobId}] Atualizando mensagem Evolution ${newMessageId} no DB com content: "${finalContentForDb}", mediaUrl: ${mediaS3Url}, ai_media_analysis: "${aiAnalysisResult?.substring(0, 50)}..."`);
                // Para Evolution, o nome do arquivo pode não estar facilmente acessível nos metadados padronizados.
                // Se o webhook salvar 'fileName' ou 'caption' no metadata, poderíamos buscá-lo aqui.
                const evolutionFilename = (currentMessage.metadata as any)?.fileName || (currentMessage.metadata as any)?.caption || null;


                updatedMessageData = await prisma.message.update({
                    where: { id: newMessageId },
                    data: {
                        content: finalContentForDb,
                        ai_media_analysis: aiAnalysisResult,
                        media_url: mediaS3Url,
                        media_mime_type: evolutionMimeType,
                        media_filename: evolutionFilename, // Usar o que estiver disponível
                        status: 'RECEIVED',
                        metadata: {
                            ...(typeof currentMessage.metadata === 'object' && currentMessage.metadata !== null ? currentMessage.metadata : {}), // Preservar metadados originais
                            internalProcessing: { // Adicionar informações do nosso processamento
                               mediaS3Url: mediaS3Url,
                               s3Key: s3Key,
                               uploadedToS3: true,
                               s3ContentType: evolutionMimeType,
                               downloadedFromEvolutionUrl: evolutionMediaUrl, // Guardar a URL original da Evolution
                               processedByAI: !!aiAnalysisResult && !aiAnalysisResult?.includes('[Erro'),
                               aiProcessingError: !!aiAnalysisResult && aiAnalysisResult?.includes('[Erro')
                            }
                        }
                    },
                    select: { 
                        id: true, conversation_id: true, sender_type: true, content: true, ai_media_analysis: true,
                        timestamp: true, channel_message_id: true, metadata: true, media_url: true,
                        media_mime_type: true, media_filename: true, status: true
                    }
                });
                console.log(`[MsgProcessor ${jobId}] Mensagem Evolution ${newMessageId} atualizada no DB após processamento de mídia.`);

            } catch (mediaError: any) {
                console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO no processamento de mídia Evolution para msg ${newMessageId}:`, mediaError);
                try {
                    const mediaTypeOnError = evolutionMimeType?.split('/')[0] || 'Mídia';
                    finalContentForDb = `[${mediaTypeOnError} Recebida (Falha Processamento)]`;
                    aiAnalysisResult = `[Erro crítico no pipeline de mídia Evolution: ${mediaError.message}]`;
                    updatedMessageData = await prisma.message.update({
                        where: { id: newMessageId },
                        data: {
                            content: finalContentForDb,
                            ai_media_analysis: aiAnalysisResult,
                            status: 'FAILED_PROCESSING',
                            media_url: mediaS3Url, // Pode ser null se falhou antes do upload S3
                            metadata: {
                                ...(typeof currentMessage.metadata === 'object' && currentMessage.metadata !== null ? currentMessage.metadata : {}), // Usar currentMessage.metadata aqui para preservar tudo
                                internalProcessingError: mediaError.message,
                                originalEvolutionMediaUrl: evolutionMediaUrl, // Guardar a URL original mesmo em erro
                                processedByAI: false,
                                aiProcessingError: true
                            }
                        },
                        select: {
                            id: true, conversation_id: true, sender_type: true, content: true, ai_media_analysis: true,
                            timestamp: true, channel_message_id: true, metadata: true, media_url: true,
                            media_mime_type: true, media_filename: true, status: true
                        }
                    });
                } catch (updateError: any) {
                    console.error(`[MsgProcessor ${jobId}] Falha GRAVE ao atualizar status de erro para msg Evolution ${newMessageId}:`, updateError);
                }
            }
        } else {
            console.log(`[MsgProcessor ${jobId}] Mensagem Evolution ${newMessageId} não contém mediaUrl ou mediaType válidos nos metadados. Pulando processamento de mídia.`);
        }
    } else {
         console.log(`[MsgProcessor ${jobId}] Canal ${channel} não é WhatsApp Cloud ou Evolution, ou mensagem ${newMessageId} não requer processamento de mídia. Pulando.`);
    }


    // --- 5. Preparar Histórico para IA de Resposta ---
    console.log(`[MsgProcessor ${jobId}] Buscando histórico (${HISTORY_LIMIT} mensagens) para a conversa ${conversationId}...`);
    const history = await prisma.message.findMany({
        where: { conversation_id: conversationId },
        orderBy: { timestamp: 'desc' },
        take: HISTORY_LIMIT,
        select: {
            id: true,
            sender_type: true,
            content: true,
            ai_media_analysis: true, // <<< Select analysis for history formatting
            media_url: true,         // <<< Select media_url to identify media messages
            media_mime_type: true,   // <<< Select mime_type for context
            timestamp: true,
        },
    });
    const orderedHistory = history.reverse();
    console.log(`[MsgProcessor ${jobId}] Histórico carregado com ${orderedHistory.length} mensagens.`);

    // --- 6. Formatar Mensagens para Vercel AI SDK (Multimodal) ---
    const aiMessagesPromises = orderedHistory.map(async (msg): Promise<CoreMessage> => {

        if (msg.sender_type === MessageSenderType.CLIENT) {
            // --- Mensagens do CLIENTE --- 
            if (msg.media_url && msg.media_mime_type?.startsWith('image/')) {
                 // Cliente enviou IMAGEM
                console.log(`[MsgProcessor ${jobId}] Formatando msg CLIENTE ${msg.id} como multimodal (imagem). Buscando buffer...`);
                try {
                    const s3Url = msg.media_url;
                    const urlParts = new URL(s3Url);
                    const s3Key = urlParts.pathname.substring(1).replace(`${s3BucketName}/`, '');
                    if (!s3Key) throw new Error(`Não foi possível extrair a chave S3 de ${s3Url}`);

                    console.log(`[MsgProcessor ${jobId}] Baixando imagem ${s3Key} do S3 para IA...`);
                    const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
                    const { Body } = await s3Client.send(command);
                    if (!Body || !(Body instanceof Readable)) throw new Error('Corpo do objeto S3 não é um stream legível.');
                    const imageBuffer = await streamToBuffer(Body);
                    console.log(`[MsgProcessor ${jobId}] Buffer da imagem ${s3Key} obtido (${imageBuffer.length} bytes).`);

                    return {
                        role: 'user', // Explicitamente 'user'
                        content: [
                            { type: 'text', text: msg.content || '[Imagem Enviada pelo Cliente]' },
                            { type: 'image', image: imageBuffer }
                        ]
                    };
                } catch (fetchError: any) {
                    console.error(`[MsgProcessor ${jobId}] Falha ao buscar/processar imagem ${msg.media_url} do S3 para IA: ${fetchError.message}. Enviando apenas texto.`);
                    return {
                        role: 'user', // Explicitamente 'user'
                        content: msg.content || '[Imagem Enviada pelo Cliente (Falha ao carregar para IA)]' || '', // Ensure content is string
                    };
                }
            } else if (msg.media_url && msg.media_mime_type?.startsWith('audio/')) {
                // Cliente enviou ÁUDIO
                if (msg.ai_media_analysis) {
                     return {
                         role: 'user', // Explicitamente 'user'
                         content: `${msg.content || '[Áudio Enviado pelo Cliente]'}\n[Transcrição Interna: ${msg.ai_media_analysis}]`
                     };
                 } else {
                     return {
                         role: 'user', // Explicitamente 'user'
                         content: msg.content || '[Áudio Enviado pelo Cliente (Sem transcrição)]' || '', // Ensure content is string
                     };
                 }
            } else {
                 // Cliente enviou TEXTO
                 return {
                     role: 'user', // Explicitamente 'user'
                     content: msg.content || '' // Ensure content is string
                 };
            }
        } else {

             return {
                 role: 'assistant',
                 content: msg.content || '' // Ensure content is string
             };
        }
    });

    // Aguardar todas as promises de formatação (devido ao download S3 assíncrono)
    const aiMessages = await Promise.all(aiMessagesPromises);
    console.log(`[MsgProcessor ${jobId}] Mensagens formatadas para IA (multimodal):`, JSON.stringify(aiMessages.slice(-5).map(m => ({ role: m.role, content: Array.isArray(m.content) ? m.content.map(c => c.type === 'text' ? { type: 'text', text: c.text.substring(0, 50)+'...' } : { type: c.type }) : typeof m.content === 'string' ? m.content.substring(0,100)+'...' : m.content })), null, 2)); // Log formatado

    // --- 7. Obter Prompt e Modelo ---
    const modelId = workspace.ai_model_preference || 'gpt-4o';
    const systemPrompt = workspace.ai_default_system_prompt ?? undefined;
    
    // Variável para armazenar resposta FINAL da IA
    let finalAiResponseText: string | null = null; // Alterado nome para clareza

    try {
      let aiResult = await processAIChat(aiMessages, workspace.id, conversationId, true, modelId, systemPrompt);

      // When streamMode is true, aiResult is a ReadableStream.
      // We need to consume the stream to get the final text.
      console.log(`[MsgProcessor ${jobId}] Consumindo stream da IA...`);
      const reader = (aiResult as ReadableStream<any>).getReader();
      let accumulatedText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // --- Modificação: Processar apenas chunks de texto --- 
        // O stream pode conter diferentes tipos de chunks. Queremos apenas o texto da resposta final.
        // Chunks de texto final geralmente vêm como strings ou objetos com 'text' / 'textDelta'

        if (typeof value === 'string') {
           // Este caso pode acontecer para compatibilidade, embora menos comum com streams estruturados
           accumulatedText += value;
        } else if (value && typeof value === 'object') {
            // Chunks estruturados
            if (value.type === 'text-delta' && typeof value.textDelta === 'string') {
                // Chunks de texto incremental (mais comum)
                accumulatedText += value.textDelta;
            } else if (value.type === 'text' && typeof value.text === 'string') {
                 // Chunks de texto completos (menos comum, mas possível)
                 accumulatedText += value.text;
            } else {
                // Ignorar outros tipos de chunks (tool-call, tool-result, step-start, etc.)
                // Mas vamos logar para depuração, se necessário
                // console.warn(`[MsgProcessor ${jobId}] Ignorando chunk de stream tipo: ${value.type}`, value);
            }
        } else {
            // Logar quaisquer outros chunks inesperados não-objetos
            console.warn(`[MsgProcessor ${jobId}] Chunk de stream inesperado (não string/objeto):`, value);
        }
      }
      finalAiResponseText = accumulatedText;
      console.log(`[MsgProcessor ${jobId}] Stream da IA consumido. Texto final: ${finalAiResponseText?.substring(0, 100)}...`);
      
    } catch (aiError) {
       console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO durante o processamento com IA (chamada ou ferramentas):`, aiError);
       throw aiError;
    }
    
    // --- 9. Salvar e Enviar Resposta da IA ---
    if (finalAiResponseText) {
      // Dividir o texto em parágrafos (dividir por duas quebras de linha)
      const paragraphs = finalAiResponseText.split(/\n\s*\n/).filter(p => p.trim() !== '');

      console.log(`[MsgProcessor ${jobId}] Resposta da IA dividida em ${paragraphs.length} parágrafos.`);

      for (const [index, paragraph] of paragraphs.entries()) {
        if (!paragraph.trim()) continue; // Pular parágrafos vazios ou só com espaço

        const messageTimestamp = new Date(); // Timestamp para esta parte da mensagem

        try {
          // Criar uma nova mensagem para este parágrafo no banco
          const newMessage = await prisma.message.create({
            data: {
              conversation_id: conversationId,
              sender_type: MessageSenderType.AI,
              content: paragraph.trim(), // Salvar o conteúdo do parágrafo
              timestamp: messageTimestamp,
              status: 'PENDING', // Começa como pendente
              // Outros campos como metadata, etc., podem ser adicionados se necessário
            },
            select: { id: true, conversation_id: true, content: true, timestamp: true, sender_type: true, status: true } // Select for publish and update
          });
          console.log(`[MsgProcessor ${jobId}] Parágrafo ${index + 1}/${paragraphs.length} da IA salvo (ID: ${newMessage.id}).`);

          // --- Adicionar Delay Configurable entre parágrafos ---
          const delayBetweenParts = job.data.delayBetweenMessages || 500; // Usar delay do job ou default 500ms
          if (delayBetweenParts > 0 && index < paragraphs.length - 1) { // Apenas se não for o último parágrafo
             console.log(`[MsgProcessor ${jobId}] Aguardando ${delayBetweenParts}ms antes do próximo parágrafo.`);
             await new Promise(resolve => setTimeout(resolve, delayBetweenParts));
             console.log(`[MsgProcessor ${jobId}] Delay entre parágrafos concluído.`);
          }
          // --- Fim do Delay ---

          // Publicar notificação no canal Pusher do WORKSPACE para a UI
          try {
            const pusherPayload = JSON.stringify({ type: "new_message", payload: {
                id: newMessage.id,
                conversation_id: newMessage.conversation_id,
                sender_type: newMessage.sender_type,
                content: newMessage.content,
                status: newMessage.status,
                timestamp: newMessage.timestamp.toISOString(),
                media_url: null, media_mime_type: null, media_filename: null, metadata: null, // Outros campos comuns
            }});
            const workspaceChannel = `private-workspace-${workspaceId}`;
            await pusher.trigger(workspaceChannel, 'new_message', pusherPayload);
            console.log(`[MsgProcessor ${jobId}] Parágrafo ${index + 1} da IA (${newMessage.id}) publicado via Pusher no canal ${workspaceChannel}.`);
          } catch (pusherError) {
            console.error(`[MsgProcessor ${jobId}] Erro ao publicar parágrafo ${index + 1} (${newMessage.id}) via Pusher:`, pusherError);
          }

          // Enviar esta parte da resposta via Canal (WhatsApp/Evolution)
          let sendResult: { success: boolean; wamid?: string; messageId?: string; error?: any } | undefined; // Declare sendResult here

          try {
            console.log(`[MsgProcessor ${jobId}] STEP 9: Sending paragraph ${index + 1} via Channel. Channel: ${channel}`);

            if (channel === 'WHATSAPP' || channel === 'WHATSAPP_CLOUDAPI') {
              const { whatsappPhoneNumberId, whatsappAccessToken } = workspace;
              if (whatsappAccessToken && whatsappPhoneNumberId && clientPhoneNumber) {
                sendResult = await sendWhatsAppMessage(
                  whatsappPhoneNumberId,
                  clientPhoneNumber,
                  whatsappAccessToken,
                  paragraph.trim(), // Enviar apenas o parágrafo atual
                  workspace.ai_name || undefined
                );
                 console.log(`[MsgProcessor ${jobId}] Resultado do envio WhatsApp Cloud API para parágrafo ${index + 1}:`, sendResult);
              } else {
                console.error(`[MsgProcessor ${jobId}] Missing data for WhatsApp Cloud API send for paragraph ${index + 1} (Token: ${!!whatsappAccessToken}, PhoneID: ${!!whatsappPhoneNumberId}, ClientPhone: ${!!clientPhoneNumber}).`);
                 sendResult = { success: false, error: "Dados de configuração do canal ausentes." };
              }
            } else if (channel === 'WHATSAPP_EVOLUTION') {
              const { evolution_api_instance_name, evolution_api_token } = workspace;
              const apiKeyToUse = evolution_api_token;
              if (apiKeyToUse && evolution_api_instance_name && clientPhoneNumber) {
                 sendResult = await sendEvolutionMessage({
                    endpoint: process.env.apiUrlEvolution,
                    apiKey: apiKeyToUse,
                    instanceName: evolution_api_instance_name,
                    toPhoneNumber: clientPhoneNumber,
                    messageContent: paragraph.trim(), // Enviar apenas o parágrafo atual
                    senderName: workspace.ai_name || undefined
                });
                console.log(`[MsgProcessor ${jobId}] Resultado do envio Evolution API para parágrafo ${index + 1}:`, sendResult);
              } else {
                 console.error(`[MsgProcessor ${jobId}] Missing data for Evolution API send for paragraph ${index + 1} (Token: ${!!apiKeyToUse}, Instance: ${!!evolution_api_instance_name}, ClientPhone: ${!!clientPhoneNumber}).`);
                  sendResult = { success: false, error: "Dados de configuração do canal ausentes." };
              }
            } else {
                console.warn(`[MsgProcessor ${jobId}] Canal ${channel} não suportado para envio de resposta da IA. Parágrafo ${index + 1} não enviado.`);
                 sendResult = { success: false, error: `Canal ${channel} não suportado para envio.` };
            }

          } catch (sendError: any) {
            console.error(`[MsgProcessor ${jobId}] ERRO EXCEÇÃO ao enviar parágrafo ${index + 1} via Canal:`, sendError);
             sendResult = { success: false, error: sendError?.message ?? `Erro desconhecido ao enviar parágrafo ${index + 1} via Canal` };
          }

          // Atualizar status da mensagem no DB com base no resultado do envio
          if (sendResult?.success) {
            console.log(`[MsgProcessor ${jobId}] Envio do parágrafo ${index + 1} bem-sucedido. Atualizando status para SENT.`);
            await prisma.message.update({
              where: { id: newMessage.id },
              data: {
                channel_message_id: sendResult.wamid || sendResult.messageId || null, // Usar wamid ou messageId
                providerMessageId: sendResult.wamid || sendResult.messageId || null, // Usar wamid ou messageId
                status: 'SENT' as const, // Marcar como enviado
              },
            });
          } else if (sendResult) { // Falhou no envio via canal
              console.error(`[MsgProcessor ${jobId}] Envio do parágrafo ${index + 1} FALHOU para o canal. Atualizando status para FAILED.`);
              await prisma.message.update({
                  where: { id: newMessage.id },
                  data: {
                      status: 'FAILED',
                       errorMessage: typeof sendResult.error === 'string'
                                                  ? sendResult.error
                                                  : (typeof sendResult.error === 'object' && sendResult.error !== null && 'message' in sendResult.error)
                                                      ? String((sendResult.error as any).message)
                                                      : sendResult.error?.toString() || 'Falha no envio para o canal'
                  },
              });
          } else {
               // Caso onde sendResult é undefined (canal não suportado ou dados ausentes na configuração)
               console.warn(`[MsgProcessor ${jobId}] Envio do parágrafo ${index + 1} não tentado devido a canal não suportado ou dados ausentes na configuração. Atualizando status para FAILED.`);
                await prisma.message.update({
                    where: { id: newMessage.id },
                    data: {
                        status: 'FAILED',
                        errorMessage: 'Envio não tentado: Canal não suportado ou dados de configuração ausentes.'
                    }
                });
          }

        } catch (paragraphCreationError: any) {
           console.error(`[MsgProcessor ${jobId}] ERRO ao criar mensagem DB para parágrafo ${index + 1}:`, paragraphCreationError);
           // Lidar com erro na criação do DB message (talvez logar ou notificar de outra forma)
        }
      }

      // Atualizar last_message_at da conversa com o timestamp do ÚLTIMO parágrafo enviado
      if (paragraphs.length > 0) {
         const lastParagraphTimestamp = new Date(); // Usar timestamp atual ou do último parágrafo criado
         await prisma.conversation.update({
           where: { id: conversationId },
           data: { last_message_at: lastParagraphTimestamp }
         });
         console.log(`[MsgProcessor ${jobId}] Timestamp da conversa ${conversationId} atualizado para o último parágrafo.`);
      }
    }

    console.log(`--- [MsgProcessor ${jobId}] FIM ---`);
    return { status: 'success', handledBatch: shouldProcessBatch }; // Indicate if batch was handled

  } catch (error: any) {
    
    console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO no processamento para Conv ${conversationId}:`, error);
     if (error instanceof Error) {
        console.error(error.stack);
     }
    console.log(`--- [MsgProcessor ${jobId}] FIM (Erro Crítico) ---`);
    throw error; // Re-lança para BullMQ tratar como falha
  }
}

// Helper para converter Stream para Buffer (precisa estar acessível)
async function streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', chunk => chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

// --- Inicialização do Worker --- 
console.log(`[MsgProcessor] Tentando inicializar o worker para a fila "${QUEUE_NAME}"...`);
try {
    const worker = new Worker<JobData>(QUEUE_NAME, processJob, {
      connection: redisConnection,
      concurrency: 5, // Ajuste a concorrência conforme necessário
    });

    // --- Listeners de Eventos ---
    worker.on('completed', (job: Job<JobData>, result: any) => {
      console.log(`[MsgProcessor] Job ${job.id} (Conv: ${job.data?.conversationId}) concluído. Status: ${result?.status || 'N/A'}. Razão: ${result?.reason || (result?.handledBatch ? 'Processou Lote AI' : 'Lote AI não processado')}`);
    });

    worker.on('failed', (job: Job<JobData> | undefined, err: Error) => {
      const jobId = job?.id || 'N/A';
      const convId = job?.data?.conversationId || 'N/A';
      const attempts = job?.attemptsMade || 0;
      console.error(`[MsgProcessor] Job ${jobId} (Conv: ${convId}) falhou após ${attempts} tentativas:`, err.message);
      // console.error(err); // Log completo do erro (pode ser verboso)
    });

    worker.on('error', (err) => {
      console.error('[MsgProcessor] Erro geral do worker:', err);
    });

    worker.on('stalled', (jobId: string) => {
        console.warn(`[MsgProcessor] Job ${jobId} estagnou (stalled). Verifique a conexão e o processamento.`);
    });

    console.log(`[MsgProcessor] Worker iniciado e escutando a fila "${QUEUE_NAME}"...`);

} catch (initError: any) {
     console.error('[MsgProcessor] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1); // Sai se não conseguir inicializar
}