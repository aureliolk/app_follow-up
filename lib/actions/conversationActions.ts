"use server";

import { prisma } from '@/lib/db';
import pusher from '@/lib/pusher';

/**
 * Define o estado da IA para uma conversa específica e envia um evento via Pusher.
 * @param conversationId - O ID da conversa.
 * @param newStatus - O novo estado desejado para is_ai_active (true ou false).
 * @param workspaceId - O ID do workspace associada à conversa.
 * @returns {Promise<boolean>} Retorna true em sucesso, false em falha antes da publicação. Lança erro em falha no DB.
 */
export async function setConversationAIStatus(conversationId: string, newStatus: boolean, workspaceId: string): Promise<boolean> {
  console.log(`[Action] Tentando definir status da IA para ${newStatus} na conversa: ${conversationId} do workspace: ${workspaceId}`);
  if (!conversationId || !workspaceId) {
    console.error('[Action|setConversationAIStatus] ID da conversa ou ID do workspace não fornecido.');
    return false; // Retorna false indicando falha antes de tentar DB/Pusher
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

      // Enviar evento via Pusher
      const eventPayload = {
          type: 'ai_status_updated',
          payload: {
              conversationId: conversationId,
              is_ai_active: newStatus,
          },
      };
      const pusherChannel = `private-workspace-${updatedConversation.workspace_id}`;

      try {
        await pusher.trigger(pusherChannel, 'ai_status_updated', eventPayload);
        console.log(`[Action] Evento 'ai_status_updated' (status: ${newStatus}) enviado via Pusher para ${pusherChannel}`);
        return true;
      } catch (pusherError) {
        console.error(`[Action|setConversationAIStatus] Falha ao enviar evento 'ai_status_updated' via Pusher para Conv ${conversationId} (status: ${newStatus}):`, pusherError);
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