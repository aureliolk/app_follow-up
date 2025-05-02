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
import { generateChatCompletion } from '../ai/chatService';
// <<< Importar Notifier Service >>>
import { publishConversationUpdate, publishWorkspaceUpdate } from '../services/notifierService';
// <<< Importar Channel Service >>>
import { sendWhatsAppMessage } from '../services/channelService';
// <<< Importar Carregador de Ferramentas >>>
import { getActiveToolsForWorkspace } from '../ai/toolLoader'; 
// <<< Importar Tipos de Ferramentas da Vercel AI SDK >>>
import { ToolCall, ToolResult, Tool, ToolContent } from 'ai'; 

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
                            ai_name: true,
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
    let updatedMessageData: MessageWithAnalysis | null = null; // To store the updated message if media is processed
    let aiAnalysisResult: string | null = null; // Stores AI description/transcription
    let finalContentForDb: string | null = currentMessage.content; // Placeholder for DB, starts as original

    const metadata = currentMessage.metadata;
    const hasMedia = hasValidMetadata(metadata);
    const { whatsappAccessToken } = workspace;

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
                    aiAnalysisResult = await transcribeAudio(mediaBuffer, metadata.mimeType, undefined, 'pt');
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
                // Incluir campos necessários para UI renderizar o placeholder e status
                content: updatedMessageData.content,
                sender_type: updatedMessageData.sender_type,
                timestamp: updatedMessageData.timestamp.toISOString(),
                media_url: updatedMessageData.media_url,
                media_mime_type: updatedMessageData.media_mime_type,
                media_filename: updatedMessageData.media_filename,
                status: updatedMessageData.status,
           };
           console.log("[MsgProcessor ${jobId}] Payload Mínimo (skipped batch):", minimalPayload);

            try {
                // <<< USAR notifierService >>>
                await publishConversationUpdate(
                    `chat-updates:${conversationId}`,
                    {
                        type: 'message_content_updated',
                        payload: minimalPayload // <<< USAR PAYLOAD MÍNIMO
                    }
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

    // --- 6. Formatar Mensagens para Vercel AI SDK (Multimodal) ---
    // Mapeamento assíncrono necessário se precisarmos buscar/ler buffers de imagem aqui
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
                        content: msg.content || '[Imagem Enviada pelo Cliente (Falha ao carregar para IA)]'
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
                         content: msg.content || '[Áudio Enviado pelo Cliente (Sem transcrição)]'
                     };
                 }
            } else {
                 // Cliente enviou TEXTO
                 return {
                     role: 'user', // Explicitamente 'user'
                     content: msg.content || ''
                 };
            }
        } else {
             // --- Mensagens do ASSISTENTE (IA ou Operador marcado como AI?) ---
             // Por enquanto, apenas retorna o conteúdo textual.
             // Se assistentes pudessem enviar imagens, precisaríamos de lógica multimodal aqui também.
             return {
                 role: 'assistant',
                 content: msg.content || ''
             };
        }
    });

    // Aguardar todas as promises de formatação (devido ao download S3 assíncrono)
    const aiMessages = await Promise.all(aiMessagesPromises);
    console.log(`[MsgProcessor ${jobId}] Mensagens formatadas para IA (multimodal):`, JSON.stringify(aiMessages.slice(-5).map(m => ({ role: m.role, content: Array.isArray(m.content) ? m.content.map(c => c.type === 'text' ? { type: 'text', text: c.text.substring(0, 50)+'...' } : { type: c.type }) : typeof m.content === 'string' ? m.content.substring(0,100)+'...' : m.content })), null, 2)); // Log formatado

    // --- 7. Obter Prompt e Modelo --- 
    const modelId = workspace.ai_model_preference || 'gpt-4o';
    const systemPrompt = workspace.ai_default_system_prompt ?? undefined;
    console.log(`[MsgProcessor ${jobId}] Usando Modelo: ${modelId}, Prompt: ${!!systemPrompt}`);

    // --- 8. Processar com IA ---
    console.log(`[MsgProcessor ${jobId}] Processando mensagens com IA...`);
    
    // Variável para armazenar resposta FINAL da IA
    let finalAiResponseText: string | null = null; // Alterado nome para clareza
    
    console.log(`[MsgProcessor ${jobId}] Nome do cliente: ${client?.name}`);

    try {
      // <<< Carregar Ferramentas Ativas >>>
      console.log(`[MsgProcessor ${jobId}] Carregando ferramentas para workspace ${workspace.id}...`);
      const activeTools = await getActiveToolsForWorkspace(workspace.id);
      console.log(`[MsgProcessor ${jobId}] Ferramentas carregadas:`, Object.keys(activeTools));

      // <<< Primeira Chamada à IA >>>
      console.log(`[MsgProcessor ${jobId}] Primeira chamada a generateChatCompletion...`);
      let aiResult = await generateChatCompletion({
        messages: aiMessages, // Histórico formatado
        systemPrompt: systemPrompt,
        modelId: modelId,
        nameIa: workspace.ai_name || undefined,
        conversationId: conversationId,
        workspaceId: workspace.id,
        tools: activeTools, // <<< Passar ferramentas carregadas
        clientName: client?.name || ''
      });

      // <<< Loop para Lidar com Tool Calls (se houver) >>>
      if (aiResult.type === 'tool_calls' && aiResult.calls) {
        console.log(`[MsgProcessor ${jobId}] IA solicitou ${aiResult.calls.length} ferramenta(s). Executando...`);
        
        // Usando 'any' para simplificar os tipos genéricos por enquanto
        const toolCalls: ToolCall<any, any>[] = aiResult.calls;
        const toolResults: ToolResult<any, any, any>[] = [];

        // Adiciona a mensagem 'assistant' com as tool_calls ao histórico
        // Usando asserção de tipo para incluir toolCalls
        aiMessages.push({ 
            role: 'assistant', 
            content: '', 
            toolCalls: toolCalls 
        } as CoreMessage); // Asserção de tipo

        for (const toolCall of toolCalls) {
            const toolName = toolCall.toolName;
            const toolArgs = toolCall.args;
            console.log(`[MsgProcessor ${jobId}] Executando ferramenta: ${toolName} com args:`, toolArgs);

            const toolFunction = activeTools[toolName];
            if (!toolFunction || typeof toolFunction.execute !== 'function') {
                console.error(`[MsgProcessor ${jobId}] Ferramenta "${toolName}" não encontrada ou não executável.`);
                toolResults.push({ 
                    toolCallId: toolCall.toolCallId, 
                    toolName: toolName,
                    args: toolArgs,
                    result: { success: false, error: `Tool '${toolName}' not found or invalid.` } 
                });
                continue;
            }

            try {
                // A assinatura de execute requer (args, context). Passando contexto vazio por ora.
                const result = await toolFunction.execute(toolArgs as any, {} as any);
                console.log(`[MsgProcessor ${jobId}] Resultado da ferramenta ${toolName}:`, result);
                toolResults.push({ 
                    toolCallId: toolCall.toolCallId, 
                    toolName: toolName,
                    args: toolArgs,
                    result: result 
                });
            } catch (toolError: any) {
                console.error(`[MsgProcessor ${jobId}] Erro ao executar ferramenta ${toolName}:`, toolError);
                toolResults.push({ 
                    toolCallId: toolCall.toolCallId, 
                    toolName: toolName, 
                    args: toolArgs,
                    result: { success: false, error: toolError.message || 'Unknown tool execution error' } 
                });
            }
        }
        
        // Adiciona a mensagem 'tool' com os resultados ao histórico
        // Mapeia toolResults para o formato ToolContent esperado pela Vercel AI SDK
        const toolContent: ToolContent = toolResults.map(result => ({
            type: 'tool-result',
            toolCallId: result.toolCallId,
            toolName: result.toolName,
            result: result.result
        }));
        aiMessages.push({ role: 'tool', content: toolContent }); 

        // <<< Segunda Chamada à IA com os resultados das ferramentas >>>
        console.log(`[MsgProcessor ${jobId}] Segunda chamada a generateChatCompletion com resultados das ferramentas...`);
        aiResult = await generateChatCompletion({
            messages: aiMessages, // Histórico atualizado
            systemPrompt: systemPrompt,
            modelId: modelId,
            nameIa: workspace.ai_name || undefined,
            conversationId: conversationId,
            workspaceId: workspace.id,
            tools: activeTools,
            clientName: client?.name || ''
        });
      }

      // <<< Processar Resultado Final (após possível loop de ferramentas) >>>
      if (aiResult.type === 'text') {
          finalAiResponseText = aiResult.content;
          console.log(`[MsgProcessor ${jobId}] Resposta final da IA (texto): "${finalAiResponseText?.substring(0,100)}..."`);
      } else if (aiResult.type === 'tool_calls') {
          console.warn(`[MsgProcessor ${jobId}] IA ainda retornou tool_calls após o loop. Usando mensagem padrão.`);
          finalAiResponseText = "Houve um problema ao processar sua solicitação com as ferramentas."; 
      } else if (aiResult.type === 'empty') {
          console.warn(`[MsgProcessor ${jobId}] IA não retornou conteúdo final (empty).`);
          finalAiResponseText = null;
      } else if (aiResult.type === 'error' && 'error' in aiResult) {
           // Verifica o tipo E a existência da propriedade 'error'
           const errorMessage = aiResult.error as string | Error; // Asserção após verificação
           console.error(`[MsgProcessor ${jobId}] Erro retornado por generateChatCompletion:`, errorMessage);
           finalAiResponseText = null;
           throw new Error(typeof errorMessage === 'string' ? errorMessage : errorMessage.message || "Erro desconhecido na geração da IA");
      } else {
         console.warn(`[MsgProcessor ${jobId}] Tipo de resposta inesperado da IA: ${(aiResult as any).type}`);
         finalAiResponseText = null;
      }
      
    } catch (aiError) {
       console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO durante o processamento com IA (chamada ou ferramentas):`, aiError);
       throw aiError;
    }
    
    // --- 9. Salvar e Enviar Resposta da IA ---
    if (finalAiResponseText && finalAiResponseText.trim() !== '') {
      console.log(`[MsgProcessor ${jobId}] Preparando para salvar e enviar resposta final da IA: "${finalAiResponseText.substring(0, 100)}..."`);
      const newAiMessageTimestamp = new Date();

      // <<< USAR AI_NAME DO WORKSPACE PARA O PREFIXO >>>
      const aiDisplayName = workspace.ai_name || "*Beatriz*"; // Usar padrão se não definido

      // Salvar resposta da IA
      const newAiMessage = await prisma.message.create({
          data: {
            conversation_id: conversationId,
            sender_type: MessageSenderType.AI,
            content: finalAiResponseText, // <<< USAR CONTEÚDO FINAL DA IA
            timestamp: newAiMessageTimestamp,
            // <<< Definir Status inicial como PENDING >>>
            status: 'PENDING' // Garante que começa como pendente antes do envio
          },
          select: { id: true, conversation_id: true, content: true, timestamp: true, sender_type: true } // Select for publish
      });
      console.log(`[MsgProcessor ${jobId}] Resposta final da IA salva (ID: ${newAiMessage.id}).`);

      // Publicar nova mensagem IA no canal Redis da CONVERSA
      try {
        const conversationChannel = `chat-updates:${conversationId}`;
        // Preparar payload completo para a UI
        const newAiMessagePayload = {
            type: "new_message",
            payload: { 
              id: newAiMessage.id,
              conversation_id: newAiMessage.conversation_id,
              sender_type: newAiMessage.sender_type,
              content: newAiMessage.content,
              // Adicionar outros campos esperados pela UI
              status: 'PENDING', // Mensagem começa PENDING
              media_url: null,
              media_mime_type: null,
              media_filename: null,
              timestamp: newAiMessage.timestamp.toISOString(), // Use ISO string
              metadata: null 
            }
        };
        try {
            // <<< USAR notifierService >>>
            await publishConversationUpdate(conversationChannel, newAiMessagePayload);
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
              // <<< USAR notifierService >>>
              await publishWorkspaceUpdate(workspaceChannel, workspacePayload);
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
            const encryptedAccessToken = workspace.whatsappAccessToken; // Pega o token ENCRIPTADO

            if (whatsappAccessToken && whatsappPhoneNumberId && clientPhoneNumber) {
                try {
                    console.log(`[MsgProcessor ${jobId}] STEP 9: Attempting sendWhatsappMessage to ${clientPhoneNumber}...`);
                    // <<< USAR channelService >>>
                    const sendResult = await sendWhatsAppMessage(
                        whatsappPhoneNumberId,
                        clientPhoneNumber,
                        encryptedAccessToken, // Passar o token ENCRIPTADO
                        finalAiResponseText, // <<< ENVIAR CONTEÚDO FINAL DA IA
                        aiDisplayName
                    );
                    console.log(`[MsgProcessor ${jobId}] STEP 9: sendWhatsappMessage call completed.`);
                    if (sendResult.success && sendResult.wamid) {
                        console.log(`[MsgProcessor ${jobId}] STEP 9: WhatsApp send SUCCESS. Message ID: ${sendResult.wamid}`);
                        
                        // <<< LOG DETALHADO ANTES DO UPDATE >>>
                        const updateData = { 
                            channel_message_id: sendResult.wamid, 
                            status: 'SENT'
                        };
                        console.log(`[MsgProcessor ${jobId}] STEP 9: PREPARING to update message ${newAiMessage.id} with data:`, JSON.stringify(updateData));
                        
                        try {
                            await prisma.message.update({
                                where: { id: newAiMessage.id },
                                data: updateData
                            });
                            // <<< LOG DE SUCESSO APÓS UPDATE >>>
                            console.log(`[MsgProcessor ${jobId}] STEP 9: SUCCESS updating message ${newAiMessage.id} status to SENT.`);
                        } catch (updateError: any) {
                             // <<< LOG DETALHADO DO ERRO >>>
                             console.error(`[MsgProcessor ${jobId}] STEP 9: ERROR updating message ${newAiMessage.id} status/channel_id. Data attempted: ${JSON.stringify(updateData)}`, updateError);
                             // Log o erro completo, pode ter mais detalhes
                             console.error(`[MsgProcessor ${jobId}] STEP 9: Full update error object:`, updateError);
                        }
                        // <<< LOG APÓS TENTATIVA (SEMPRE RODA) >>>
                        console.log(`[MsgProcessor ${jobId}] STEP 9: Finished attempt to update status/channel_id for message ${newAiMessage.id}.`);

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
              // Incluir campos necessários para UI renderizar o placeholder e status
              content: updatedMessageData.content,
              sender_type: updatedMessageData.sender_type,
              timestamp: updatedMessageData.timestamp.toISOString(),
              media_url: updatedMessageData.media_url,
              media_mime_type: updatedMessageData.media_mime_type,
              media_filename: updatedMessageData.media_filename,
              status: updatedMessageData.status,
         };
         console.log("[MsgProcessor ${jobId}] Payload Mínimo (Passo 10):", minimalPayloadFinal);

        try {
             // <<< USAR notifierService >>>
             await publishConversationUpdate(
                 `chat-updates:${conversationId}`,
                 {
                     type: 'message_content_updated',
                     payload: minimalPayloadFinal // <<< USAR PAYLOAD MÍNIMO
                 }
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