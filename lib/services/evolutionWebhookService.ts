import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils';
import { saveMessageRecord } from '@/lib/services/persistenceService';
import { processClientAndConversation } from '@/lib/services/clientConversationService';
import { triggerNewMessageNotification, triggerStatusUpdateNotification } from '@/lib/pusherEvents';
import { addMessageProcessingJob } from '@/lib/queues/queueService';
import { Prisma } from '@prisma/client';

export class EvolutionWebhookService {
    private evolutionStatusToDbStatus(evolutionStatus: string): string {
        const lowerStatus = evolutionStatus.toLowerCase();
        switch (lowerStatus) {
            case 'sent': return 'SENT';
            case 'delivery_ack': return 'DELIVERED';
            case 'read': return 'READ';
            case 'played': return 'READ';
            case 'error': return 'FAILED';
            default:
                console.warn(`Unknown Evolution status: ${evolutionStatus}`);
                return evolutionStatus.toUpperCase();
        }
    }

    private async getWorkspaceByToken(evolutionWebhookToken: string) {
        return prisma.workspace.findUnique({
            where: { evolution_webhook_route_token: evolutionWebhookToken },
            select: {
                id: true,
                evolution_api_token: true,
                ai_delay_between_messages: true
            }
        });
    }

    public async handleIncomingMessage(request: NextRequest, evolutionWebhookToken: string) {
        const workspace = await this.getWorkspaceByToken(evolutionWebhookToken);
        if (!workspace) {
            return new NextResponse('Workspace not found', { status: 404 });
        }

        try {
            const payload = await request.json();
            
            if (payload.event === 'messages.upsert' && payload.data?.key && !payload.data.key.fromMe) {
                await this.processNewMessage(payload.data, workspace);
            } else if (payload.event === 'messages.update' && payload.data?.status) {
                await this.processStatusUpdate(payload.data, workspace);
            }

            return new NextResponse('EVENT_RECEIVED', { status: 200 });
        } catch (error) {
            console.error('Error processing webhook:', error);
            return new NextResponse('Error processing webhook', { status: 500 });
        }
    }

    private async processNewMessage(messageData: any, workspace: any) {
        console.log('[EvolutionWebhook] Processando nova mensagem:', messageData);

        // Extrair dados básicos da mensagem
        const senderJid = messageData.key.remoteJid;
        const isGroup = senderJid?.endsWith('@g.us');
        const senderPhone = isGroup ? messageData.key.participant : senderJid;
        const phoneNumber = senderPhone?.split('@')[0];
        const standardizedPhone = standardizeBrazilianPhoneNumber(phoneNumber);
        const senderName = messageData.pushName || '';
        const messageId = messageData.key.id;
        const timestamp = messageData.messageTimestamp * 1000;

        if (!standardizedPhone) {
            console.warn('[EvolutionWebhook] Número de telefone inválido:', phoneNumber);
            return;
        }

        // Processar conteúdo da mensagem
        let content = '';
        let mediaUrl = null;
        let mediaType = null;
        
        const messageType = messageData.messageType;
        if (messageType === 'conversation') {
            content = messageData.message?.conversation || '';
        } else if (messageType === 'imageMessage') {
            content = messageData.message?.imageMessage?.caption || '[Imagem]';
            mediaUrl = messageData.message?.imageMessage?.url;
            mediaType = 'image';
        } // Adicionar outros tipos de mídia conforme necessário

        // Criar/atualizar cliente e conversa
        const { client, conversation } = await processClientAndConversation(
            workspace.id,
            standardizedPhone,
            senderName,
            'WHATSAPP_EVOLUTION'
        );

        // Salvar mensagem
        const savedMessage = await saveMessageRecord({
            conversation_id: conversation.id,
            sender_type: 'CLIENT',
            content,
            timestamp: new Date(timestamp),
            metadata: {
                provider: 'evolution',
                clientId: client.id,
                clientName: senderName,
                clientPhone: standardizedPhone,
                messageIdFromProvider: messageId,
                ...(mediaUrl && { mediaUrl, mediaType })
            },
            channel_message_id: messageId,
            providerMessageId: messageId
        });

        // Notificar e processar
        await triggerNewMessageNotification(workspace.id, savedMessage, 'evolution');
        
        if (content || mediaUrl) {
            const jobData = {
                conversationId: conversation.id,
                clientId: client.id,
                newMessageId: savedMessage.id,
                workspaceId: workspace.id,
                receivedTimestamp: timestamp
            };
            
            if (workspace.ai_delay_between_messages !== undefined) {
                (jobData as any).delayBetweenMessages = workspace.ai_delay_between_messages;
            }
            
            await addMessageProcessingJob(jobData);
        }
    }

    private async processStatusUpdate(statusData: any, workspace: any) {
        console.log('[EvolutionWebhook] Atualizando status:', statusData);

        const messageId = statusData.keyId;
        const status = this.evolutionStatusToDbStatus(statusData.status);
        const recipientPhone = statusData.remoteJid?.split('@')[0];

        if (!messageId || !status || !recipientPhone) {
            console.warn('[EvolutionWebhook] Dados de status incompletos');
            return;
        }

        // Buscar mensagem para atualizar
        const message = await prisma.message.findFirst({
            where: { providerMessageId: messageId },
            select: { id: true, conversation_id: true, status: true }
        });

        if (!message) {
            console.warn('[EvolutionWebhook] Mensagem não encontrada para atualização de status');
            return;
        }

        // Atualizar status
        await prisma.message.update({
            where: { id: message.id },
            data: { status }
        });

        // Notificar atualização
        await triggerStatusUpdateNotification(
            workspace.id,
            message.id,
            message.conversation_id,
            status,
            messageId,
            status === 'FAILED' ? 'Falha no envio' : undefined,
            'evolution'
        );
    }
}