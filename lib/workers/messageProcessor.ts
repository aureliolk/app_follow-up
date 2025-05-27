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

const QUEUE_NAME = 'message-processing';
const HISTORY_LIMIT = 20;

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
  
  console.log(`[MsgProcessor ${jobId}] Processando mensagem ${newMessageId} (Conv: ${conversationId})`);

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

    // 3. Verificar se é a mensagem mais recente (debounce)
    const isLatestMessage = await checkIfLatestMessage(conversationId, newMessageId);
    if (!isLatestMessage) {
      console.log(`[MsgProcessor ${jobId}] Não é a mensagem mais recente. Pulando processamento IA`);
      return { status: 'skipped', reason: 'Não é a mensagem mais recente' };
    }

    // 4. Processar mídia se necessário
    await processMediaIfExists(message, conversation.workspace, jobId);

    // 5. Gerar resposta da IA
    const aiResponse = await generateAIResponse(conversationId, conversation.workspace, jobId);
    if (!aiResponse) {
      console.log(`[MsgProcessor ${jobId}] Não foi possível gerar resposta da IA`);
      return { status: 'failed', reason: 'Falha na geração da resposta IA' };
    }

    // 6. Enviar resposta baseada na configuração
    await sendAIResponse({
      aiResponse,
      conversation,
      workspaceId,
      jobId
    });

    // 7. Atualizar timestamp da conversa
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
  console.log(`[DEBUG] Configurações do Workspace ${workspace.id}:`);
  console.log(`  - ai_delay_between_messages: ${workspace.ai_delay_between_messages} (tipo: ${typeof workspace.ai_delay_between_messages})`);
  console.log(`  - ai_send_fractionated: ${workspace.ai_send_fractionated} (tipo: ${typeof workspace.ai_send_fractionated})`);
  console.log(`  - ai_name: ${workspace.ai_name}`);

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

async function processMediaIfExists(message: any, workspace: WorkspaceConfig, jobId: string) {
  // Simplificado - apenas para WhatsApp Cloud API
  if (!message.metadata?.mediaId || !workspace.whatsappAccessToken) {
    return;
  }

  try {
    console.log(`[MsgProcessor ${jobId}] Processando mídia: ${message.metadata.mediaId}`);
    
    const decryptedToken = decrypt(workspace.whatsappAccessToken);
    if (!decryptedToken) throw new Error('Falha ao descriptografar token');

    const mediaUrl = await getWhatsappMediaUrl(message.metadata.mediaId, decryptedToken);
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${decryptedToken}` }
    });

    const mediaBuffer = Buffer.from(response.data);
    const mimeType = message.metadata.mimeType;
    
    // Upload para S3
    const s3Key = `media/${workspace.id}/${message.conversation.id}/${message.id}${lookup(mimeType) ? '.' + lookup(mimeType) : ''}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: s3BucketName,
      Key: s3Key,
      Body: mediaBuffer,
      ContentType: mimeType,
    }));

    const mediaS3Url = `${process.env.STORAGE_ENDPOINT?.replace(/\/$/, '')}/${s3BucketName}/${s3Key}`;

    // Processar com IA
    let aiAnalysis = null;
    const mediaType = mimeType.split('/')[0];
    
    if (mediaType === 'image') {
      aiAnalysis = await describeImage(mediaBuffer);
    } else if (mediaType === 'audio') {
      aiAnalysis = await transcribeAudio(mediaBuffer, mimeType, undefined, 'pt');
    }

    // Atualizar mensagem
    await prisma.message.update({
      where: { id: message.id },
      data: {
        content: `[${mediaType === 'image' ? 'Imagem' : 'Mídia'} Recebida]`,
        ai_media_analysis: aiAnalysis,
        media_url: mediaS3Url,
        media_mime_type: mimeType,
        status: 'RECEIVED'
      }
    });

    console.log(`[MsgProcessor ${jobId}] Mídia processada com sucesso`);
  } catch (error: any) {
    console.error(`[MsgProcessor ${jobId}] Erro no processamento de mídia:`, error.message);
  }
}

async function generateAIResponse(conversationId: string, workspace: WorkspaceConfig, jobId: string): Promise<string | null> {
  try {
    console.log(`[MsgProcessor ${jobId}] Gerando resposta da IA`);

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
          content += `\n[Análise da mídia: ${msg.ai_media_analysis}]`;
        }
        return { role: 'user', content };
      } else {
        return { role: 'assistant', content: msg.content || '' };
      }
    });

    // Processar com IA
    const modelId = workspace.ai_model_preference || 'openrouter/google/gemini-2.0-flash-001';
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

    console.log(`[MsgProcessor ${jobId}] Resposta da IA gerada: ${response.substring(0, 100)}...`);
    return response.trim() || null;

  } catch (error: any) {
    console.error(`[MsgProcessor ${jobId}] Erro ao gerar resposta da IA:`, error.message);
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
  const delayMs = Number(conversation.workspace.ai_delay_between_messages) || 3000;

  console.log(`[MsgProcessor ${jobId}] Configuração: Fracionado=${shouldFractionate}, Delay=${delayMs}ms`);

  if (shouldFractionate) {
    console.log(`[MsgProcessor ${jobId}] Enviando resposta fracionada`);
    const paragraphs = aiResponse.split(/\n\s*\n/).filter(p => p.trim() !== '');
    console.log(`[MsgProcessor ${jobId}] Dividido em ${paragraphs.length} parágrafos`);
    
    for (let i = 0; i < paragraphs.length; i++) {
      console.log(`[MsgProcessor ${jobId}] Enviando parágrafo ${i + 1}/${paragraphs.length}`);
      
      await sendSingleMessage({
        content: paragraphs[i].trim(),
        conversation,
        workspaceId,
        jobId,
        messageIndex: i + 1,
        totalMessages: paragraphs.length
      });

      // Aplicar delay APÓS cada mensagem (exceto a última)
      if (i < paragraphs.length - 1 && delayMs > 0) {
        console.log(`[MsgProcessor ${jobId}] Aplicando delay de ${delayMs}ms antes do próximo parágrafo...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        console.log(`[MsgProcessor ${jobId}] Delay concluído, prosseguindo...`);
      }
    }
    console.log(`[MsgProcessor ${jobId}] Todos os ${paragraphs.length} parágrafos foram enviados`);
  } else {
    console.log(`[MsgProcessor ${jobId}] Enviando resposta única (sem fracionamento)`);
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
    console.log(`[MsgProcessor ${jobId}] Criando mensagem ${messageIndex}/${totalMessages} no banco...`);
    
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

    console.log(`[MsgProcessor ${jobId}] Mensagem ${messageIndex}/${totalMessages} criada (ID: ${newMessage.id})`);

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
      console.log(`[MsgProcessor ${jobId}] Mensagem ${messageIndex} publicada no Pusher`);
    } catch (pusherError) {
      console.error(`[MsgProcessor ${jobId}] Erro no Pusher para mensagem ${messageIndex}:`, pusherError);
    }

    // Enviar via canal (WhatsApp/Evolution)
    console.log(`[MsgProcessor ${jobId}] Enviando mensagem ${messageIndex} via canal ${conversation.channel}...`);
    const sendResult = await sendViaChannel(content, conversation, newMessage.id, jobId);

    // Atualizar status baseado no resultado
    const updateData = {
      status: sendResult.success ? 'SENT' as const : 'FAILED' as const,
      channel_message_id: sendResult.messageId || null,
      ...(sendResult.success ? {} : { errorMessage: sendResult.error })
    };

    await prisma.message.update({
      where: { id: newMessage.id },
      data: updateData
    });

    const statusText = sendResult.success ? 'ENVIADA com sucesso' : `FALHOU (${sendResult.error})`;
    console.log(`[MsgProcessor ${jobId}] Mensagem ${messageIndex}/${totalMessages} ${statusText}`);

    return { success: sendResult.success, messageId: newMessage.id };

  } catch (error: any) {
    console.error(`[MsgProcessor ${jobId}] ERRO CRÍTICO ao processar mensagem ${messageIndex}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendViaChannel(content: string, conversation: ConversationData, messageId: string, jobId: string) {
  const { channel, client, workspace } = conversation;
  const clientPhone = client.phone_number;

  try {
    if (channel === 'WHATSAPP' || channel === 'WHATSAPP_CLOUDAPI') {
      if (!workspace.whatsappAccessToken || !workspace.whatsappPhoneNumberId) {
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

    } else if (channel === 'WHATSAPP_EVOLUTION') {
      if (!workspace.evolution_api_token || !workspace.evolution_api_instance_name) {
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

    return { success: false, error: `Canal ${channel} não suportado` };

  } catch (error: any) {
    console.error(`[MsgProcessor ${jobId}] Erro no envio via canal:`, error.message);
    return { success: false, error: error.message };
  }
}

// Helper para converter Stream para Buffer
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// --- Inicialização do Worker ---
console.log(`[MsgProcessor] Inicializando worker...`);

const worker = new Worker<JobData>(QUEUE_NAME, processJob, {
  connection: redisConnection,
  concurrency: 3,
});

worker.on('completed', (job, result) => {
  console.log(`[MsgProcessor] Job ${job.id} concluído: ${result.status}`);
});

worker.on('failed', (job, err) => {
  console.error(`[MsgProcessor] Job ${job?.id} falhou:`, err.message);
});

worker.on('error', (err) => {
  console.error('[MsgProcessor] Erro do worker:', err);
});

console.log(`[MsgProcessor] Worker ativo na fila "${QUEUE_NAME}"`);