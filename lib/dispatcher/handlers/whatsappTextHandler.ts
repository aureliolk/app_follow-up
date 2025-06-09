import type { IncomingMessage, MessageHandler } from '../types';
import { processClientAndConversation } from '../../services/clientConversationService';
import { saveMessageRecord } from '../../services/persistenceService';

export class WhatsAppTextHandler implements MessageHandler {
  canHandle(message: IncomingMessage): boolean {
    return message.channel === 'WHATSAPP' && message.type === 'text';
  }

  async process(message: IncomingMessage): Promise<void> {
    const { content, metadata } = message;
    
    // Extrai dados da mensagem
    const { phoneNumber, workspaceId } = metadata;
    
    // Processa cliente e conversa
    const { client, conversation } = await processClientAndConversation(
      workspaceId,
      phoneNumber,
      metadata.senderName || '',
      'WHATSAPP'
    );

    // Salva mensagem
    await saveMessageRecord({
      conversation_id: conversation.id,
      sender_type: 'CLIENT',
      content,
      timestamp: new Date(),
      metadata
    });
  }
}