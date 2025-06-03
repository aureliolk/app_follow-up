// lib/workers/messageProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { MessageSenderType } from '@prisma/client';
import { CoreMessage } from 'ai';
import { decrypt } from '@/lib/encryption';
import { getWhatsappMediaUrl } from '@/lib/channel/whatsappUtils';
import { s3Client, s3BucketName } from '@/lib/s3Client';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { lookup } from 'mime-types';
import { describeImage } from '@/lib/ai/describeImage';
import { transcribeAudio } from '@/lib/ai/transcribeAudio';
import { Readable } from 'stream';
import { processAIChat } from '../ai/chatService';
import pusher from '@/lib/pusher';
import { sendWhatsAppMessage, sendEvolutionMessage } from '../services/channelService';
import logger from '@/lib/utils/logger';
import {
  QUEUE_NAME,
  HISTORY_LIMIT,
  FRACTIONED_MESSAGE_DELAY,
  DEFAULT_AI_DEBOUNCE_MS,
  DEFAULT_AI_MODEL,
  MEDIA_PLACEHOLDERS,
  AI_MESSAGE_ROLES,
  CHANNEL_TYPES,
  DEFAULT_AUDIO_TRANSCRIPTION_LANGUAGE,
} from '@/lib/constants';

interface JobData {
  conversationId: string;
  clientId: string;
  newMessageId: string;
  workspaceId: string;
}

interface WorkspaceConfig {
  id: string;
  ai_default_system_prompt: string | null;
  ai_model_preference: string | null;
  ai_name: string | null;
  ai_delay_between_messages: number | null;
  ai_send_fractionated: boolean | null;
  whatsappAccessToken: string | null;
  whatsappPhoneNumberId: string | null;
  evolution_api_instance_name: string | null;
  evolution_api_token: string | null;
}

interface ConversationData {
  id: string;
  is_ai_active: boolean;
  channel: string;
  client: {
    id: string;
    phone_number: string;
    name: string | null;
  };
  workspace: WorkspaceConfig;
}

async function processJob(job: Job<JobData>) {
  const { conversationId, newMessageId, workspaceId } = job.data;
  const jobId = job.id || 'unknown';
  
  logger.info(`[MsgProcessor ${jobId}] Processando mensagem ${newMessageId} (Conv: ${conversationId})`);

  try {
    // 1. Buscar dados da mensagem e conversa
    const messageData = await fetchMessageAndConversation(newMessageId);
    if (!messageData) {
      throw new Error(`Mensagem ${newMessageId} não encontrada`);
    }

    const { message, conversation } = messageData;
    
    // 2. Validar se deve processar
    if (!conversation.is_ai_active) {
      console.log(`[MsgProcessor ${jobId}] IA inativa para conversa ${conversationId}`);
      return { status: 'skipped', reason: 'IA inativa' };
    }

    // 3. Aplicar DEBOUNCE usando ai_delay_between_messages
    const debounceMs = Number(conversation.workspace.ai_delay_between_messages) || 3000;
    console.log(`[MsgProcessor ${jobId}] Aplicando debounce de ${debounceMs}ms...`);
    await new Promise(resolve => setTimeout(resolve, debounceMs));
    console.log(`[MsgProcessor ${jobId}] Debounce concluído.`);

    // 4. Verificar se é a mensagem mais recente (após debounce)
    const isLatestMessage = await checkIfLatestMessage(conversationId, newMessageId);
    if (!isLatestMessage) {
      console.log(`[MsgProcessor ${jobId}] Não é a mensagem mais recente após debounce. Pulando processamento IA`);
      return { status: 'skipped', reason: 'Não é a mensagem mais recente após debounce' };
    }

    // 5. Processar mídia se necessário
    await processMediaIfExists(message, conversation, conversation.workspace, jobId);

    // 6. Gerar resposta da IA
    const aiResponse = await generateAIResponse(conversationId, conversation.workspace, jobId);
    if (!aiResponse) {
      console.log(`[MsgProcessor ${jobId}] Não foi possível gerar resposta da IA`);
      return { status: 'failed', reason: 'Falha na geração da resposta IA' };
    }

    // 7. Enviar resposta baseada na configuração
    await sendAIResponse({
      aiResponse,
      conversation,
      workspaceId,
      jobId
    });

    // 8. Atualizar timestamp da conversa
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { last_message_at: new Date() }
    });

    console.log(`[MsgProcessor ${jobId}] Processamento concluído com sucesso`);
    return { status: 'success' };

  } catch (error: any) {
    console.error(`[MsgProcessor ${jobId}] Erro no processamento:`, error.message);
    throw error;
  }
}

// --- FUNÇÕES AUXILIARES ---

async function fetchMessageAndConversation(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      content: true,
      metadata: true,
      media_url: true,
      media_mime_type: true,
      ai_media_analysis: true,
      timestamp: true,
      conversation: {
        select: {
          id: true,
          is_ai_active: true,
          channel: true,
          client: {
            select: {
              id: true,
              phone_number: true,
              name: true,
            }
          },
          workspace: {
            select: {
              id: true,
              ai_default_system_prompt: true,
              ai_model_preference: true,
              ai_name: true,
              ai_delay_between_messages: true,
              ai_send_fractionated: true,
              whatsappAccessToken: true,
              whatsappPhoneNumberId: true,
              evolution_api_instance_name: true,
              evolution_api_token: true
            }
          }
        }
      }
    }
  });

  if (!message?.conversation) return null;

  // Log das configurações do workspace para debug
  const workspace = message.conversation.workspace;
  logger.debug(`[MsgProcessor] Configurações do Workspace ${workspace.id}:`);
  logger.debug(`  - ai_delay_between_messages: ${workspace.ai_delay_between_messages}ms (usado como DEBOUNCE entre jobs)`);
  logger.debug(`  - ai_send_fractionated: ${workspace.ai_send_fractionated} (fracionamento de mensagens)`);
  logger.debug(`  - FRACTIONED_MESSAGE_DELAY: ${FRACTIONED_MESSAGE_DELAY}ms (delay fixo entre parágrafos)`);
  logger.debug(`  - ai_name: ${workspace.ai_name}`);

  return {
    message,
    conversation: message.conversation as ConversationData
  };
}

async function checkIfLatestMessage(conversationId: string, messageId: string): Promise<boolean> {
  const lastAiMessage = await prisma.message.findFirst({
    where: { 
      conversation_id: conversationId, 
      sender_type: MessageSenderType.AI 
    },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true }
  });

  const newClientMessages = await prisma.message.findMany({
    where: {
      conversation_id: conversationId,
      sender_type: MessageSenderType.CLIENT,
      timestamp: { gt: lastAiMessage?.timestamp || new Date(0) }
    },
    orderBy: { timestamp: 'asc' },
    select: { id: true }
  });

  return newClientMessages.length > 0 && 
         messageId === newClientMessages[newClientMessages.length - 1].id;
}

async function processMediaIfExists(message: any, conversation: ConversationData, workspace: WorkspaceConfig, jobId: string) {
  // MODIFICADO: Adicionar lógica para Evolution API (Base64)
  const isWhatsappCloudAPI = message.metadata?.mediaId && workspace.whatsappAccessToken;
  const isEvolutionAPI = conversation.channel === 'WHATSAPP_EVOLUTION' && message.metadata?.mediaData_base64 && message.metadata?.mediaType?.startsWith('audio/'); // Verificar se tem base64 e é áudio

  if (!isWhatsappCloudAPI && !isEvolutionAPI) {
    // Se não for nenhum dos casos, sair
    return;
  }

  try {
    logger.info(`[MsgProcessor ${jobId}] Processando mídia. Canal: ${conversation.channel}`);

    let mediaBuffer: Buffer;
    let mimeType = message.metadata.mediaType;
    let mediaSourceUrl: string | null = null; // Para registrar a URL original (se houver)

    if (isWhatsappCloudAPI) {
      logger.debug(`[MsgProcessor ${jobId}] Fonte: WhatsApp Cloud API`);
      const decryptedToken = decrypt(workspace.whatsappAccessToken as string); // Garantir que não é null aqui
      if (!decryptedToken) throw new Error('Falha ao descriptografar token do WhatsApp');

      const mediaUrl = await getWhatsappMediaUrl(message.metadata.mediaId, decryptedToken);
      mediaSourceUrl = mediaUrl; // Registrar URL original
      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${decryptedToken}` }
      });
      mediaBuffer = Buffer.from(response.data);
    } else { // isEvolutionAPI
      logger.debug(`[MsgProcessor ${jobId}] Fonte: Evolution API (Base64)`);
      const base64Data = message.metadata.mediaData_base64 as string; // Garantir que é string
      // Decodificar o base64 para Buffer
      mediaBuffer = Buffer.from(base64Data, 'base64');
      // O mimeType já deve estar no metadata, mas garantir
      if (!mimeType) {
          // Tentar inferir mime type se estiver faltando no metadata
          mimeType = lookup(mediaBuffer.subarray(0, 20).toString('hex')) || 'application/octet-stream';
          logger.warn(`[MsgProcessor ${jobId}] Mime type faltando no metadata, inferido como: ${mimeType}`);
      }
      mediaSourceUrl = message.metadata.mediaUrl || null; // Registrar URL original da Evolution, se houver
    }

    // Upload para S3 (Este passo é comum para ambos os canais)
    // Gerar um nome de arquivo baseado no timestamp e ID da mensagem para evitar colisões
    const fileExtension = lookup(mimeType) ? '.' + lookup(mimeType) : '';
    // Usar timestamp + ID da mensagem para nome único, convertendo timestamp para string explicitamente
    const s3Key = `media/${workspace.id}/${conversation.id}/${message.timestamp.getTime().toString()}-${message.id}${fileExtension}`;
    logger.debug(`[MsgProcessor ${jobId}] Fazendo upload para S3 key: ${s3Key}`);

    await s3Client.send(new PutObjectCommand({
      Bucket: s3BucketName,
      Key: s3Key,
      Body: mediaBuffer,
      ContentType: mimeType,
    }));

    const mediaS3Url = `${process.env.STORAGE_ENDPOINT?.replace(/\/$/, '')}/${s3BucketName}/${s3Key}`;
    logger.info(`[MsgProcessor ${jobId}] Upload para S3 concluído. URL: ${mediaS3Url}`);


    // Processar com IA
    let aiAnalysis = null;
    const mediaPrimaryType = mimeType.split('/')[0];

    if (mediaPrimaryType === 'image') {
      logger.debug(`[MsgProcessor ${jobId}] Enviando imagem para análise de IA...`);
      aiAnalysis = await describeImage(mediaBuffer);
      logger.debug(`[MsgProcessor ${jobId}] Análise de imagem concluída.`);
    } else if (mediaPrimaryType === 'audio') {
      logger.debug(`[MsgProcessor ${jobId}] Enviando áudio para transcrição...`);
      // Para Evolution, o mimeType já deve ser correto (e.g., 'audio/ogg; codecs=opus')
      // Podemos usar o mimeType diretamente
      aiAnalysis = await transcribeAudio(mediaBuffer, mimeType, undefined, DEFAULT_AUDIO_TRANSCRIPTION_LANGUAGE); // Assumindo pt-BR
      logger.debug(`[MsgProcessor ${jobId}] Transcrição de áudio concluída.`);
    } else {
        logger.info(`[MsgProcessor ${jobId}] Tipo de mídia (${mimeType}) não suportado para análise de IA.`);
    }

    // Atualizar mensagem no banco com URL do S3, análise de IA e status
    const updateData: any = {
      media_url: mediaS3Url,
      media_mime_type: mimeType, // Salvar o mime type determinado
      status: 'RECEIVED' // Marcar como recebida após processamento
    };

    if (aiAnalysis) {
        updateData.ai_media_analysis = aiAnalysis;
        // Se o conteúdo original for apenas o placeholder, atualizar com a análise/transcrição
        // ou adicionar a análise ao conteúdo existente. Decidi adicionar ao conteúdo.
        if (message.content === MEDIA_PLACEHOLDERS.AUDIO_RECEIVED || message.content === MEDIA_PLACEHOLDERS.IMAGE_RECEIVED || message.content === `[${mediaPrimaryType === 'image' ? 'Imagem' : 'Mídia'} Recebida]`) {
             updateData.content = `[${mediaPrimaryType === 'image' ? MEDIA_PLACEHOLDERS.IMAGE_ANALYZED : MEDIA_PLACEHOLDERS.AUDIO_TRANSCRIBED}]: ${aiAnalysis}`;
        } else if (aiAnalysis !== MEDIA_PLACEHOLDERS.ANALYSIS_EMPTY && aiAnalysis !== '[]') { // Evitar adicionar análise vazia
             // Se já houver conteúdo (ex: caption da imagem), adicionar a análise.
             // Limitar o tamanho do conteúdo para evitar estouro no DB? Por enquanto, adicionar.
             updateData.content = `${message.content}\n${MEDIA_PLACEHOLDERS.ANALYSIS_PREFIX}${aiAnalysis}]`;
        } else {
             // Se a análise for vazia ou placeholder, manter o conteúdo original ou placeholder
             logger.debug(`[MsgProcessor ${jobId}] Análise de IA vazia ou placeholder, mantendo conteúdo original.`);
        }
    } else if (mediaPrimaryType === 'audio') {
         // Se for áudio e não houve análise (ex: erro na transcrição), manter o placeholder original.
         updateData.content = message.content || MEDIA_PLACEHOLDERS.AUDIO_TRANSCRIPTION_FAILED;
         logger.warn(`[MsgProcessor ${jobId}] Falha na transcrição de áudio para mensagem ${message.id}.`);
    } else {
         // Para outras mídias sem análise, manter o conteúdo original (caption/placeholder).
         updateData.content = message.content;
    }

    // Adicionar URL original ao metadata, se houver e não estiver lá
    const currentMetadata = (typeof message.metadata === 'object' && message.metadata !== null) ? message.metadata : {};
     if (mediaSourceUrl && !currentMetadata.mediaSourceUrl) {
         updateData.metadata = {
             ...currentMetadata,
             mediaSourceUrl: mediaSourceUrl,
             processedAt: new Date().toISOString(), // Adicionar timestamp de processamento
         };
     } else {
          // Apenas adicionar timestamp de processamento se metadata já existe
          updateData.metadata = {
              ...currentMetadata,
              processedAt: new Date().toISOString(),
          };
     }


    await prisma.message.update({
      where: { id: message.id },
      data: updateData
    });

    logger.info(`[MsgProcessor ${jobId}] Mensagem ${message.id} atualizada com detalhes da mídia e análise.`);

    // TODO: Considerar disparar um Pusher event 'media_processed' ou 'message_updated' aqui
    // para que a UI possa atualizar a mensagem em tempo real com a transcrição/análise.
    // Isso evita que a UI mostre "[Áudio Recebido]" até a próxima recarga da conversa.
    try {
        await pusher.trigger(`private-workspace-${workspace.id}`, 'message_updated', {
            type: 'message_updated',
            payload: {
                id: message.id,
                conversation_id: message.conversation.id, // Usar o ID da conversa
                content: updateData.content, // Enviar o conteúdo atualizado (com transcrição/análise)
                media_url: updateData.media_url,
                media_mime_type: updateData.media_mime_type,
                ai_media_analysis: updateData.ai_media_analysis,
                status: updateData.status,
                timestamp: message.timestamp.toISOString(), // Manter o timestamp original
                sender_type: message.sender_type, // Manter o tipo de sender
                metadata: updateData.metadata, // Incluir metadata atualizado
                channel_message_id: message.channel_message_id,
                providerMessageId: message.providerMessageId,
            }
        });
        logger.debug(`[MsgProcessor ${jobId}] Evento 'message_updated' disparado para mensagem ${message.id}.`);
    } catch (pusherError: any) {
        logger.error(`[MsgProcessor ${jobId}] Falha ao disparar evento 'message_updated' para mensagem ${message.id}:`, pusherError?.message || pusherError);
    }


  } catch (error: any) {
    logger.error(`[MsgProcessor ${jobId}] Erro no processamento de mídia:`, error.message);
    // Se o processamento de mídia falhar, não vamos falhar o job principal.
    // A mensagem ficará sem a análise de IA, mas o fluxo de resposta da IA ainda pode tentar prosseguir
    // baseado no conteúdo "[Áudio Recebido]". Talvez seja melhor logar e continuar.
  }
}

async function generateAIResponse(conversationId: string, workspace: WorkspaceConfig, jobId: string): Promise<string | null> {
  try {
    logger.info(`[MsgProcessor ${jobId}] Gerando resposta da IA`);

    // Buscar histórico
    const history = await prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { timestamp: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        sender_type: true,
        content: true,
        ai_media_analysis: true,
        media_url: true,
        media_mime_type: true,
      }
    });

    // Formatar mensagens para IA
    const aiMessages: CoreMessage[] = history.reverse().map(msg => {
      if (msg.sender_type === MessageSenderType.CLIENT) {
        let content = msg.content || '';
        if (msg.ai_media_analysis) {
          content += `\n${MEDIA_PLACEHOLDERS.ANALYSIS_PREFIX}${msg.ai_media_analysis}]`;
        }
        return { role: AI_MESSAGE_ROLES.USER, content } as CoreMessage;
      } else {
        return { role: AI_MESSAGE_ROLES.ASSISTANT, content: msg.content || '' } as CoreMessage;
      }
    });

    logger.debug(`[MsgProcessor ${jobId}] Mensagens formatadas para IA:`, aiMessages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content.substring(0, 100) + '...' : '[Non-string content]'
    })));

    // Processar com IA
    const modelId = workspace.ai_model_preference || DEFAULT_AI_MODEL;
    const systemPrompt = workspace.ai_default_system_prompt || undefined;
    
    const aiResult = await processAIChat(aiMessages, workspace.id, conversationId, true, modelId, systemPrompt);
    
    // Consumir stream
    const reader = (aiResult as ReadableStream<any>).getReader();
    let response = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (typeof value === 'string') {
        response += value;
      } else if (value?.type === 'text-delta' && value.textDelta) {
        response += value.textDelta;
      } else if (value?.type === 'text' && value.text) {
        response += value.text;
      }
    }

    logger.debug(`[MsgProcessor ${jobId}] Resposta bruta da IA:`, response);
    logger.info(`[MsgProcessor ${jobId}] Resposta da IA gerada: ${response.substring(0, 100)}...`);
    return response.trim() || null;

  } catch (error: any) {
    logger.error(`[MsgProcessor ${jobId}] Erro ao gerar resposta da IA:`, error.message);
    return null;
  }
}

interface SendAIResponseParams {
  aiResponse: string;
  conversation: ConversationData;
  workspaceId: string;
  jobId: string;
}

async function sendAIResponse({ aiResponse, conversation, workspaceId, jobId }: SendAIResponseParams) {
  const shouldFractionate = conversation.workspace.ai_send_fractionated === true;

  console.log(`[MsgProcessor ${jobId}] Configuração: Fracionado=${shouldFractionate}`);

  if (shouldFractionate) {
    logger.info(`[MsgProcessor ${jobId}] Enviando resposta fracionada`);
    const paragraphs = aiResponse.split(/\n\s*\n/).filter(p => p.trim() !== '');
    logger.debug(`[MsgProcessor ${jobId}] Dividido em ${paragraphs.length} parágrafos`);
    
    for (let i = 0; i < paragraphs.length; i++) {
      logger.debug(`[MsgProcessor ${jobId}] Enviando parágrafo ${i + 1}/${paragraphs.length}`);
      
      await sendSingleMessage({
        content: paragraphs[i].trim(),
        conversation,
        workspaceId,
        jobId,
        messageIndex: i + 1,
        totalMessages: paragraphs.length
      });

      // Aplicar delay FIXO de 3s entre mensagens fracionadas (exceto na última)
      if (i < paragraphs.length - 1) {
        logger.debug(`[MsgProcessor ${jobId}] Aplicando delay fixo de ${FRACTIONED_MESSAGE_DELAY}ms entre parágrafos...`);
        await new Promise(resolve => setTimeout(resolve, FRACTIONED_MESSAGE_DELAY));
        logger.debug(`[MsgProcessor ${jobId}] Delay entre parágrafos concluído.`);
      }
    }
    logger.info(`[MsgProcessor ${jobId}] Todos os ${paragraphs.length} parágrafos foram enviados`);
  } else {
    logger.info(`[MsgProcessor ${jobId}] Enviando resposta única (sem fracionamento)`);
    await sendSingleMessage({
      content: aiResponse,
      conversation,
      workspaceId,
      jobId,
      messageIndex: 1,
      totalMessages: 1
    });
  }
}

interface SendSingleMessageParams {
  content: string;
  conversation: ConversationData;
  workspaceId: string;
  jobId: string;
  messageIndex: number;
  totalMessages: number;
}

async function sendSingleMessage({ content, conversation, workspaceId, jobId, messageIndex, totalMessages }: SendSingleMessageParams) {
  try {
    logger.debug(`[MsgProcessor ${jobId}] Criando mensagem ${messageIndex}/${totalMessages} no banco...`);
    
    // Criar mensagem no banco
    const newMessage = await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        sender_type: MessageSenderType.AI,
        content,
        timestamp: new Date(),
        status: 'PENDING',
      }
    });

    logger.info(`[MsgProcessor ${jobId}] Mensagem ${messageIndex}/${totalMessages} criada (ID: ${newMessage.id})`);

    // Publicar no Pusher IMEDIATAMENTE após criação
    try {
      await pusher.trigger(`private-workspace-${workspaceId}`, 'new_message', {
        type: "new_message",
        payload: {
          id: newMessage.id,
          conversation_id: newMessage.conversation_id,
          sender_type: newMessage.sender_type,
          content: newMessage.content,
          status: newMessage.status,
          timestamp: newMessage.timestamp.toISOString(),
        }
      });
      logger.debug(`[MsgProcessor ${jobId}] Mensagem ${messageIndex} publicada no Pusher`);
    } catch (pusherError) {
      logger.error(`[MsgProcessor ${jobId}] Erro no Pusher para mensagem ${messageIndex}:`, pusherError);
    }

    // Enviar via canal (WhatsApp/Evolution)
    logger.debug(`[MsgProcessor ${jobId}] Enviando mensagem ${messageIndex} via canal ${conversation.channel}...`);
    const sendResult = await sendViaChannel(content, conversation, newMessage.id, jobId);

    // Atualizar status baseado no resultado
    const updateData = {
      status: sendResult.success ? 'SENT' as const : 'FAILED' as const,
      channel_message_id: sendResult.messageId || null,
      ...(sendResult.success ? {} : { errorMessage: sendResult.error })
    };

    await prisma.message.update({
      where: { id: newMessage.id },
      data: {
        ...updateData,
        providerMessageId: updateData.channel_message_id, // Ensure providerMessageId is also set
      }
    });

    // Adicionar novo pusher trigger aqui para notificar a UI do status final
    try {
      await pusher.trigger(`private-workspace-${workspaceId}`, 'message_status_update', {
        type: "message_status_update",
        payload: {
          id: newMessage.id,
          status: updateData.status, // Envia o status atualizado
          channel_message_id: updateData.channel_message_id,
          errorMessage: (updateData as any).errorMessage // Inclui erro se falhou
        }
      });
      logger.debug(`[MsgProcessor ${jobId}] Status da mensagem ${newMessage.id} (${updateData.status}) publicado no Pusher`);
    } catch (pusherError) {
      logger.error(`[MsgProcessor ${jobId}] Erro no Pusher para atualização de status:`, pusherError);
    }

    const statusText = sendResult.success ? 'ENVIADA com sucesso' : `FALHOU (${sendResult.error})`;
    logger.info(`[MsgProcessor ${jobId}] Mensagem ${messageIndex}/${totalMessages} ${statusText}`);

    return { success: sendResult.success, messageId: newMessage.id };

  } catch (error: any) {
    logger.error(`[MsgProcessor ${jobId}] ERRO CRÍTICO ao processar mensagem ${messageIndex}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendViaChannel(content: string, conversation: ConversationData, messageId: string, jobId: string) {
  const { channel, client, workspace } = conversation;
  const clientPhone = client.phone_number;

  try {
    if (channel === CHANNEL_TYPES.WHATSAPP_CLOUDAPI) {
      if (!workspace.whatsappAccessToken || !workspace.whatsappPhoneNumberId) {
        logger.warn(`[MsgProcessor ${jobId}] Configuração WhatsApp ausente para canal ${channel}`);
        return { success: false, error: 'Configuração WhatsApp ausente' };
      }

      const result = await sendWhatsAppMessage(
        workspace.whatsappPhoneNumberId,
        clientPhone,
        workspace.whatsappAccessToken,
        content,
        workspace.ai_name || undefined
      );

      return {
        success: result.success,
        messageId: result.wamid,
        error: result.success ? null : result.error
      };

    } else if (channel === CHANNEL_TYPES.WHATSAPP_EVOLUTION) {
      if (!workspace.evolution_api_token || !workspace.evolution_api_instance_name) {
        logger.warn(`[MsgProcessor ${jobId}] Configuração Evolution API ausente para canal ${channel}`);
        return { success: false, error: 'Configuração Evolution ausente' };
      }

      const result = await sendEvolutionMessage({
        endpoint: process.env.apiUrlEvolution,
        apiKey: workspace.evolution_api_token,
        instanceName: workspace.evolution_api_instance_name,
        toPhoneNumber: clientPhone,
        messageContent: content,
        senderName: workspace.ai_name || undefined
      });

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.success ? null : result.error
      };
    }

    logger.warn(`[MsgProcessor ${jobId}] Canal ${channel} não suportado`);
    return { success: false, error: `Canal ${channel} não suportado` };

  } catch (error: any) {
    logger.error(`[MsgProcessor ${jobId}] Erro no envio via canal:`, error.message);
    return { success: false, error: error.message };
  }
}

// --- Inicialização do Worker ---
logger.info(`[MsgProcessor] Inicializando worker...`);

const worker = new Worker<JobData>(QUEUE_NAME, processJob, {
  connection: redisConnection,
  concurrency: 3,
});

worker.on('completed', (job, result) => {
  logger.info(`[MsgProcessor] Job ${job.id} concluído: ${result.status}`);
});

worker.on('failed', (job, err) => {
  logger.error(`[MsgProcessor] Job ${job?.id} falhou:`, err.message);
});

worker.on('error', (err) => {
  logger.error('[MsgProcessor] Erro do worker:', err);
});

logger.info(`[MsgProcessor] Worker ativo na fila "${QUEUE_NAME}"`);
