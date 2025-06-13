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

export const AI_MESSAGE_ROLES = {
    USER: 'user',
    ASSISTANT: 'assistant',
};

export type ApiEvolutionType = {
    event: string
    instance: string
    data: {
        key: {
            remoteJid: string
            fromMe: boolean
            id: string
            participant?: string
        }
        pushName: string
        status: string
        message: {
            conversation: string
            messageContextInfo: {
                deviceListMetadata: {
                    senderTimestamp: string
                    recipientKeyHash: string
                    recipientTimestamp: string
                }
                deviceListMetadataVersion: number
                messageSecret: string
            }
        }
        messageType: string
        messageTimestamp: number
        instanceId: string
        source: string
    }
    destination: string
    date_time: string
    sender: string
    server_url: string
    apikey: string
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

export async function processEvolutionPayload(payload: ApiEvolutionType, routeToken: string) {
    // Validar workspace pelo token
    const workspace = await prisma.workspace.findUnique({
        where: { evolution_webhook_route_token: routeToken },
        select: {
            id: true,
            evolution_webhook_route_token: true,
            ai_delay_between_messages: true,
            ai_model_preference: true,
            ai_default_system_prompt: true
        }
    });

    if (!workspace) {
        return NextResponse.json(
            { error: 'Workspace não encontrado' },
            { status: 404 }
        );
    }

    // Processar diferentes tipos de eventos
    switch (payload.event) {
        case 'messages.upsert':
            return processEvolutionMessage(payload, { id: workspace.id, evolution_webhook_route_token: workspace.evolution_webhook_route_token, ai_delay_between_messages: workspace.ai_delay_between_messages, ai_model_preference: workspace.ai_model_preference, ai_default_system_prompt: workspace.ai_default_system_prompt } as WorkspaceType);
        case 'messages.update':
            return processEvolutionStatusUpdate(payload, workspace.id);
        default:
            return NextResponse.json(
                { status: 'EVENT_RECEIVED_UNSUPPORTED' },
                { status: 200 }
            );
    }
}

async function processEvolutionMessage(payload: ApiEvolutionType, workspace: WorkspaceType) {
    const messageData = payload.data;
    const senderPhoneNumber = standardizeBrazilianPhoneNumber(messageData.key.remoteJid.split('@')[0]);
    const senderName = messageData.pushName || senderPhoneNumber;

    const { conversation } = await processClientAndConversation(
        workspace.id,
        senderPhoneNumber,
        senderName,
        'WHATSAPP_EVOLUTION'
    );

    let messageContentOutput: string | null = null;
    let messageTypeOutput: string = 'unknown';
    let requiresProcessing = false;

    if (messageData.messageType === 'conversation' || messageData.messageType === 'extendedTextMessage') {
        messageContentOutput = messageData.message?.conversation || (messageData.message as any)?.extendedTextMessage?.text || "";
        messageTypeOutput = 'text';
        requiresProcessing = true;
    }


    if (messageData.key.fromMe === true) {
        const savedMessage = await saveMessageRecord({
            conversation_id: conversation.id,
            sender_type: 'AGENT',
            content: messageContentOutput!,
            timestamp: new Date(messageData.messageTimestamp * 1000),
            channel_message_id: "EVO",
        });

        try {
            await triggerNewMessageNotification(workspace.id, savedMessage, 'evolution');
        } catch (pusherError) {
            console.error(`[EVOLUTION WEBHOOK - POST Failed to trigger Pusher event for msg ${savedMessage.id}:`, pusherError);
        }

        return NextResponse.json(
            {status: 'MESSAGE_NUMBER_CONECTED'},
            { status: 200 }
        )
    }

    const savedMessage = await saveMessageRecord({
        conversation_id: conversation.id,
        sender_type: 'CLIENT',
        content: messageContentOutput!,
        timestamp: new Date(messageData.messageTimestamp * 1000),
        channel_message_id: "EVO",
    });

    try {
        await triggerNewMessageNotification(workspace.id, savedMessage, 'evolution');
    } catch (pusherError) {
        console.error(`[EVOLUTION WEBHOOK - POST Failed to trigger Pusher event for msg ${savedMessage.id}:`, pusherError);
    }


    // 3. Aplicar DEBOUNCE usando ai_delay_between_messages
    const debounceMs = Number(workspace.ai_delay_between_messages) || 3000;
    await new Promise(resolve => setTimeout(resolve, debounceMs));

    // 4. Verificar se é a última mensagem do cliente
    const isLatestMessage = await checkIfLatestMessage(conversation.id, savedMessage.id);
    if (!isLatestMessage) {
        console.log(`Mensagem ${savedMessage.id} não é a mais recente do cliente, ignorando processamento.`);
        return NextResponse.json(
            { status: 'MESSAGE_IGNORED', reason: 'Not latest message' },
            { status: 200 }
        );
    }


    const responseIa = await sendMsgForIa.trigger({
        messageContentOutput,
        workspaceId: workspace.id,
        newMessageId: savedMessage.id,
        aiModel: workspace.ai_model_preference
    })

    console.log(`IA response for message ${savedMessage.id}:`, responseIa);

    // console.log({
    //     status: 'MESSAGE_PROCESSED',
    //     message: {
    //         id: messageData.key.id,
    //         senderJid: senderPhoneNumber,
    //         pushName: messageData.pushName,
    //         status: messageData.status,
    //         conversation: messageData.message.conversation,
    //         messageType: messageData.messageType,
    //         timestamp: messageData.messageTimestamp,

    //     }
    // },
    //     { status: 200 })


    return NextResponse.json(
        {
            status: 'MESSAGE_PROCESSED',
            message: {
                id: messageData.key.id,
                senderJid: senderPhoneNumber,
                pushName: messageData.pushName,
                status: messageData.status,
                conversation: messageData.message.conversation,
                messageType: messageData.messageType,
                timestamp: messageData.messageTimestamp,

            }
        },
        { status: 200 }
    );
}

async function processEvolutionStatusUpdate(payload: any, workspaceId: string) {
    // Implementar lógica específica para atualizações de status
    // ...
    return NextResponse.json(
        { status: 'STATUS_UPDATED' },
        { status: 200 }
    );
}
