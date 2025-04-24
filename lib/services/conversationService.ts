import { prisma } from '@/lib/db';
import { FollowUpStatus, MessageSenderType, ConversationStatus } from '@prisma/client';

// Context shapes for services
import type { Conversation, Client, Workspace, AbandonedCartRule, FollowUp as FollowUpModel, WorkspaceAiFollowUpRule } from '@prisma/client';

/**
 * Contexto completo para processamento de carrinho abandonado.
 */
export interface AbandonedCartContext {
  conversation: Conversation;
  client: Client;
  workspace: Workspace & { abandonedCartRules: AbandonedCartRule[] };
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
 * Carrega dados necessários para processar carrinho abandonado.
 */
/**
 * Carrega dados de conversa, cliente e regras para fluxo de carrinho abandonado.
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
      }
    }
  });
  return { conversation, client: conversation.client, workspace: conversation.workspace };
}

/**
 * Carrega dados necessários para processar follow-up por inatividade.
 */
/**
 * Carrega dados de followUp, cliente e regras para fluxo de inatividade.
 */
export async function loadFollowUpContext(
  followUpId: string,
  workspaceId: string
): Promise<FollowUpContext> {
  const followUp = await prisma.followUp.findUniqueOrThrow({
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
  if (followUp.workspace_id !== workspaceId) {
    throw new Error(`FollowUp ${followUpId} não pertence ao workspace ${workspaceId}`);
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
}

/**
 * Obtém ou cria o cliente e conversa para um número no canal WhatsApp.
 * Retorna o cliente, a conversa e flag se foi criada agora.
 */
export async function getOrCreateConversation(
  workspaceId: string,
  phoneNumber: string,
  clientName?: string | null
): Promise<{ client: Client; conversation: Conversation; wasCreated: boolean }> {
  // 1) Cliente
  let client = await prisma.client.findFirst({
    where: { workspace_id: workspaceId, phone_number: phoneNumber }
  });
  let clientCreated = false;
  if (!client) {
    client = await prisma.client.create({
      data: { 
        workspace_id: workspaceId, 
        phone_number: phoneNumber, 
        name: clientName ?? null,
        metadata: {} 
      }
    });
    clientCreated = true;
  } else if (!client.name && clientName) {
    // Cliente existe, mas sem nome -> Atualiza com o nome recebido
    client = await prisma.client.update({
      where: { id: client.id },
      data: { name: clientName }
    });
  }

  // 2) Conversa
  let conversation: Conversation;
  let wasCreated = false;
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
    wasCreated = true;
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
  return { client, conversation, wasCreated };
}