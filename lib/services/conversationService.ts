import { prisma } from '@/lib/db';
import { FollowUpStatus, MessageSenderType, ConversationStatus } from '@prisma/client';
import { decrypt } from '@/lib/encryption';
import { sendWhatsAppMessage } from "@/lib/services/channelService";
import { Prisma } from '@prisma/client';

// Context shapes for services
import type { Conversation, Client, Workspace, AbandonedCartRule, FollowUp as FollowUpModel, WorkspaceAiFollowUpRule, FollowUp } from '@prisma/client';
import { createDeal, getPipelineStages } from '../actions/pipelineActions';

/**
 * Contexto completo para processamento de carrinho abandonado.
 */
export interface AbandonedCartContext {
  conversation: Conversation;
  client: Client;
  workspace: Workspace & { abandonedCartRules: AbandonedCartRule[] };
  followUp: FollowUp | null;
}

/**
 * Contexto completo para processamento de follow-up por inatividade.
 */
export interface FollowUpContext {
  followUp: FollowUpModel;
  client: Client;
  workspace: Workspace & { ai_follow_up_rules: WorkspaceAiFollowUpRule[] };
  conversation: Conversation;
}

/**
 * Carrega dados de conversa, cliente, workspace (com regras de carrinho)
 * e o FollowUp associado (se existir).
 */
export async function loadAbandonedCartContext(
  conversationId: string,
  workspaceId: string
): Promise<AbandonedCartContext> {
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, workspace_id: workspaceId },
    include: {
      client: true,
      workspace: {
        include: {
          abandonedCartRules: {
            orderBy: { sequenceOrder: 'asc' },
          }
        }
      },
      followUp: true
    }
  });
  return { conversation, client: conversation.client, workspace: conversation.workspace, followUp: conversation.followUp };
}

/**
 * Carrega dados de followUp, cliente e regras para fluxo de inatividade.
 */
export async function loadFollowUpContext(
  followUpId: string,
  workspaceId: string
): Promise<FollowUpContext> {
  try {
    // Usar findUnique em vez de findUniqueOrThrow para evitar exceção
    const followUp = await prisma.followUp.findUnique({
    where: { id: followUpId },
    include: {
      client: true,
      workspace: {
        include: {
          ai_follow_up_rules: {
            orderBy: { delay_milliseconds: 'asc' },
          }
        }
      }
    }
  });

    // Se não encontrou o followUp, throw com mensagem clara
    if (!followUp) {
      throw new Error(`FollowUp ${followUpId} não encontrado. Provavelmente já foi convertido ou cancelado.`);
    }

  if (followUp.workspace_id !== workspaceId) {
    throw new Error(`FollowUp ${followUpId} não pertence ao workspace ${workspaceId}`);
  }

    // Verificar se o followUp está em um estado terminal
    if (followUp.status === FollowUpStatus.CONVERTED || 
        followUp.status === FollowUpStatus.CANCELLED || 
        followUp.status === FollowUpStatus.COMPLETED) {
      throw new Error(`FollowUp ${followUpId} está com status ${followUp.status}. Não deve ser processado.`);
    }

  // Buscar conversa ativa para este cliente no workspace
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: {
      workspace_id: workspaceId,
      client_id: followUp.client_id,
      status: ConversationStatus.ACTIVE
    },
    orderBy: { last_message_at: 'desc' }
  });
  return { followUp, client: followUp.client, workspace: followUp.workspace, conversation };
  } catch (error) {
    // Repassar o erro com contexto detalhado para que o worker possa tratá-lo corretamente
    throw error;
  }
}

/**
 * Obtém ou cria o cliente e conversa para um número no canal WhatsApp.
 * Retorna o cliente, a conversa e flag se foi criada agora.
 */
export async function getOrCreateConversation(
  workspaceId: string,
  phoneNumber: string,
  clientName?: string | null
): Promise<{ client: Client; conversation: Conversation; conversationWasCreated: boolean; clientWasCreated: boolean }> {
  // 1) Cliente
  let client = await prisma.client.findFirst({
    where: { workspace_id: workspaceId, phone_number: phoneNumber }
  });
  let clientWasCreated = false;
  if (!client) {
    client = await prisma.client.create({
      data: {
        workspace_id: workspaceId,
        phone_number: phoneNumber,
        name: clientName ?? null,
        metadata: {}
      }
    });
    clientWasCreated = true;
  } else if (!client.name && clientName) {
    // Cliente existe, mas sem nome -> Atualiza com o nome recebido
    client = await prisma.client.update({
      where: { id: client.id },
      data: { name: clientName }
    });
  }

  // 2) Conversa
  let conversation: Conversation;
  let conversationWasCreated = false;
  try {
    conversation = await prisma.conversation.create({
      data: {
        workspace_id: workspaceId,
        client_id: client.id,
        channel: 'WHATSAPP',
        status: ConversationStatus.ACTIVE,
        is_ai_active: true,
        last_message_at: new Date()
      }
    });
    conversationWasCreated = true;
  } catch (e: any) {
    // Se já existir pela chave única workspace_id+client_id+channel, atualiza
    if (e.code === 'P2002') {
      conversation = await prisma.conversation.update({
        where: {
          workspace_id_client_id_channel: {
            workspace_id: workspaceId,
            client_id: client.id,
            channel: 'WHATSAPP'
          }
        },
        data: {
          last_message_at: new Date(),
          status: ConversationStatus.ACTIVE
        }
      });
    } else {
      throw e;
    }
  }


  return { client, conversation, conversationWasCreated, clientWasCreated };
}

// Tipo para a mensagem pendente retornada
const pendingMessageSelect = {
  id: true,
  conversation_id: true,
  sender_type: true,
  content: true,
  timestamp: true,
  status: true,
  metadata: true,
  providerMessageId: true,
  conversation: {
    select: { workspace_id: true }
  }
};
type PendingMessageType = Prisma.MessageGetPayload<{ select: typeof pendingMessageSelect }>;

interface SendOperatorMessageResult {
  success: boolean;
  message?: PendingMessageType; // Retorna a mensagem criada (agora com workspace_id)
  error?: string;
  statusCode?: number;
}

/**
 * Envia uma mensagem manual de um operador para uma conversa.
 * Cria a mensagem no banco como PENDING e depois tenta enviar pelo canal apropriado.
 * Atualiza para FAILED se o envio falhar.
 */
export async function sendOperatorMessage(
  conversationId: string,
  operatorId: string,
  operatorName: string | null | undefined,
  content: string
): Promise<SendOperatorMessageResult> {
  const senderDisplayName = operatorName || 'Operador';
  const prefixedContent = `*${senderDisplayName}*\n ${content}`; // Prefixo aqui no serviço
  let pendingMessage: PendingMessageType | null = null;

  try {
    // 1. Buscar Conversa + Client + Workspace (com credenciais)
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true, channel: true, client_id: true, workspace_id: true,
        client: { select: { phone_number: true } },
        workspace: { select: { id: true, whatsappPhoneNumberId: true, whatsappAccessToken: true } }
      }
    });

    if (!conversation || !conversation.client || !conversation.workspace) {
      console.error(`[Svc SendOperatorMsg] Conversation, client, or workspace not found for conv ${conversationId}`);
      return { success: false, error: 'Dados da conversa, cliente ou workspace não encontrados.', statusCode: 404 };
    }

    const { channel, client, workspace } = conversation;

    // 2. Criar Mensagem PENDING
    pendingMessage = await prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_type: MessageSenderType.AGENT, // Usar AGENT
        content: prefixedContent,
        timestamp: new Date(),
        status: 'PENDING',
        metadata: { manual_sender_id: operatorId },
      },
      select: pendingMessageSelect
    });
    console.log(`[Svc SendOperatorMsg] Saved PENDING message ${pendingMessage.id} for conv ${conversationId}`);


    const { whatsappPhoneNumberId, whatsappAccessToken } = workspace;
    const clientPhoneNumber = client.phone_number;

    if (!whatsappPhoneNumberId || !whatsappAccessToken || !clientPhoneNumber) {
      console.error(`[Svc SendOperatorMsg] WhatsApp config incomplete for workspace ${workspace.id}`);
      throw new Error('Configuração do WhatsApp incompleta.'); // Erro será pego abaixo
    }

    const sendResult = await sendWhatsAppMessage(
      whatsappPhoneNumberId,
      clientPhoneNumber,
      whatsappAccessToken,
      content,
      senderDisplayName
    );

    if (sendResult.success && sendResult.wamid) {
      console.log(`[Svc SendOperatorMsg] WhatsApp send initiated successfully (Wamid: ${sendResult.wamid}) for msg ${pendingMessage.id}`);
      // Atualizar status para SENT e guardar o WAMID no channel_message_id E providerMessageId
      pendingMessage = await prisma.message.update({
        where: { id: pendingMessage.id },
        data: {
          status: 'SENT',
          channel_message_id: sendResult.wamid, // WAMID aqui
          providerMessageId: sendResult.wamid   // <<< ADICIONAR WAMID AQUI TAMBÉM >>>
        },
        select: pendingMessageSelect
      });
      console.log(`[Svc SendOperatorMsg] Updated message ${pendingMessage.id} to SENT with channel_message_id and providerMessageId: ${sendResult.wamid}`);

      // Atualizar last_message_at da Conversa
      try {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { last_message_at: pendingMessage.timestamp } // Usar o timestamp da mensagem PENDING
        });
        console.log(`[Svc SendOperatorMsg] Updated conversation ${conversationId} last_message_at after successful send.`);
      } catch (convUpdateError) {
        console.error(`[Svc SendOperatorMsg] Error updating conversation ${conversationId} last_message_at:`, convUpdateError);
        // Não falhar a operação principal por isso
      }

      return { success: true, message: pendingMessage };

    } else if (sendResult.success && !sendResult.wamid) {
      // Sucesso no envio, mas sem WAMID retornado (raro, mas tratar)
      console.warn(`[Svc SendOperatorMsg] WhatsApp send reported success but NO WAMID returned for msg ${pendingMessage.id}. Setting to SENT, but providerMessageId will be null.`);
      pendingMessage = await prisma.message.update({
        where: { id: pendingMessage.id },
        data: {
          status: 'SENT',
          // providerMessageId permanece null ou o que já estava
        },
        select: pendingMessageSelect
      });
      // Atualizar last_message_at da Conversa
      // ... (mesma lógica de atualização do last_message_at acima)
      try {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { last_message_at: pendingMessage.timestamp }
        });
        console.log(`[Svc SendOperatorMsg] Updated conversation ${conversationId} last_message_at (no WAMID).`);
      } catch (convUpdateError) {
        console.error(`[Svc SendOperatorMsg] Error updating conversation ${conversationId} last_message_at (no WAMID):`, convUpdateError);
      }
      return { success: true, message: pendingMessage };

    } else {
      // Envio falhou conforme reportado por sendWhatsAppMessage
      let errorMessage = 'Falha no envio pelo WhatsApp (reportado pelo sender)';
      if (sendResult.error) {
        if (typeof sendResult.error === 'string') {
          errorMessage = sendResult.error;
        } else if (typeof sendResult.error === 'object' && sendResult.error !== null && 'message' in sendResult.error && typeof (sendResult.error as any).message === 'string') {
          errorMessage = (sendResult.error as any).message;
        } else {
          try {
            errorMessage = JSON.stringify(sendResult.error);
          } catch (e) {
            // Se JSON.stringify falhar, mantenha a mensagem padrão
          }
        }
      }
      console.error(`[Svc SendOperatorMsg] WhatsApp send FAILED for msg ${pendingMessage.id}. Error: ${errorMessage}`);
      // O bloco catch abaixo vai cuidar de setar para FAILED e retornar o erro.
      throw new Error(errorMessage);
    }

  } catch (error: any) {
    console.error(`[Svc SendOperatorMsg] Error sending message for conv ${conversationId}:`, error);
    // 5. Atualizar para FAILED em caso de erro
    if (pendingMessage) {
      try {
        const existingMetadata = (typeof pendingMessage.metadata === 'object' && pendingMessage.metadata !== null) ? pendingMessage.metadata : {};
        await prisma.message.update({
          where: { id: pendingMessage.id },
          data: { status: 'FAILED', errorMessage: error.message, metadata: { ...existingMetadata, error: error.message } }
        });
        console.log(`[Svc SendOperatorMsg] Updated message ${pendingMessage.id} to FAILED.`);

        // <<< Mesmo em caso de falha, atualizar last_message_at para manter a conversa no topo >>>
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { last_message_at: pendingMessage.timestamp } // Usa o timestamp da mensagem que falhou
        });
        console.log(`[Svc SendOperatorMsg] Updated conversation ${conversationId} last_message_at after FAILED message.`);

      } catch (updateError) {
        console.error(`[Svc SendOperatorMsg] CRITICAL: Failed to update message ${pendingMessage.id} to FAILED or conversation timestamp after send error:`, updateError);
      }
    }
    return { success: false, error: error.message || 'Erro interno ao enviar mensagem.', statusCode: 500 };
  }
}