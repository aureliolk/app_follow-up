// lib/workers/messageProcessor.ts

import { prisma } from '@/lib/db';
import { MessageSenderType } from '@prisma/client';
import pusher from '@/lib/pusher';
import { sendWhatsAppMessage, sendEvolutionMessage } from '../services/channelService';
import logger from '@/lib/utils/logger';
import { FRACTIONED_MESSAGE_DELAY, CHANNEL_TYPES, DEFAULT_AI_MODEL, AI_MESSAGE_ROLES, MEDIA_PLACEHOLDERS, HISTORY_LIMIT } from '@/lib/constants';
import { processAIChat } from '../ai/chatService';
import { CoreMessage } from 'ai';


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

interface SendAIResponseParams {
  messageContentOutput: string;
  newMessageId: string;
  workspaceId: string;
  aiModel : string
}

export async function sendAIResponse({ messageContentOutput, newMessageId, workspaceId, aiModel }: SendAIResponseParams) {
  const { conversation } = await fetchMessageAndConversation(newMessageId);
  const shouldFractionate = conversation.workspace.ai_send_fractionated === true;
  console.log(`[MsgProcessor Configuração: Fracionado=${shouldFractionate}`);

  const aiResult = await processAIChat(
    [{ role: 'user', content: messageContentOutput }],
    workspaceId,
    conversation.id,
    true,
    aiModel,
    ""
  )

  const reader = (aiResult as ReadableStream<any>).getReader();
  let aiResponse = ""
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (typeof value === 'string') {
      aiResponse += value;
    } else if (value?.type === 'text-delta' && value.textDelta) {
      aiResponse += value.textDelta;
    } else if (value?.type === 'text' && value.text) {
      aiResponse += value.text;
    }
  }
  aiResponse.trim()

  console.log(`[MsgProcessor Resultado do processamento de IA:`, aiResponse);

  if (!aiResponse) {
    throw new Error('Failed to generate AI response - empty or invalid response');
  }

  if (shouldFractionate) {
    logger.info(`[MsgProcessor Enviando resposta fracionada`);
    const paragraphs = aiResponse.split(/\n\s*\n/).filter(p => p.trim() !== '');
    logger.debug(`[MsgProcessor Dividido em ${paragraphs.length} parágrafos`);

    for (let i = 0; i < paragraphs.length; i++) {
      logger.debug(`[MsgProcessor Enviando parágrafo ${i + 1}/${paragraphs.length}`);

      await sendSingleMessage({
        content: paragraphs[i].trim(),
        conversation,
        workspaceId,
      });

      if (i < paragraphs.length - 1) {
        logger.debug(`[MsgProcessor Aplicando delay fixo de ${FRACTIONED_MESSAGE_DELAY}ms entre parágrafos...`);
        await new Promise(resolve => setTimeout(resolve, FRACTIONED_MESSAGE_DELAY));
        logger.debug(`[MsgProcessor Delay entre parágrafos concluído.`);
      }
    }
    logger.info(`[MsgProcessor Todos os ${paragraphs.length} parágrafos foram enviados`);
  } else {
    logger.info(`[MsgProcessor Enviando resposta única (sem fracionamento)`);
    await sendSingleMessage({
      content: aiResponse,
      conversation,
      workspaceId,
    });
  }
}

interface SendSingleMessageParams {
  content: string;
  conversation: ConversationData;
  workspaceId: string;
}

async function sendSingleMessage({ content, conversation, workspaceId }: SendSingleMessageParams) {
  try {
    logger.debug(`[MsgProcessor Criando mensagem no banco...`);

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

    logger.info(`[MsgProcessor Mensagem criada (ID: ${newMessage.id})`);

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
      logger.debug(`[MsgProcessor Mensagem publicada no Pusher`);
    } catch (pusherError) {
      logger.error(`[MsgProcessor Erro no Pusher para mensagem:`, pusherError);
    }

    // Enviar via canal (WhatsApp/Evolution)
    logger.debug(`[MsgProcessor] Enviando mensagem via canal ${conversation.channel}...`);
    const sendResult = await sendViaChannel(content, conversation, newMessage.id,);

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
      logger.debug(`[MsgProcessor Status da mensagem ${newMessage.id} (${updateData.status}) publicado no Pusher`);
    } catch (pusherError) {
      logger.error(`[MsgProcessor Erro no Pusher para atualização de status:`, pusherError);
    }

    const statusText = sendResult.success ? 'ENVIADA com sucesso' : `FALHOU (${sendResult.error})`;
    logger.info(`[MsgProcessor Mensagem  ${statusText}`);

    return { success: sendResult.success, messageId: newMessage.id };

  } catch (error: any) {
    logger.error(`[MsgProcessor ERRO CRÍTICO ao processar mensagem:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendViaChannel(content: string, conversation: ConversationData, messageId: string) {
  const { channel, client, workspace } = conversation;
  const clientPhone = client.phone_number;

  try {
    if (channel === CHANNEL_TYPES.WHATSAPP_CLOUDAPI) {
      if (!workspace.whatsappAccessToken || !workspace.whatsappPhoneNumberId) {
        logger.warn(`[MsgProcessor Configuração WhatsApp ausente para canal ${channel}`);
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
        logger.warn(`[MsgProcessor Configuração Evolution API ausente para canal ${channel}`);
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

    logger.warn(`[MsgProcessor Canal ${channel} não suportado`);
    return { success: false, error: `Canal ${channel} não suportado` };

  } catch (error: any) {
    logger.error(`[MsgProcessor Erro no envio via canal:`, error.message);
    return { success: false, error: error.message };
  }
}

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

async function generateAIResponse(conversationId: string, workspace: WorkspaceConfig) {
  try {
    logger.info(`[MsgProcessor Gerando resposta da IA`);

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

    logger.debug(`[MsgProcessor Resposta bruta da IA:`, response);
    logger.info(`[MsgProcessor Resposta da IA gerada: ${response.substring(0, 100)}...`);
    return response.trim() || null;

  } catch (error: any) {
    logger.error(`[MsgProcessor Erro ao gerar resposta da IA:`, error.message);
    return null;
  }

}