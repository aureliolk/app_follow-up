import pusher from './pusher';
import { Prisma } from '@prisma/client';

/**
 * Triggers a Pusher event on a private workspace channel.
 * Ensures consistent channel naming and payload structure.
 *
 * @param workspaceId The ID of the workspace.
 * @param eventName The name of the event (e.g., 'new_message', 'message_status_update', 'ai_status_updated').
 * @param payload The actual data payload to send.
 */
export async function triggerWorkspacePusherEvent(
  workspaceId: string,
  eventName: string,
  payload: any
) {
  const channelName = `private-workspace-${workspaceId}`;
  const eventData = { type: eventName, payload: payload }; // Consistent structure for frontend

  try {
    await pusher.trigger(channelName, eventName, eventData);
    console.log(`[PusherEventHelper] Event '${eventName}' triggered on channel '${channelName}' with payload:`, payload);
  } catch (error) {
    console.error(`[PusherEventHelper] Failed to trigger event '${eventName}' on channel '${channelName}':`, error);
  }
}

// Tipo para mensagem salva (baseado no retorno do saveMessageRecord)
interface SavedMessage {
  id: string;
  conversation_id: string;
  sender_type: string;
  content: string | null; // Allow null for media messages
  timestamp: Date;
  status: string;
  channel_message_id: string | null;
  providerMessageId: string | null;
  metadata: Prisma.JsonValue;
  media_url?: string | null; // Add media_url
  media_mime_type?: string | null; // Add media_mime_type
  media_filename?: string | null; // Add media_filename
}

/**
 * Função padronizada para disparar notificação de nova mensagem via Pusher.
 * Remove campos sensíveis como mediaData_base64 do metadata antes de enviar.
 * Usa a estrutura centralizada triggerWorkspacePusherEvent.
 *
 * @param workspaceId ID do workspace
 * @param savedMessage Mensagem salva retornada pelo saveMessageRecord
 * @param source Fonte da mensagem ('evolution' ou 'whatsapp') para logs
 */
export async function triggerNewMessageNotification(
  workspaceId: string,
  savedMessage: SavedMessage,
  source: 'evolution' | 'whatsapp' = 'whatsapp'
): Promise<void> {
  try {
    // Processar metadata removendo campos sensíveis
    let cleanMetadata: Record<string, any> = {};
    
    if (typeof savedMessage.metadata === 'object' && savedMessage.metadata !== null) {
      cleanMetadata = { ...savedMessage.metadata as Record<string, any> };
      
      // Remover campos sensíveis que não devem ir para o frontend
      if (cleanMetadata.mediaData_base64) {
        delete cleanMetadata.mediaData_base64;
      }
    }

    // Construir payload padronizado
    const messagePayload = {
      id: savedMessage.id,
      conversation_id: savedMessage.conversation_id,
      sender_type: savedMessage.sender_type,
      content: savedMessage.content,
      timestamp: savedMessage.timestamp,
      status: savedMessage.status,
      channel_message_id: savedMessage.channel_message_id,
      providerMessageId: savedMessage.providerMessageId,
      media_url: savedMessage.media_url, // Include media_url
      media_mime_type: savedMessage.media_mime_type, // Include media_mime_type
      media_filename: savedMessage.media_filename, // Include media_filename
      metadata: cleanMetadata
    };

    await triggerWorkspacePusherEvent(workspaceId, 'new_message', messagePayload);
    
    console.log(`[PusherEventHelper] New message notification sent successfully. Source: ${source}, Message ID: ${savedMessage.id}`);
    
  } catch (error) {
    console.error(`[PusherEventHelper] Failed to send new message notification. Source: ${source}, Message ID: ${savedMessage.id}:`, error);
    throw error; // Re-throw para que o caller possa decidir como tratar
  }
}

/**
 * Função padronizada para disparar notificação de atualização de status via Pusher.
 * Usa a estrutura centralizada triggerWorkspacePusherEvent.
 *
 * @param workspaceId ID do workspace
 * @param messageId ID da mensagem
 * @param conversationId ID da conversa
 * @param newStatus Novo status da mensagem
 * @param channelMessageId ID da mensagem no canal (WAMID/keyId)
 * @param errorMessage Mensagem de erro (opcional, para status FAILED)
 * @param source Fonte da atualização ('evolution' ou 'whatsapp') para logs
 */
export async function triggerStatusUpdateNotification(
  workspaceId: string,
  messageId: string,
  conversationId: string,
  newStatus: string,
  channelMessageId: string | null,
  errorMessage?: string,
  source: 'evolution' | 'whatsapp' = 'whatsapp'
): Promise<void> {
  try {
    const statusPayload = {
      id: messageId,
      conversation_id: conversationId,
      status: newStatus,
      channel_message_id: channelMessageId,
      ...(errorMessage && { errorMessage })
    };

    await triggerWorkspacePusherEvent(workspaceId, 'message_status_update', statusPayload);
    
    console.log(`[PusherEventHelper] Status update notification sent successfully. Source: ${source}, Message ID: ${messageId}, Status: ${newStatus}`);
    
  } catch (error) {
    console.error(`[PusherEventHelper] Failed to send status update notification. Source: ${source}, Message ID: ${messageId}:`, error);
    throw error; // Re-throw para que o caller possa decidir como tratar
  }
}
