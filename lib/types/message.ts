import { Prisma } from '@prisma/client';

// Tipo para os campos selecionados de uma mensagem ao buscar para atualização de status
export type SelectedMessageInfo = {
    id: string;
    conversation_id: string;
    status: string; // Idealmente, este seria o enum MessageStatus do Prisma
    sender_type: string; // Idealmente, este seria o enum MessageSenderType do Prisma
    providerMessageId: string | null;
    channel_message_id: string | null;
    metadata: Prisma.JsonValue;
}; 