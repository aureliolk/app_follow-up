// lib/workers/messageProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { generateChatCompletion } from '@/lib/ai/chatService';
// Importar a função de envio do WhatsApp (deve existir em lib/channel/whatsappSender.ts)
import { sendWhatsappMessage } from '@/lib/channel/whatsappSender';
import { MessageSenderType, ConversationStatus, Prisma } from '@prisma/client'; // Adicionar Prisma
import { CoreMessage } from 'ai'; // Tipo para Vercel AI SDK
// Importar função de descriptografia
import { decrypt } from '@/lib/encryption';
// <<< Novas importações >>>
import { getWhatsappMediaUrl } from '@/lib/channel/whatsappUtils';
import { s3Client, s3BucketName } from '@/lib/s3Client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { lookup } from 'mime-types'; // Para obter extensão do mime type
// <<< Adicionar importações das funções de IA >>>
import { describeImage } from '@/lib/ai/describeImage';
import { transcribeAudio } from '@/lib/ai/transcribeAudio';

const QUEUE_NAME = 'message-processing';
const BUFFER_TIME_MS = 3000; // 3 segundos de buffer (ajuste se necessário)
const HISTORY_LIMIT = 20;   // Número máximo de mensagens no histórico para IA

interface JobData {
  conversationId: string;
  clientId: string;
  newMessageId: string;    // ID da mensagem do cliente que disparou ESTE job
  workspaceId: string;
  receivedTimestamp: number; // Timestamp de quando o webhook recebeu a mensagem
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
                            whatsappAccessToken: true,
                            whatsappPhoneNumberId: true,
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
    let updatedMessageData: MessageWithAnalysis | null = null; // Store the result of the update operation
    const metadata = currentMessage.metadata;
    const hasMedia = hasValidMetadata(metadata);
    const { whatsappAccessToken } = workspace;

    let aiAnalysisResult: string | null = null; // Stores AI description/transcription
    let finalContentForDb: string | null = currentMessage.content; // Placeholder for DB, starts as original

    if (hasMedia && whatsappAccessToken) {
        console.log(`[MsgProcessor ${jobId}] Mídia detectada (ID: ${metadata.mediaId}, Tipo: ${metadata.mimeType}). Iniciando processamento...`);
        let mediaS3Url: string | null = null;
        let s3Key: string | null = null;

        try {
            // --- Parte A: Obter URL e Baixar Mídia ---
            const decryptedAccessTokenForMedia = decrypt(whatsappAccessToken);
            if (!decryptedAccessTokenForMedia) throw new Error("Falha ao descriptografar token de acesso para mídia.");

            const mediaUrlString = await getWhatsappMediaUrl(metadata.mediaId, decryptedAccessTokenForMedia);
            if (!mediaUrlString) {
                throw new Error(`Falha ao obter URL de mídia para ID ${metadata.mediaId}.`);
            }
            console.log(`[MsgProcessor ${jobId}] Baixando mídia de: ${mediaUrlString}`);
            const downloadResponse = await axios.get(mediaUrlString, {
                responseType: 'arraybuffer',
                headers: { Authorization: `Bearer ${decryptedAccessTokenForMedia}` },
            });
            const mediaBuffer = Buffer.from(downloadResponse.data);
            if (!mediaBuffer || mediaBuffer.length === 0) throw new Error("Falha no download da mídia (buffer vazio ou inválido).");

            // --- Parte B: Upload S3 ---
            s3Key = `whatsapp-media/${workspace.id}/${conversationId}/${newMessageId}${lookup(metadata.mimeType || '') ? '.' + lookup(metadata.mimeType || '') : ''}`;
            console.log(`[MsgProcessor ${jobId}] Fazendo upload para S3: Bucket=${s3BucketName}, Key=${s3Key}, ContentType=${metadata.mimeType}`);
            await s3Client.send(new PutObjectCommand({
                Bucket: s3BucketName,
                Key: s3Key,
                Body: mediaBuffer,
                ContentType: metadata.mimeType,
            }));
            const storageEndpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, '');
            mediaS3Url = `${storageEndpoint}/${s3BucketName}/${s3Key}`;
            console.log(`[MsgProcessor ${jobId}] Upload S3 concluído. URL: ${mediaS3Url}`);

            // --- Parte C: Processamento IA ---
            const mediaType = metadata.mimeType.split('/')[0];
            finalContentForDb = `[${mediaType === 'image' ? 'Imagem' : mediaType === 'audio' ? 'Áudio' : mediaType === 'video' ? 'Vídeo' : 'Mídia'} Recebida]`; // Set placeholder

            try {
                console.log(`[MsgProcessor ${jobId}] Tentando processar mídia com IA (${metadata.mimeType})...`);
                if (mediaType === 'image') {
                    aiAnalysisResult = await describeImage(mediaBuffer);
                    console.log(`[MsgProcessor ${jobId}] Imagem descrita pela IA.`);
                } else if (mediaType === 'audio' && metadata.mimeType) {
                    aiAnalysisResult = await transcribeAudio(mediaBuffer, metadata.mimeType, 'pt');
                    console.log(`[MsgProcessor ${jobId}] Áudio transcrito pela IA.`);
                } else {
                     console.warn(`[MsgProcessor ${jobId}] Tipo de mídia ${mediaType} não suportado para processamento IA.`);
                     aiAnalysisResult = `[Tipo de mídia ${mediaType} não processado pela IA]`;
                }
            } catch (aiError: any) {
                console.error(`[MsgProcessor ${jobId}] Erro ao processar mídia com IA:`, aiError.message);
                aiAnalysisResult = `[Erro no processamento IA: ${aiError.message}]`;
                finalContentForDb = `[${mediaType} Recebido(a) (Erro IA)]`; // Update placeholder on AI error
            }

            // --- Parte D: Atualizar Mensagem no Banco --- 
            console.log(`[MsgProcessor ${jobId}] Atualizando mensagem ${newMessageId} no DB com content: "${finalContentForDb}", mediaUrl: ${mediaS3Url}, ai_media_analysis: "${aiAnalysisResult?.substring(0, 50)}..."`);
            const filename = (metadata as any)?.whatsappMessage?.document?.filename ||
                             (metadata as any)?.whatsappMessage?.video?.filename ||
                             (metadata as any)?.whatsappMessage?.image?.filename ||
                             null;

            updatedMessageData = await prisma.message.update({
                where: { id: newMessageId },
                data: {
                    content: finalContentForDb,             // Store placeholder
                    ai_media_analysis: aiAnalysisResult,    // Store AI result
                    media_url: mediaS3Url,
                    media_mime_type: metadata.mimeType,
                    media_filename: filename,               // Store filename if available
                    status: 'RECEIVED',
                    metadata: {                             // Update metadata with internal processing info
                        ...(metadata || {}),                 // Preserve original webhook metadata
                        internalProcessing: {                // Add sub-object for our data
                           mediaS3Url: mediaS3Url,
                           s3Key: s3Key,
                           uploadedToS3: true,
                           s3ContentType: metadata.mimeType,
                           processedByAI: !!aiAnalysisResult && !aiAnalysisResult?.includes('[Erro'),
                           aiProcessingError: !!aiAnalysisResult && aiAnalysisResult?.includes('[Erro')
                        }
                    }
                },
                select: { // Select all fields needed for Redis payload and history
                    id: true, conversation_id: true, sender_type: true, content: true, ai_media_analysis: true,
                    timestamp: true, channel_message_id: true, metadata: true, media_url: true,
                    media_mime_type: true, media_filename: true, status: true
                }
            });
            console.log(`[MsgProcessor ${jobId}] Mensagem ${newMessageId} atualizada no DB após processamento de mídia.`);

        } catch (mediaError: any) {
            console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO no processamento de mídia para msg ${newMessageId}:`, mediaError);
             try {
                // Attempt to update message with error status
                const mediaTypeOnError = metadata?.mimeType?.split('/')[0] || 'Mídia';
                finalContentForDb = `[${mediaTypeOnError} Recebida (Falha Processamento)]`;
                aiAnalysisResult = `[Erro crítico no pipeline de mídia: ${mediaError.message}]`;
                updatedMessageData = await prisma.message.update({ // Try to update even on error
                    where: { id: newMessageId },
                    data: {
                        content: finalContentForDb,
                        ai_media_analysis: aiAnalysisResult,
                        status: 'FAILED_PROCESSING',
                        media_url: mediaS3Url, // May be null if failed before upload
                        metadata: {
                            ...(metadata || {}),
                            internalProcessingError: mediaError.message,
                            processedByAI: false,
                            aiProcessingError: true
                        }
                    },
                     select: { // Select all fields
                        id: true, conversation_id: true, sender_type: true, content: true, ai_media_analysis: true,
                        timestamp: true, channel_message_id: true, metadata: true, media_url: true,
                        media_mime_type: true, media_filename: true, status: true
                    }
                });
             } catch (updateError: any) {
                console.error(`[MsgProcessor ${jobId}] Falha GRAVE ao atualizar status de erro para msg ${newMessageId}:`, updateError);
             }
        }

    } else {
         console.log(`[MsgProcessor ${jobId}] Mensagem ${newMessageId} não contém mídia válida ou token ausente. Pulando processamento de mídia.`);
         // aiAnalysisResult remains null, finalContentForDb remains original currentMessage.content
    }

    // --- Check if AI Processing Should Be Skipped (AFTER potential media update) ---
     if (!shouldProcessBatch) {
        if (updatedMessageData) { // If media was processed, publish update before skipping batch
           console.log(`[MsgProcessor ${jobId}] Publicando atualização de mídia MÍNIMA (skipped batch) no canal correto...`);
           
           // <<< Payload MÍNIMO FUNCIONAL >>>
           const minimalPayload = {
                id: updatedMessageData.id,
                media_url: updatedMessageData.media_url,
                media_mime_type: updatedMessageData.media_mime_type,
                media_filename: updatedMessageData.media_filename,
                status: updatedMessageData.status,
           };
           console.log("[MsgProcessor ${jobId}] Payload Mínimo (skipped batch):", minimalPayload);

            try {
                await redisConnection.publish(
                    `chat-updates:${conversationId}`,
                    JSON.stringify({
                        type: 'message_content_updated',
                        payload: minimalPayload // <<< USAR PAYLOAD MÍNIMO
                    })
                );
                console.log(`[MsgProcessor ${jobId}] Atualização de mídia MÍNIMA (skipped batch) publicada.`);
             } catch (publishError) {
                 console.error(`[MsgProcessor ${jobId}] ERRO AO PUBLICAR atualização mínima de mídia (skipped batch):`, publishError);
             }
        }
        console.log(`[MsgProcessor ${jobId}] Pulando processamento de IA (não é o job mais recente ou sem msgs novas).`);
        return { status: 'skipped', reason: 'Lote AI não processado por este job', handledBatch: false };
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

    // --- 6. Formatar Mensagens para Vercel AI SDK ---
    const aiMessages: CoreMessage[] = orderedHistory.map((msg) => {
        const role = msg.sender_type === MessageSenderType.CLIENT ? 'user' : 'assistant';
        let contentForAI = msg.content || ''; // Default to content

        // Special formatting for media messages to include AI analysis context
        if (msg.media_url && msg.ai_media_analysis) {
             const mediaType = msg.media_mime_type?.split('/')[0] || 'Mídia';
             // Start with placeholder (which should be in msg.content)
             contentForAI = msg.content || `[${mediaType === 'image' ? 'Imagem' : mediaType === 'audio' ? 'Áudio' : mediaType === 'video' ? 'Vídeo' : 'Mídia'} Recebida]`;
             // Append internal analysis for the AI's context
             contentForAI += `\n[Análise Interna ${mediaType === 'image' ? 'da Imagem' : mediaType === 'audio' ? 'do Áudio' : 'da Mídia'}: ${msg.ai_media_analysis}]`;
        }
        // Otherwise, just use the text content as is

        return {
            role: role,
            content: contentForAI,
        };
    });
    console.log(`[MsgProcessor ${jobId}] Mensagens formatadas para IA:`, JSON.stringify(aiMessages.slice(-5), null, 2)); // Log last 5 formatted msgs

    // --- 7. Obter Prompt e Modelo --- 
    const modelId = workspace.ai_model_preference || 'gpt-4o';
    const systemPrompt = workspace.ai_default_system_prompt ?? undefined;
    console.log(`[MsgProcessor ${jobId}] Usando Modelo: ${modelId}, Prompt: ${!!systemPrompt}`);

    // --- 8. Chamar o Serviço de IA --- 
    console.log(`[MsgProcessor ${jobId}] Chamando generateChatCompletion...`);
    const aiResponseContent = await generateChatCompletion({ messages: aiMessages, systemPrompt, modelId });

    // --- 9. Salvar e Enviar Resposta da IA ---
    if (aiResponseContent && aiResponseContent.trim() !== '') {
      console.log(`[MsgProcessor ${jobId}] IA retornou conteúdo: "${aiResponseContent.substring(0, 100)}..."`);
      const newAiMessageTimestamp = new Date();

      // Salvar resposta da IA
      const newAiMessage = await prisma.message.create({
          data: {
            conversation_id: conversationId,
            sender_type: MessageSenderType.AI,
            content: aiResponseContent,
            timestamp: newAiMessageTimestamp,
          },
          select: { id: true, conversation_id: true, content: true, timestamp: true, sender_type: true } // Select for publish
      });
      console.log(`[MsgProcessor ${jobId}] Resposta da IA salva (ID: ${newAiMessage.id}).`);

      // Publicar nova mensagem IA no canal Redis da CONVERSA
      try {
        const conversationChannel = `chat-updates:${conversationId}`;
        const newAiMessagePayload = {
            type: "new_message",
            payload: { 
              id: newAiMessage.id,
              conversation_id: newAiMessage.conversation_id,
              sender_type: newAiMessage.sender_type,
              content: newAiMessage.content,
              timestamp: newAiMessage.timestamp.toISOString(), // Use ISO string
              metadata: null 
            }
        };
        try {
            await redisConnection.publish(conversationChannel, JSON.stringify(newAiMessagePayload));
            console.log(`[MsgProcessor ${jobId}] Mensagem da IA ${newAiMessage.id} publicada no canal Redis da CONVERSA.`);
        } catch (aiMsgPublishError) {
            console.error(`[MsgProcessor ${jobId}] ERRO AO PUBLICAR mensagem da IA no Redis (Canal Conversa):`, aiMsgPublishError);
        }
      } catch (publishError: any) {
        console.error(`[MsgProcessor ${jobId}] Falha GERAL ao tentar publicar mensagem da IA no Redis (Canal Conversa):`, publishError);
      }

      // Publicar notificação no canal Redis do WORKSPACE
       try {
          const workspaceChannel = `workspace-updates:${workspaceId}`;
          const workspacePayload = {
              type: 'new_message',
              conversationId: conversationId,
              clientId: clientId,
              messageId: newAiMessage.id,
              lastMessageTimestamp: newAiMessage.timestamp.toISOString(),
              channel: channel,
              status: conversationData.status,
              is_ai_active: conversationData.is_ai_active,
              last_message_at: newAiMessage.timestamp.toISOString(),
              clientName: client?.name,
              clientPhone: clientPhoneNumber,
              lastMessageContent: newAiMessage.content,
              lastMessageSenderType: newAiMessage.sender_type,
              metadata: conversationData.metadata, // Workspace notification uses conversation metadata
          };
          try {
              await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
              console.log(`[MsgProcessor ${jobId}] Notificação de msg IA publicada no canal Redis do WORKSPACE.`);
          } catch (wsNotifyPublishError) {
              console.error(`[MsgProcessor ${jobId}] ERRO AO PUBLICAR notificação de msg IA no Redis (Canal Workspace):`, wsNotifyPublishError);
          }
       } catch (publishError: any) {
          console.error(`[MsgProcessor ${jobId}] Falha GERAL ao tentar publicar notificação de msg IA no Redis (Canal Workspace):`, publishError);
       }

      // <<< LOG ANTES DE ATUALIZAR CONVERSA >>>
      console.log(`[MsgProcessor ${jobId}] STEP 9: Before prisma.conversation.update`);
      // Atualizar last_message_at da conversa
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: newAiMessageTimestamp }
      });
      // <<< LOG DEPOIS DE ATUALIZAR CONVERSA >>>
      console.log(`[MsgProcessor ${jobId}] STEP 9: After prisma.conversation.update. Timestamp da conversa atualizado.`);

      // <<< LOG ANTES DO BLOCO WHATSAPP >>>
      console.log(`[MsgProcessor ${jobId}] STEP 9: Checking channel for WhatsApp send. Channel: ${channel}`);
      // Enviar resposta via WhatsApp (se aplicável)
      if (channel === 'WHATSAPP') {
            console.log(`[MsgProcessor ${jobId}] STEP 9: ENTERING WhatsApp send block.`);
            const { whatsappPhoneNumberId } = workspace; // AccessToken already available
            if (whatsappAccessToken && whatsappPhoneNumberId && clientPhoneNumber) {
                let decryptedAccessTokenForSend: string | null = null;
                try {
                    console.log(`[MsgProcessor ${jobId}] STEP 9: Attempting decrypt for WhatsApp send...`);
                    decryptedAccessTokenForSend = decrypt(whatsappAccessToken);
                    if (!decryptedAccessTokenForSend) throw new Error("Token de acesso descriptografado para envio está vazio.");
                    console.log(`[MsgProcessor ${jobId}] STEP 9: Decrypt successful for WhatsApp send.`);

                    console.log(`[MsgProcessor ${jobId}] STEP 9: Attempting sendWhatsappMessage to ${clientPhoneNumber}...`);
                    const sendResult = await sendWhatsappMessage(
                        whatsappPhoneNumberId,
                        clientPhoneNumber,
                        decryptedAccessTokenForSend,
                        aiResponseContent
                    );
                    console.log(`[MsgProcessor ${jobId}] STEP 9: sendWhatsappMessage call completed.`); // <<< LOG APÓS CHAMADA
                    if (sendResult.success && sendResult.messageId) {
                        console.log(`[MsgProcessor ${jobId}] STEP 9: WhatsApp send SUCCESS. Message ID: ${sendResult.messageId}`);
                        // <<< LOG ANTES DE ATUALIZAR MSG COM channel_id >>>
                        console.log(`[MsgProcessor ${jobId}] STEP 9: Attempting prisma.message.update with channel_message_id...`);
                        await prisma.message.update({
                            where: { id: newAiMessage.id },
                            data: { channel_message_id: sendResult.messageId }
                        }).catch(err => console.error(`[MsgProcessor ${jobId}] STEP 9: Falha (não crítica) ao atualizar channel_message_id:`, err));
                        console.log(`[MsgProcessor ${jobId}] STEP 9: prisma.message.update for channel_message_id finished.`); // <<< LOG APÓS ATUALIZAÇÃO
                    } else {
                        console.error(`[MsgProcessor ${jobId}] STEP 9: WhatsApp send FAILED:`, JSON.stringify(sendResult.error || 'Erro desconhecido'));
                    }
                } catch (decryptOrSendError: any) {
                     console.error(`[MsgProcessor ${jobId}] STEP 9: ERROR in decrypt/send block:`, decryptOrSendError.message);
                     // Considerar se este erro deveria ir para o catch principal? Provavelmente sim.
                     // throw decryptOrSendError; // <<< Poderia adicionar isso para garantir que vá ao catch principal
                }
            } else {
                 console.error(`[MsgProcessor ${jobId}] STEP 9: Missing data for WhatsApp send (Token: ${!!whatsappAccessToken}, PhoneID: ${!!whatsappPhoneNumberId}, ClientPhone: ${!!clientPhoneNumber}).`);
            }
             // <<< LOG AO SAIR DO BLOCO IF WHATSAPP >>>
            console.log(`[MsgProcessor ${jobId}] STEP 9: Exiting WhatsApp send block.`);
      } else {
          console.warn(`[MsgProcessor ${jobId}] STEP 9: Channel ${channel} is not WHATSAPP. Skipping send.`);
          // <<< LOG AO SAIR DO BLOCO ELSE >>>
          console.log(`[MsgProcessor ${jobId}] STEP 9: Exiting WhatsApp check block (skipped send).`);
      }

    } else {
      console.log(`[MsgProcessor ${jobId}] IA não retornou conteúdo. Nenhuma mensagem salva ou enviada.`);
    }
    // <<< LOG ANTES DO PASSO 10 >>>
    console.log(`[MsgProcessor ${jobId}] Reached position JUST BEFORE STEP 10.`);

    // --- 10. Publicar Mensagem ORIGINAL ATUALIZADA no Redis ---
    // (This happens regardless of whether AI responded, IF media was processed)
    if (updatedMessageData) { // Mídia foi processada (ou tentada) NESTE job
         console.log(`[MsgProcessor ${jobId}] Publicando atualização de mídia MÍNIMA (Passo 10). ID: ${updatedMessageData.id}`);
         
         // <<< Payload MÍNIMO FUNCIONAL >>>
         const minimalPayloadFinal = {
              id: updatedMessageData.id,
              media_url: updatedMessageData.media_url,
              media_mime_type: updatedMessageData.media_mime_type,
              media_filename: updatedMessageData.media_filename,
              status: updatedMessageData.status,
         };
         console.log("[MsgProcessor ${jobId}] Payload Mínimo (Passo 10):", minimalPayloadFinal);

        try {
             // REMOVIDOS logs STEP 10 detalhados
            await redisConnection.publish(
                `chat-updates:${conversationId}`, // Canal correto
                JSON.stringify({ 
                    type: 'message_content_updated',
                    payload: minimalPayloadFinal // <<< USAR PAYLOAD MÍNIMO
                })
            );
            console.log(`[MsgProcessor ${jobId}] Publicação final da atualização de mídia MÍNIMA concluída.`);
        } catch (mediaUpdatePublishError) {
            console.error(`[MsgProcessor ${jobId}] ERRO AO PUBLICAR atualização mínima de mídia (Passo 10):`, mediaUpdatePublishError);
        }
    } else {
         console.log(`[MsgProcessor ${jobId}] Nenhuma atualização de mídia neste job. Pulando publicação final no Redis.`);
    }

    console.log(`--- [MsgProcessor ${jobId}] FIM ---`);
    return { status: 'success', handledBatch: shouldProcessBatch }; // Indicate if batch was handled

  } catch (error: any) {
    // <<< LOG IMEDIATO DO ERRO >>>
    console.error(`[MsgProcessor ${jobId}] CAUGHT ERROR IN MAIN CATCH BLOCK:`, error);
    
    console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO no processamento para Conv ${conversationId}:`, error);
     if (error instanceof Error) {
        console.error(error.stack);
     }
    console.log(`--- [MsgProcessor ${jobId}] FIM (Erro Crítico) ---`);
    throw error; // Re-lança para BullMQ tratar como falha
  }
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