"use server";

import { prisma } from '@/lib/db';
import pusher from '@/lib/pusher';

/**
 * Define o estado da IA para uma conversa específica e publica um evento no Redis.
 * @param conversationId - O ID da conversa.
 * @param newStatus - O novo estado desejado para is_ai_active (true ou false).
 * @param workspaceId - O ID do workspace associada à conversa.
 * @returns {Promise<boolean>} Retorna true em sucesso, false em falha antes da publicação. Lança erro em falha no DB.
 */
export async function setConversationAIStatus(conversationId: string, newStatus: boolean, workspaceId: string): Promise<boolean> {
  console.log(`[Action] Tentando definir status da IA para ${newStatus} na conversa: ${conversationId} do workspace: ${workspaceId}`);
  if (!conversationId || !workspaceId) {
    console.error('[Action|setConversationAIStatus] ID da conversa ou ID do workspace não fornecido.');
    return false; // Retorna false indicando falha antes de tentar DB/Redis
  }

  try {
    const updatedConversation = await prisma.conversation.update({
      where: {
        id: conversationId,
        workspace_id: workspaceId
      },
      data: { is_ai_active: newStatus },
      select: { id: true, is_ai_active: true, workspace_id: true }
    });

    if (updatedConversation && updatedConversation.is_ai_active === newStatus) {
      console.log(`[Action] Status da IA definido para ${newStatus} com sucesso no DB para a conversa: ${conversationId}`);

      // Publicar evento no Redis
      const eventPayload = {
          type: 'ai_status_updated',
          payload: {
              conversationId: conversationId,
              is_ai_active: newStatus,
          },
      };
      const chatChannel = `chat-updates:${conversationId}`;
      const workspaceChannel = `workspace-updates:${updatedConversation.workspace_id}`;

      try {
           await Promise.all([
             pusher.trigger(chatChannel, 'ai_status_updated', eventPayload),
             pusher.trigger(workspaceChannel, 'ai_status_updated', eventPayload),
           ]);
           console.log(`[Action] Evento 'ai_status_updated' (status: ${newStatus}) publicado nos canais ${chatChannel} e ${workspaceChannel}`);
           return true; // Sucesso na operação completa (DB + Redis)
      } catch (redisError) {
           console.error(`[Action|setConversationAIStatus] Falha ao publicar evento 'ai_status_updated' para Conv ${conversationId} (status: ${newStatus}):`, redisError);
           return true;
      }

    } else {
      console.warn(`[Action|setConversationAIStatus] Conversa ${conversationId} não encontrada ou status não foi atualizado para ${newStatus} (sem erro do Prisma).`);
      return false; // Falha em encontrar/atualizar ou estado não corresponde
    }
  } catch (error) {
    console.error(`[Action|setConversationAIStatus] Erro no Prisma ao definir status da IA (${newStatus}) para a conversa ${conversationId}:`, error);
    throw new Error(`Falha ao atualizar status da IA no banco de dados para a conversa ${conversationId}`);
  }
} 
