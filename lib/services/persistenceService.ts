import { Message, MessageSenderType } from '@prisma/client';

/**
 * Dados necessários para salvar um registro de mensagem.
 */
export interface SaveMessageData {
  conversation_id: string;
  sender_type: MessageSenderType;
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  channel_message_id?: string;
}

/**
 * Persiste uma mensagem no banco.
 */
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

/**
 * Persiste uma mensagem no banco, assumindo status SENT.
 */
export async function saveMessageRecord(
  data: SaveMessageData
): Promise<Message> {
  const {
    conversation_id,
    sender_type,
    content,
    timestamp,
    metadata,
    channel_message_id
  } = data;
  const message = await prisma.message.create({
    data: {
      conversation: { connect: { id: conversation_id } },
      sender_type,
      content,
      timestamp,
      status: 'SENT',
      channel_message_id,
      providerMessageId: channel_message_id,
      metadata: metadata as Prisma.JsonObject
    }
  });
  return message;
}