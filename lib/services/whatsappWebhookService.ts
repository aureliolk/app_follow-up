import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils';
import { saveMessageRecord } from '@/lib/services/persistenceService';
import { processClientAndConversation } from '@/lib/services/clientConversationService';
import { fetchAndUploadWhatsappMedia } from '@/lib/whatsapp/mediaService';
import { decrypt } from '@/lib/encryption';
import { triggerNewMessageNotification, triggerStatusUpdateNotification } from '@/lib/pusherEvents';
import { addMessageProcessingJob } from '@/lib/queues/queueService';
import { Prisma } from '@prisma/client';

export class WhatsAppWebhookService {
    // Helper methods
    private whatsappStatusToDbStatus(whatsappStatus: string): string {
        const lowerStatus = whatsappStatus.toLowerCase();
        switch (lowerStatus) {
            case 'sent': return 'SENT';
            case 'delivered': return 'DELIVERED';
            case 'read': return 'READ';
            case 'failed': return 'FAILED';
            default:
                console.warn(`Unknown WhatsApp status: ${whatsappStatus}`);
                return whatsappStatus.toUpperCase();
        }
    }

    private async getWorkspaceByRouteToken(routeToken: string) {
        return prisma.workspace.findUnique({
            where: { whatsappWebhookRouteToken: routeToken },
            select: {
                id: true,
                whatsappWebhookVerifyToken: true,
                whatsappAppSecret: true,
                ai_delay_between_messages: true,
                whatsappAccessToken: true,
            }
        });
    }

    // Main handlers
    public async handleVerification(request: NextRequest, routeToken: string) {
        const workspace = await this.getWorkspaceByRouteToken(routeToken);
        
        if (!workspace?.whatsappWebhookVerifyToken) {
            return new NextResponse('Not found', { status: 404 });
        }

        const searchParams = request.nextUrl.searchParams;
        const mode = searchParams.get('hub.mode');
        const token = searchParams.get('hub.verify_token');
        const challenge = searchParams.get('hub.challenge');

        if (mode === 'subscribe' && token === workspace.whatsappWebhookVerifyToken) {
            return new NextResponse(challenge, { status: 200 });
        }
        
        return new NextResponse('Failed validation', { status: 403 });
    }

    public async handleIncomingMessage(request: NextRequest, routeToken: string) {
        const workspace = await this.getWorkspaceByRouteToken(routeToken);
        if (!workspace) {
            return new NextResponse('Workspace not found', { status: 404 });
        }

        try {
            const payload = await request.json();
            
            if (payload.object === 'whatsapp_business_account' && payload.entry?.length > 0) {
                for (const entry of payload.entry) {
                    await this.processEntry(entry, workspace);
                }
            }
            
            return new NextResponse('EVENT_RECEIVED', { status: 200 });
        } catch (error) {
            console.error('Error processing webhook:', error);
            return new NextResponse('Error processing webhook', { status: 500 });
        }
    }

    // Processing methods
    private async processEntry(entry: any, workspace: any) {
        if (!entry.changes?.length) return;

        console.log(`[WhatsAppWebhook] Processando entrada: ${JSON.stringify(entry)}`);

        for (const change of entry.changes) {
            if (change.field === 'messages') {
                await this.processMessages(change.value, workspace);
            } else if (change.field === 'statuses') {
                await this.processStatuses(change.value, workspace);
            }
        }
    }

    private async processMessages(value: any, workspace: any) {
        if (!value.messages?.length) return;

        console.log(`[WhatsAppWebhook] Processando mensagens: ${JSON.stringify(value.messages)}`);

        for (const message of value.messages) {
            if (!message.from) continue;

            const { client, conversation } = await this.processClientAndMessage(message, workspace);
            const { savedMessage, requiresProcessing } = await this.processMessageContent(message, workspace, conversation);
            
            await this.postMessageProcessing(savedMessage, workspace, conversation, requiresProcessing);
        }
    }

    private async processClientAndMessage(message: any, workspace: any) {
        const senderPhoneNumber = standardizeBrazilianPhoneNumber(message.from);
        console.log(`WhatsAppWebhook] Data Messagem: ${JSON.stringify(message)}`);
        // Usar pushName do WhatsApp se disponível, caso contrário usar o nome do contato ou string vazia
        const clientName = message.pushName || message.contacts?.[0]?.profile?.name || '';
        
        console.log(`[WhatsAppWebhook] Processando cliente:
            Phone: ${senderPhoneNumber}
            Nome: ${clientName}
            PushName: ${message.pushName}
            ContactName: ${message.contacts?.[0]?.profile?.name}`);

        return await processClientAndConversation(
            workspace.id,
            senderPhoneNumber,
            clientName,
            'WHATSAPP_CLOUDAPI'
        );
    }

    private async processMessageContent(message: any, workspace: any, conversation: any) {
        let messageContent: string | null = null;
        let mediaUrl: string | null = null;
        let mimeType: string | null = null;
        let mediaFilename: string | null = null;
        let requiresProcessing = false;

        if (message.type === 'text') {
            messageContent = message.text?.body;
            requiresProcessing = true;
        } else if (['image', 'audio', 'video', 'document', 'sticker'].includes(message.type)) {
            ({ mediaUrl, mimeType, mediaFilename } = await this.processMediaMessage(message, workspace, conversation));
            requiresProcessing = true;
        }

        const savedMessage = await saveMessageRecord({
            conversation_id: conversation.id,
            sender_type: 'CLIENT',
            content: messageContent,
            timestamp: new Date(parseInt(message.timestamp, 10) * 1000),
            media_url: mediaUrl,
            media_mime_type: mimeType,
            media_filename: mediaFilename,
            metadata: {
                provider: 'whatsapp_cloudapi',
                clientId: conversation.client?.id || null,
                // Adicionado fallback seguro para clientId
                // Log para debug caso client seja undefined
                ...(!conversation.client && {
                    debugWarning: 'Client object is undefined in conversation',
                    conversationId: conversation.id
                }),
                clientPhone: message.from,
                clientName: message.contacts?.[0]?.profile?.name || '',
                messageIdFromWhatsapp: message.id,
                messageType: message.type
            },
            channel_message_id: message.id
        });

        return { savedMessage, requiresProcessing };
    }

    private async processMediaMessage(message: any, workspace: any, conversation: any) {
        const mediaId = message[message.type]?.id;
        const mimeType = message[message.type]?.mime_type;
        const mediaFilename = message.document?.filename || null;
        const whatsappAccessToken = decrypt(workspace.whatsappAccessToken);

        if (!mediaId || !whatsappAccessToken) {
            throw new Error('Missing media ID or access token');
        }

        const uploadedMedia = await fetchAndUploadWhatsappMedia(
            mediaId,
            whatsappAccessToken,
            workspace.id,
            conversation.id,
            mediaFilename
        );

        if (!uploadedMedia) {
            throw new Error('Failed to upload media');
        }

        return {
            mediaUrl: uploadedMedia.url,
            mimeType: uploadedMedia.mimeType,
            mediaFilename: uploadedMedia.filename
        };
    }

    private async postMessageProcessing(message: any, workspace: any, conversation: any, requiresProcessing: boolean) {
        await triggerNewMessageNotification(workspace.id, message, 'whatsapp');

        if (requiresProcessing) {
            const jobData = {
                conversationId: conversation.id,
                clientId: conversation.client?.id || null,
                newMessageId: message.id,
                workspaceId: workspace.id,
                receivedTimestamp: message.timestamp.getTime()
            };
            // Adiciona delayBetweenMessages apenas se existir no workspace
            if (workspace.ai_delay_between_messages !== undefined) {
                (jobData as any).delayBetweenMessages = workspace.ai_delay_between_messages;
            }
            await addMessageProcessingJob(jobData);
        }
    }

    private async processStatuses(value: any, workspace: any) {
        if (!value.statuses?.length) return;

        for (const status of value.statuses) {
            await this.updateMessageStatus(status, workspace);
        }
    }

    private async updateMessageStatus(status: any, workspace: any) {
        const recipientPhoneNumber = standardizeBrazilianPhoneNumber(status.recipient_id);
        if (!recipientPhoneNumber) return;

        let message = await this.findTargetMessage(status, workspace, recipientPhoneNumber);
        if (!message) return;

        const dbNewStatus = this.whatsappStatusToDbStatus(status.status);
        await this.updateMessageAndNotify(status, message, dbNewStatus, workspace);
    }

    private async findTargetMessage(status: any, workspace: any, phoneNumber: string) {
        let message = await prisma.message.findFirst({
            where: { providerMessageId: status.id },
            select: { id: true, conversation_id: true, status: true, providerMessageId: true, channel_message_id: true, metadata: true }
        });

        if (!message && status.status.toLowerCase() === 'sent') {
            const conversation = await prisma.conversation.findFirst({
                where: {
                    workspace_id: workspace.id,
                    client: { phone_number: phoneNumber }
                },
                select: { id: true }
            });

            if (conversation) {
                message = await prisma.message.findFirst({
                    where: {
                        conversation_id: conversation.id,
                        sender_type: 'AGENT',
                        status: 'PENDING',
                    },
                    orderBy: { timestamp: 'desc' },
                    select: { id: true, conversation_id: true, status: true, providerMessageId: true, channel_message_id: true, metadata: true }
                });
            }
        }

        return message;
    }

    private async updateMessageAndNotify(status: any, message: any, newStatus: string, workspace: any) {
        const dataToUpdate: Prisma.MessageUpdateInput = { status: newStatus };

        if (status.id && (!message.providerMessageId || message.providerMessageId !== status.id)) {
            dataToUpdate.providerMessageId = status.id;
            dataToUpdate.channel_message_id = status.id;
        }

        if (newStatus === 'FAILED' && status.errors) {
            const errorInfo = status.errors[0];
            dataToUpdate.metadata = {
                ...(message.metadata as object || {}),
                errorCode: errorInfo?.code,
                errorTitle: errorInfo?.title,
                errorMessage: errorInfo?.message,
                errorDetails: errorInfo?.error_data?.details,
            };
        }

        await prisma.message.update({
            where: { id: message.id },
            data: dataToUpdate
        });

        await triggerStatusUpdateNotification(
            workspace.id,
            message.id,
            message.conversation_id,
            newStatus,
            status.id,
            newStatus === 'FAILED' ? status.errors?.[0]?.title : undefined,
            'whatsapp'
        );
    }
}