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

// Define o tipo esperado para as mensagens do histórico
type HistoryMessage = {
  sender_type: MessageSenderType;
  content: string | null; // Content pode ser null
  timestamp: Date;
  // Incluir metadata para checar mídia no histórico recente?
  metadata?: any; // Adicionar metadata opcional
};

async function processJob(job: Job<JobData>) {
  const { conversationId, clientId, newMessageId, workspaceId, receivedTimestamp } = job.data;
  const jobId = job.id || 'unknown'; // Pegar ID do job para logs
  console.log(`\n--- [MsgProcessor ${jobId}] INÍCIO ---`);
  console.log(`[MsgProcessor ${jobId}] Processando msg ${newMessageId} para Conv ${conversationId}, Cliente ${clientId}, Wks ${workspaceId}`);

  try {
    // --- 1. Buffer Inicial Simples ---
    console.log(`[MsgProcessor ${jobId}] Aguardando ${BUFFER_TIME_MS}ms (buffer)...`);
    await new Promise(resolve => setTimeout(resolve, BUFFER_TIME_MS));
    console.log(`[MsgProcessor ${jobId}] Buffer inicial concluído.`);

    // --- 2. Buscar Mensagem Atual e Dados da Conversa --- <<< MODIFICADO >>>
    console.log(`[MsgProcessor ${jobId}] Buscando dados da mensagem ${newMessageId} e conversa ${conversationId}...`);
    const currentMessage = await prisma.message.findUnique({
        where: { id: newMessageId },
        select: {
            id: true,
            content: true,
            metadata: true,
            media_url: true,
            media_mime_type: true,
            media_filename: true,
            status: true,
            conversation: {
                select: {
                    id: true,
                    is_ai_active: true,
                    channel: true,
                    status: true,       // <<< Incluir status da conversa
                    metadata: true,     // <<< Incluir metadata da conversa
                    client: {
                        select: {
                            id: true,       // <<< Incluir ID do cliente
                            phone_number: true,
                            name: true,     // <<< Incluir nome do cliente
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

    if (!currentMessage || !currentMessage.conversation) {
      console.error(`[MsgProcessor ${jobId}] Erro: Mensagem ${newMessageId} ou sua conversa não encontrada.`);
      throw new Error(`Mensagem ${newMessageId} ou conversa associada não encontrada.`);
    }

    const conversationData = currentMessage.conversation;

    if (!conversationData.workspace) {
         console.error(`[MsgProcessor ${jobId}] Erro: Workspace associado à conversa ${conversationId} não encontrado.`);
         throw new Error(`Workspace para a conversa ${conversationId} não encontrado.`);
    }
    if (!conversationData.client || !conversationData.client.phone_number) {
         console.error(`[MsgProcessor ${jobId}] Erro: Cliente ou telefone do cliente não encontrado para Conv ${conversationId}.`);
         throw new Error(`Cliente ou telefone não encontrado para a conversa ${conversationId}.`);
    }

    // Destruturar dados para facilitar acesso
    const { channel, client, workspace } = conversationData;
    const clientPhoneNumber = client.phone_number;

    console.log(`[MsgProcessor ${jobId}] Dados lidos do DB para Msg ${newMessageId} / Conv ${conversationId}. Canal: ${channel}`);

    if (!conversationData.is_ai_active) {
      console.log(`[MsgProcessor ${jobId}] IA inativa para conversa ${conversationId}. Pulando.`);
      return { status: 'skipped', handledBatch: true };
    }
    console.log(`[MsgProcessor ${jobId}] IA está ativa para a conversa.`);

    // --- 3. Identificar Mensagens Recentes do Cliente (Lógica Debounce) ---
    const lastAiMessage = await prisma.message.findFirst({
      where: { conversation_id: conversationId, sender_type: MessageSenderType.AI },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    });
    const fetchMessagesSince = lastAiMessage?.timestamp || new Date(0);
    console.log(`[MsgProcessor ${jobId}] Buscando mensagens do cliente desde: ${fetchMessagesSince.toISOString()}`);

    const newClientMessages = await prisma.message.findMany({
      where: {
        conversation_id: conversationId,
        sender_type: MessageSenderType.CLIENT,
        timestamp: { gt: fetchMessagesSince },
      },
      orderBy: { timestamp: 'asc' },
      select: { id: true, timestamp: true }
    });

    if (newClientMessages.length === 0) {
       console.log(`[MsgProcessor ${jobId}] Nenhuma mensagem NOVA do cliente encontrada desde a última da IA. Pulando processamento de IA.`);
       return { status: 'skipped', reason: 'Nenhuma mensagem nova do cliente para IA' };
    }
    console.log(`[MsgProcessor ${jobId}] Encontradas ${newClientMessages.length} novas mensagens do cliente desde a última IA.`);

    const latestClientMessageInBatch = newClientMessages[newClientMessages.length - 1];
    console.log(`[MsgProcessor ${jobId}] Mensagem mais recente no lote: ID=${latestClientMessageInBatch.id}, Timestamp=${latestClientMessageInBatch.timestamp.toISOString()}`);

    if (newMessageId !== latestClientMessageInBatch.id) {
       console.log(`[MsgProcessor ${jobId}] Este job (msg ${newMessageId}) NÃO é o mais recente. Outro job (para msg ${latestClientMessageInBatch.id}) processará o lote. Pulando.`);
       return { status: 'skipped', reason: `Lote será tratado pelo job da msg ${latestClientMessageInBatch.id}` };
    }

    console.log(`[MsgProcessor ${jobId}] ESTE JOB (msg ${newMessageId}) É O RESPONSÁVEL PELO LOTE.`);

    // --- 4. Processar Mídia (se existir) --- <<< NOVO BLOCO >>>
    let finalContentForHistory = currentMessage.content; // Começa com o conteúdo original (placeholder ou texto)
    let messageToPublish = currentMessage; // Mensagem a ser publicada no Redis

    const metadata = currentMessage.metadata as any; // Cast para acessar propriedades
    const mediaId = metadata?.mediaId;
    const mimeType = metadata?.mimeType;

    // <<< ADICIONAR LOG DE DEBUG AQUI >>>
    console.log(`[MsgProcessor ${jobId}] Debug Mídia Check: mediaId=${mediaId}, mimeType=${mimeType}, hasAccessToken=${!!workspace.whatsappAccessToken}, metadataObject=`, metadata);

    if (mediaId && mimeType && workspace.whatsappAccessToken) {
        console.log(`[MsgProcessor ${jobId}] Mídia detectada (ID: ${mediaId}, Tipo: ${mimeType}). Iniciando processamento...`);
        let decryptedAccessToken: string | null = null;
        try {
            decryptedAccessToken = decrypt(workspace.whatsappAccessToken);
            if (!decryptedAccessToken) throw new Error("Token de acesso WhatsApp descriptografado está vazio.");

            const mediaUrl = await getWhatsappMediaUrl(mediaId, decryptedAccessToken);

            if (mediaUrl) {
                console.log(`[MsgProcessor ${jobId}] Baixando mídia de: ${mediaUrl}`);
                const downloadResponse = await axios.get(mediaUrl, {
                    responseType: 'arraybuffer', // Importante para arquivos binários
                    headers: { Authorization: `Bearer ${decryptedAccessToken}` }, // Header necessário para download
                });

                const mediaData = Buffer.from(downloadResponse.data);
                const downloadContentType = downloadResponse.headers['content-type'];
                const fileExtension = lookup(downloadContentType || mimeType) || ''; // Tenta obter extensão do content-type ou mimeType
                const s3Key = `whatsapp-media/${workspace.id}/${conversationId}/${newMessageId}${fileExtension ? '.' + fileExtension : ''}`;
                const s3ContentType = downloadContentType || mimeType; // Prioriza Content-Type do download

                console.log(`[MsgProcessor ${jobId}] Fazendo upload para S3: Bucket=${s3BucketName}, Key=${s3Key}, ContentType=${s3ContentType}`);

                await s3Client.send(new PutObjectCommand({
                    Bucket: s3BucketName,
                    Key: s3Key,
                    Body: mediaData,
                    ContentType: s3ContentType,
                    // ACL: 'public-read' // Definir ACL se o bucket não for público por padrão e você quiser links públicos diretos
                }));

                // Assumindo estrutura de URL pública (ajustar se necessário para URLs assinadas ou configuração diferente)
                // Remover / do final do endpoint se houver
                const storageEndpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, '');
                const minioUrl = `${storageEndpoint}/${s3BucketName}/${s3Key}`;
                console.log(`[MsgProcessor ${jobId}] Upload S3 concluído. URL: ${minioUrl}`);

                // Determinar o nome original do arquivo
                let originalFilename: string | undefined = undefined;
                if (metadata?.whatsappMessage?.document?.filename) {
                  originalFilename = metadata.whatsappMessage.document.filename;
                } else if (metadata?.whatsappMessage?.image?.filename) { // WhatsApp às vezes inclui para imagens
                  originalFilename = metadata.whatsappMessage.image.filename;
                } else if (metadata?.whatsappMessage?.video?.filename) {
                   originalFilename = metadata.whatsappMessage.video.filename;
                } else {
                   // Se não houver nome, gerar um baseado no ID e extensão
                   originalFilename = `${newMessageId}${fileExtension ? '.' + fileExtension : ''}`;
                }

                // Atualizar mensagem no banco com os dados corretos
                const updatedMessage = await prisma.message.update({
                    where: { id: newMessageId },
                    data: {
                        // content: finalContentForHistory, // Manter o placeholder original ou limpar? Manter por enquanto.
                        media_url: minioUrl,           // <<< CORRIGIDO: Salvar URL aqui
                        media_mime_type: s3ContentType, // <<< CORRIGIDO: Salvar MIME Type aqui
                        media_filename: originalFilename, // <<< CORRIGIDO: Salvar nome do arquivo aqui
                        status: 'RECEIVED',             // <<< CORRIGIDO: Atualizar status
                        metadata: { // Atualiza metadata (preserva o original e adiciona/atualiza)
                            ...(metadata || {}),
                            s3Key: s3Key,
                            uploadedToS3: true,
                            s3ContentType: s3ContentType, // Guardar o Content-Type usado no S3
                            // Remover campos que agora estão no nível principal?
                            // mediaId: undefined, 
                            // mimeType: undefined,
                        }
                    },
                     // <<< Selecionar novamente dados COMPLETOS para Redis >>>
                    select: {
                        id: true,
                        conversation_id: true,
                        sender_type: true,
                        content: true,         // Selecionar content original
                        timestamp: true,
                        channel_message_id: true,
                        metadata: true,
                        media_url: true,       // Selecionar os novos campos
                        media_mime_type: true,
                        media_filename: true,
                        status: true,
                    }
                });
                // Ajuste: Conteúdo para IA pode usar a URL
                finalContentForHistory = `[${metadata.messageType || 'Mídia'} enviada pelo usuário: ${minioUrl}]`; 
                messageToPublish = updatedMessage as any; // Cast temporário

                 // <<< RE-PUBLICAR MENSAGEM ATUALIZADA NO REDIS >>>
                 // Publicar no canal Redis da Conversa (com URL S3)
                try {
                    const conversationChannel = `chat-updates:${conversationId}`;
                    // <<< Enviar evento específico de atualização COM DADOS DE MÍDIA >>>
                    const updatePayload = {
                        type: "message_content_updated", // <<< Usar este tipo de evento
                        payload: { // <<< ENVIAR TODOS OS CAMPOS RELEVANTES >>>
                            id: messageToPublish.id,
                            content: messageToPublish.content, // Content original (placeholder)
                            media_url: messageToPublish.media_url, // <<< Incluir URL
                            media_mime_type: messageToPublish.media_mime_type, // <<< Incluir MimeType
                            media_filename: messageToPublish.media_filename, // <<< Incluir Filename
                            status: messageToPublish.status, // <<< Incluir Status
                            metadata: messageToPublish.metadata // Metadata atualizado (com s3Key, etc)
                        }
                    };
                    const conversationPayloadString = JSON.stringify(updatePayload);
                    await redisConnection.publish(conversationChannel, conversationPayloadString);
                    console.log(`[MsgProcessor ${jobId}] Evento message_content_updated para ${messageToPublish.id} (com media_url) publicado no canal Redis da CONVERSA.`);
                } catch (publishConvError) {
                    console.error(`[MsgProcessor ${jobId}] Falha ao RE-publicar mensagem ${messageToPublish.id} no Redis (Canal Conversa):`, publishConvError);
                }
                 // Publicar no canal Redis do Workspace (com URL S3)
                try {
                    const workspaceChannel = `workspace-updates:${workspaceId}`;
                    // <<< Manter este payload para atualizar a lista geral? Ou usar um tipo diferente? >>>
                    // Por enquanto, vamos manter como estava, mas talvez precise ajustar depois.
                    const workspacePayload = {
                         type: 'message_updated', // Novo tipo de evento?
                         conversationId: conversationId,
                         messageId: messageToPublish.id,
                         content: messageToPublish.content, // URL do S3
                         metadata: messageToPublish.metadata,
                         // ... outros campos se necessário ...
                    };
                    await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
                    console.log(`[MsgProcessor ${jobId}] Notificação de ATUALIZAÇÃO de mensagem (URL S3) publicada no canal Redis do WORKSPACE.`);
                } catch (publishWsError) {
                    console.error(`[MsgProcessor ${jobId}] Falha ao publicar ATUALIZAÇÃO de mensagem no Redis (Canal Workspace):`, publishWsError);
                }

            } else {
                console.warn(`[MsgProcessor ${jobId}] Não foi possível obter URL de mídia para ID ${mediaId}. Usando placeholder.`);
                 // Mantém finalContentForHistory como o placeholder original
            }
        } catch (mediaError: any) {
            console.error(`[MsgProcessor ${jobId}] Erro durante processamento de mídia para ID ${mediaId}:`, mediaError.message);
             // Mantém finalContentForHistory como o placeholder original
        }
    } else if (mediaId && !workspace.whatsappAccessToken) {
        console.warn(`[MsgProcessor ${jobId}] Mídia ID ${mediaId} encontrado, mas Access Token do WhatsApp está ausente no workspace. Impossível processar mídia.`);
        // Mantém finalContentForHistory como o placeholder original
    }

    // --- 5. Buscar Histórico Completo (Contexto para IA) --- <<< AJUSTADO >>>
    console.log(`[MsgProcessor ${jobId}] Buscando histórico completo (limite ${HISTORY_LIMIT}) para IA...`);
    const historyMessagesRaw = await prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { timestamp: 'desc' },
      take: HISTORY_LIMIT,
      // Selecionar metadata para tratar mídias no histórico?
      select: { sender_type: true, content: true, timestamp: true, metadata: true, id: true } // Incluir ID e metadata
    });
    historyMessagesRaw.reverse();

    // --- 6. Formatar Mensagens para a API da IA --- <<< AJUSTADO >>>
    const aiMessages: CoreMessage[] = historyMessagesRaw.map((msg: HistoryMessage & { id: string }) => {
        let contentForAI = msg.content ?? '';
        const msgMetadata = msg.metadata as any;
        // Se for a mensagem atual e tiver sido processada como mídia, usar a versão formatada
        if (msg.id === newMessageId && msgMetadata?.uploadedToS3) {
            contentForAI = finalContentForHistory;
        }
        // Opcional: Detectar mídias em mensagens *anteriores* no histórico se necessário
        else if (msg.sender_type === MessageSenderType.CLIENT && msgMetadata?.mediaId && !msgMetadata?.uploadedToS3) {
            // Mensagem de mídia anterior que pode não ter sido processada (ou falhou)
            contentForAI = msgMetadata.originalContentPlaceholder || `[${msgMetadata.messageType || 'Mídia'} enviada pelo usuário (link indisponível)]`;
        }
        else if (msg.sender_type === MessageSenderType.CLIENT && msgMetadata?.mediaId && msgMetadata?.uploadedToS3) {
            // Mídia anterior já processada, usar a URL salva
             contentForAI = `[${msgMetadata.messageType || 'Mídia'} enviada pelo usuário: ${msg.content}]`;
        }

        return {
            role: msg.sender_type === MessageSenderType.CLIENT ? 'user' : 'assistant',
            // Usar o conteúdo ajustado para a IA
            content: contentForAI,
        };
    });
    console.log(`[MsgProcessor ${jobId}] Histórico formatado para IA com ${aiMessages.length} mensagens.`);
    // console.log("Histórico para IA:", JSON.stringify(aiMessages, null, 2)); // Debug (pode ser verboso)

    // --- 7. Obter Prompt e Modelo --- (Mantido)
    const modelId = conversationData.workspace.ai_model_preference || 'gpt-4o';
    const systemPrompt = conversationData.workspace.ai_default_system_prompt ?? undefined;
    console.log(`[MsgProcessor ${jobId}] Usando Modelo: ${modelId}, Prompt: ${!!systemPrompt}`);

    // --- 8. Chamar o Serviço de IA --- (Mantido)
    console.log(`[MsgProcessor ${jobId}] Chamando generateChatCompletion...`);
    const aiResponseContent = await generateChatCompletion({ messages: aiMessages, systemPrompt, modelId });

    // --- 9. Salvar e Enviar Resposta da IA --- (Mantido, mas com ajustes nas publicações)
    if (aiResponseContent && aiResponseContent.trim() !== '') {
      console.log(`[MsgProcessor ${jobId}] IA retornou conteúdo: "${aiResponseContent.substring(0, 100)}..."`);
      const newAiMessageTimestamp = new Date();

      // Salvar a resposta da IA no banco
      const newAiMessage = await prisma.message.create({
        data: {
          conversation_id: conversationId,
          sender_type: MessageSenderType.AI,
          content: aiResponseContent,
          timestamp: newAiMessageTimestamp,
        },
         // <<< Selecionar dados para publicação >>>
        select: { id: true, conversation_id: true, content: true, timestamp: true, sender_type: true }
      });
      console.log(`[MsgProcessor ${jobId}] Resposta da IA salva no DB (ID: ${newAiMessage.id}).`);

      // Publicar a nova mensagem da IA no canal Redis da CONVERSA
      try {
        const conversationChannel = `chat-updates:${conversationId}`;
        // <<< Enviar evento específico para NOVA mensagem da IA >>>
        const newAiMessagePayload = {
            type: "new_message", // <<< Tipo claro para nova mensagem
            payload: { // Incluir os dados básicos necessários para a UI
              id: newAiMessage.id,
              conversation_id: newAiMessage.conversation_id,
              sender_type: newAiMessage.sender_type,
              content: newAiMessage.content,
              timestamp: newAiMessage.timestamp,
              metadata: null // ou {} - Metadados da IA podem não ser relevantes aqui
            }
        };
        const conversationPayload = JSON.stringify(newAiMessagePayload);
        await redisConnection.publish(conversationChannel, conversationPayload);
        console.log(`[MsgProcessor ${jobId}] Mensagem da IA ${newAiMessage.id} publicada no canal Redis da CONVERSA: ${conversationChannel}`);
      } catch (publishError) {
        console.error(`[MsgProcessor ${jobId}] Falha ao publicar mensagem da IA ${newAiMessage.id} no Redis (Canal Conversa):`, publishError);
      }

      // Publicar notificação no canal Redis do WORKSPACE
       try {
          const workspaceChannel = `workspace-updates:${workspaceId}`;
          // Usar dados de `conversationData` e `newAiMessage`
          const workspacePayload = {
              type: 'new_message',
              conversationId: conversationId,
              clientId: clientId,
              messageId: newAiMessage.id, // <<< Usar o ID da mensagem da IA
              lastMessageTimestamp: newAiMessage.timestamp.toISOString(),
              channel: channel,
              status: conversationData.status, // <<< Usar status de conversationData
              is_ai_active: conversationData.is_ai_active,
              last_message_at: newAiMessage.timestamp.toISOString(),
              clientName: client?.name, // <<< Usar nome de client (pode ser null)
              clientPhone: clientPhoneNumber,
              lastMessageContent: newAiMessage.content, // <<< Usar conteúdo da IA
              lastMessageSenderType: newAiMessage.sender_type, // <<< Usar sender_type da IA
              metadata: conversationData.metadata, // <<< Usar metadata de conversationData
          };
          await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
          console.log(`[MsgProcessor ${jobId}] Notificação de msg IA publicada no canal Redis do WORKSPACE: ${workspaceChannel}`);
       } catch (publishError) {
          console.error(`[MsgProcessor ${jobId}] Falha ao publicar notificação de msg IA no Redis (Canal Workspace):`, publishError);
       }

      // Atualizar last_message_at da conversa
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: newAiMessageTimestamp }
      });
      console.log(`[MsgProcessor ${jobId}] Timestamp da conversa atualizado.`);

      // Enviar resposta via WhatsApp (se canal for WhatsApp)
      let sendSuccess = false;
      console.log(`[MsgProcessor ${jobId}] VERIFICANDO CANAL PARA ENVIO. Canal: ${channel}`);
      if (channel === 'WHATSAPP') {
            console.log(`[MsgProcessor ${jobId}] Bloco de envio WhatsApp alcançado.`);
            const { whatsappAccessToken, whatsappPhoneNumberId } = workspace;
            if (whatsappAccessToken && whatsappPhoneNumberId && clientPhoneNumber) {
                let decryptedAccessTokenForSend: string | null = null;
                try {
                    console.log(`[MsgProcessor ${jobId}] Tentando descriptografar Access Token para envio...`);
                    decryptedAccessTokenForSend = decrypt(whatsappAccessToken);
                    if (!decryptedAccessTokenForSend) throw new Error("Token de acesso descriptografado para envio está vazio.");
                    console.log(`[MsgProcessor ${jobId}] Access Token para envio descriptografado com sucesso.`);

                    console.log(`[MsgProcessor ${jobId}] Tentando enviar resposta via WhatsApp para ${clientPhoneNumber}...`);
                    const sendResult = await sendWhatsappMessage(
                        whatsappPhoneNumberId,
                        clientPhoneNumber,
                        decryptedAccessTokenForSend,
                        aiResponseContent
                    );
                    if (sendResult.success) {
                        sendSuccess = true;
                        console.log(`[MsgProcessor ${jobId}] Resposta enviada com sucesso para WhatsApp. Message ID: ${sendResult.messageId}`);
                        // <<< Opcional: Atualizar mensagem da IA com channel_message_id >>>
                        if (sendResult.messageId) {
                            await prisma.message.update({
                                where: { id: newAiMessage.id },
                                data: { channel_message_id: sendResult.messageId }
                            }).catch(err => console.error(`[MsgProcessor ${jobId}] Falha ao atualizar channel_message_id para msg IA ${newAiMessage.id}:`, err));
                        }
                    } else {
                        console.error(`[MsgProcessor ${jobId}] Falha ao enviar resposta para WhatsApp:`, JSON.stringify(sendResult.error || 'Erro desconhecido'));
                    }
                } catch (decryptOrSendError: any) {
                     console.error(`[MsgProcessor ${jobId}] Erro ao descriptografar token ou enviar via WhatsApp:`, decryptOrSendError.message);
                }
            } else {
                 console.error(`[MsgProcessor ${jobId}] Dados ausentes para envio via WhatsApp (Token: ${!!whatsappAccessToken}, PhoneID: ${!!whatsappPhoneNumberId}, ClientPhone: ${!!clientPhoneNumber}).`);
            }
      } else {
          console.warn(`[MsgProcessor ${jobId}] Canal ${channel} não é WHATSAPP. Nenhuma mensagem enviada.`);
      }

    } else {
      console.log(`[MsgProcessor ${jobId}] IA não retornou conteúdo. Nenhuma mensagem salva ou enviada.`);
    }

    console.log(`--- [MsgProcessor ${jobId}] FIM (Processou Lote) ---`);
    return { status: 'completed', handledBatch: true };

  } catch (error) {
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
      console.log(`[MsgProcessor] Job ${job.id} (Conv: ${job.data?.conversationId}) concluído. Status: ${result?.status || 'N/A'}. Razão: ${result?.reason || (result?.handledBatch ? 'Processou Lote' : 'N/A')}`);
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

} catch (initError) {
     console.error('[MsgProcessor] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1); // Sai se não conseguir inicializar
}