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