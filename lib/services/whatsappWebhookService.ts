import { prisma } from '@/lib/db';
import { MessageSenderType } from "@prisma/client";

import { NextResponse } from 'next/server';
import { standardizeBrazilianPhoneNumber } from '../phoneUtils';
import { processClientAndConversation } from './clientConversationService';
import { saveMessageRecord } from './persistenceService';
import { triggerNewMessageNotification } from '../pusherEvents';
import { CoreMessage } from 'ai';
import { processAIChat } from '../ai/chatService';
import { sendMsgForIa } from '@/trigger/aiGenerate';
import { WhatsAppWebhookService } from '@/lib/services/appWebhookService';

export const AI_MESSAGE_ROLES = {
    USER: 'user',
    ASSISTANT: 'assistant',
};


export interface ApiWabType {
  object: string
  entry: Entry[]
}

export interface Entry {
  id: string
  changes: Change[]
}

export interface Change {
  value: Value
  field: string
}

export interface Value {
  messaging_product: string
  metadata: Metadata
  contacts: Contact[]
  messages: Message[]
}

export interface Metadata {
  display_phone_number: string
  phone_number_id: string
}

export interface Contact {
  profile: Profile
  wa_id: string
}

export interface Profile {
  name: string
}

export interface Message {
  from: string
  id: string
  timestamp: string
  text: Text
  type: string
}

export interface Text {
  body: string
}


async function checkIfLatestMessage(conversationId: string, messageId: string): Promise<boolean> {
    const lastAiMessage = await prisma.message.findFirst({
        where: {
            conversation_id: conversationId,
            sender_type: MessageSenderType.AI
        },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true }
    });

    const newClientMessages = await prisma.message.findMany({
        where: {
            conversation_id: conversationId,
            sender_type: MessageSenderType.CLIENT,
            timestamp: { gt: lastAiMessage?.timestamp || new Date(0) }
        },
        orderBy: { timestamp: 'asc' },
        select: { id: true }
    });

    return newClientMessages.length > 0 &&
        messageId === newClientMessages[newClientMessages.length - 1].id;
}

export type WorkspaceType = {
    id: string
    evolution_webhook_route_token: string
    ai_delay_between_messages?: number
    ai_model_preference?: string
    ai_default_system_prompt?: string
}

export async function processWhatsAppPayload(payload: ApiWabType, routeToken: string) {
    // Validar workspace pelo token
    const workspace = await prisma.workspace.findUnique({
        where: { whatsappWebhookRouteToken: routeToken }
    });

    if (!workspace) {
        return NextResponse.json(
            { error: 'Workspace não encontrado' },
            { status: 404 }
        );
    }

    // Processar diferentes tipos de mensagens
    for (const entry of payload.entry) {
        for (const change of entry.changes) {
            if (change.field === 'messages') {
                return processWhatsAppMessage(change.value, workspace.id);
            }
        }
    }

    return NextResponse.json(
        { status: 'EVENT_RECEIVED' },
        { status: 200 }
    );
}

