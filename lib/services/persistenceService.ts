import { Message, MessageSenderType } from '@prisma/client';

/**
 * Dados necessários para salvar um registro de mensagem.
 */
export interface SaveMessageData {
  conversation_id: string;
  sender_type: MessageSenderType;
  content: string | null; // Allow null for media messages
  timestamp: Date;
  metadata?: Record<string, any>;
  channel_message_id?: string;
  providerMessageId?: string;
  media_url?: string | null; // Add media_url
  media_mime_type?: string | null; // Add media_mime_type
  media_filename?: string | null; // Add media_filename
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
    channel_message_id,
    media_url, // Destructure new fields
    media_mime_type,
    media_filename
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
      media_url, // Pass new fields to Prisma
      media_mime_type,
      media_filename,
      metadata: metadata as Prisma.JsonObject
    }
  });
  return message;
}