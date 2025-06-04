import { prisma } from '@/lib/db';
import { sendWhatsappMediaMessage, SendResult } from '@/lib/channel/whatsappSender';
import { decrypt } from '@/lib/encryption';
import { CHANNEL_TYPES } from '@/lib/constants';
import { sendEvolutionMediaMessage } from './channelService';

interface SendMediaServiceParams {
  conversationId: string;
  mediaUrl: string;
  mimeType: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  filename?: string;
}

export async function sendMediaToConversation({
  conversationId,
  mediaUrl,
  mimeType,
  mediaType,
  caption,
  filename,
}: SendMediaServiceParams): Promise<SendResult> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        channel: true,
        client: {
          select: {
            phone_number: true,
          },
        },
        workspace: {
          select: {
            whatsappPhoneNumberId: true,
            whatsappAccessToken: true,
            evolution_api_token: true,
            evolution_api_instance_name: true
          },
        },
      },
    });

    if (!conversation) {
      console.error(`[MediaSenderService] Conversation with ID ${conversationId} not found.`);
      return { success: false, error: { message: 'Conversation not found.' } };
    }

    const toPhoneNumber = conversation.client?.phone_number;
    if (!toPhoneNumber) {
      console.error(`[MediaSenderService] Client phone number not found for conversation ${conversationId}.`);
      return { success: false, error: { message: 'Client phone number not found.' } };
    }

    switch (conversation.channel) {
      case CHANNEL_TYPES.WHATSAPP_EVOLUTION:
        
      const evolutionResult = await sendEvolutionMediaMessage({
          endpoint: process.env.apiUrlEvolution,
          apiKey: conversation.workspace.evolution_api_token,
          instanceName: conversation.workspace.evolution_api_instance_name,
          toPhoneNumber: toPhoneNumber,
          mediaUrl: mediaUrl,
          mimeType: mimeType,
          caption: caption,
          filename: filename, 
        });

      return {
        success: evolutionResult.success,
        error: evolutionResult.error ? { message: evolutionResult.error } : undefined,
      };

      case CHANNEL_TYPES.WHATSAPP_CLOUDAPI:
        const whatsappPhoneNumberId = conversation.workspace?.whatsappPhoneNumberId;
        const whatsappAccessToken = conversation.workspace?.whatsappAccessToken;

        if (!whatsappPhoneNumberId || !whatsappAccessToken) {
          console.error(`[MediaSenderService] WhatsApp integration details not found for workspace of conversation ${conversationId}.`);
          return { success: false, error: { message: 'WhatsApp integration not configured.' } };
        }

        const decryptedAccessToken = decrypt(whatsappAccessToken);

        return await sendWhatsappMediaMessage({
          phoneNumberId: whatsappPhoneNumberId,
          toPhoneNumber: toPhoneNumber,
          accessToken: decryptedAccessToken,
          mediaUrl: mediaUrl,
          mimeType: mimeType,
          caption: caption,
          filename: filename,
        });

      // Add other channels here in the future
      default:
        console.warn(`[MediaSenderService] Unsupported channel type: ${conversation.channel}`);
        return { success: false, error: { message: `Unsupported channel type: ${conversation.channel}` } };
    }
  } catch (error: any) {
    console.error('[MediaSenderService] Error sending media:', error);
    return { success: false, error: { message: error.message || 'Unknown error in media sending service.' } };
  }
}