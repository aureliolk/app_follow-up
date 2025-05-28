"use server";

import { prisma } from '@/lib/db';
import pusher from '@/lib/pusher';
import { triggerWorkspacePusherEvent } from '@/lib/pusherEvents';
import type { ClientConversation, Message } from '@/app/types'; // Assuming Conversation type exists here

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

/**
 * Fetches conversations for a given client ID.
 * @param clientId - The ID of the client.
 * @returns A list of conversations or an error.
 */
export async function getConversationsByClientId(clientId: string): Promise<{ success: true; data: ClientConversation[] } | { success: false; error: string }> {
  if (!clientId) {
    return { success: false, error: 'Client ID is required.' };
  }

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        client_id: clientId,
      },
      orderBy: {
        updated_at: 'desc', // Order by most recent activity
      },
      // Select necessary fields required by ClientConversation
      select: {
        id: true,
        client_id: true,
        workspace_id: true,
        channel: true,
        channel_conversation_id: true,
        status: true,
        is_ai_active: true,
        last_message_at: true,
        created_at: true,
        updated_at: true,
        metadata: true,
        // Include client details
        client: {
          select: {
            id: true,
            name: true,
            phone_number: true,
            metadata: true,
          }
        },
        // Include the last message
        messages: {
          take: 1,
          orderBy: { timestamp: 'desc' },
          select: { 
            id: true, // Select message ID
            content: true,
            sender_type: true,
            timestamp: true,
            conversation_id: true, // Include parent conversation ID
          },
        },
      },
    });

    // Map Prisma result to ClientConversation type
    const formattedConversations: ClientConversation[] = conversations.map(conv => ({
        id: conv.id,
        workspace_id: conv.workspace_id,
        client_id: conv.client_id,
        channel: conv.channel,
        channel_conversation_id: conv.channel_conversation_id,
        status: conv.status as ClientConversation['status'], // Cast if Prisma type is different
        is_ai_active: conv.is_ai_active,
        last_message_at: conv.last_message_at,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        metadata: conv.metadata,
        client: conv.client ? {
            id: conv.client.id,
            name: conv.client.name,
            phone_number: conv.client.phone_number,
            metadata: conv.client.metadata,
        } : null,
        last_message: conv.messages[0] ? {
            id: conv.messages[0].id, // Use the actual message ID
            content: conv.messages[0].content,
            timestamp: conv.messages[0].timestamp,
            sender_type: conv.messages[0].sender_type as Message['sender_type'], // Cast
            // Add other message fields if selected and needed by Message type
        } : null,
        // Include other ClientConversation fields if necessary
        unread_count: undefined, // Assuming unread_count is not fetched here
        last_message_timestamp: conv.last_message_at ? new Date(conv.last_message_at).toISOString() : null, // Format as string if needed
        activeFollowUp: undefined, // Assuming activeFollowUp is not fetched here
    }));

    return { success: true, data: formattedConversations };

  } catch (error: any) {
    console.error('[Server Action] Error fetching conversations by client ID:', error);
    return { success: false, error: error.message || 'Failed to fetch conversations.' };
  }
}
