// app/api/webhooks/ingress/evolution/hook/[evolutionWebhookToken]/route.ts

import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { addMessageProcessingJob } from '@/lib/queues/queueService';
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils';
import { saveMessageRecord } from '@/lib/services/persistenceService';
import pusher from '@/lib/pusher';
import { triggerWorkspacePusherEvent } from '@/lib/pusherEvents';
import { getOrCreateConversation, initiateFollowUpSequence, handleDealCreationForNewClient } from '@/lib/services/createConversation';
import { Prisma } from '@prisma/client';
import { SelectedMessageInfo } from '@/lib/types/message';

// Interface para os parâmetros da rota
interface RouteParams {
    params: {
        evolutionWebhookToken: string;
    }
}

interface EvolutionMessageData {
    key: {
        remoteJid: string;
        fromMe: boolean;
        id: string;
        participant?: string;
    };
    pushName?: string;
    message?: { // O conteúdo da mensagem varia
        conversation?: string; // Para mensagens de texto
        imageMessage?: {
            caption?: string;
            url?: string;
            directPath?: string;
            mimetype?: string;
            fileLength?: string; // Adicionado com base nos logs
        };
        audioMessage?: {
            url?: string;
            directPath?: string;
            mimetype?: string;
            seconds?: number;
            ptt?: boolean;
            fileLength?: string; // Adicionado com base nos logs
        };
        videoMessage?: {
            caption?: string;
            url?: string;
            directPath?: string;
            mimetype?: string;
            seconds?: number;
            fileLength?: string; // Adicionado com base nos logs
        };
        documentMessage?: {
            caption?: string;
            fileName?: string;
            url?: string;
            directPath?: string;
            mimetype?: string;
            fileLength?: string;
        };
        stickerMessage?: {
            url?: string;
            directPath?: string;
            mimetype?: string;
            fileLength?: string;
        };
        // Adicionar outros tipos se necessário
    };
    messageTimestamp: string | number; // Vem como string ou número
    messageType?: string; // Adicionado com base nos logs, ex: "imageMessage", "audioMessage"
    // Adicionar outros campos de 'data' se necessário
}



// --- Função auxiliar para mapear status da Evolution para status do DB ---
// TODO: Ajustar os status da Evolution e do DB conforme necessário
function evolutionStatusToDbStatus(evolutionStatus: string): string {
    const lowerStatus = evolutionStatus.toLowerCase();
    switch (lowerStatus) {
        case 'sent': // Ou 'ack_sent' ou similar da Evolution
            return 'SENT';
        case 'delivery_ack': // Ou 'ack_delivered'
            return 'DELIVERED';
        case 'read': // Ou 'ack_read'
            return 'READ';
        case 'played': // Evolution tem status 'played' para mídia
            return 'READ'; // Mapear 'played' para 'READ' por simplicidade
        case 'error': // Ou 'ack_error'
            return 'FAILED';
        default:
            console.warn(`[evolutionStatusToDbStatus] Unknown Evolution status: ${evolutionStatus}. Returning as raw.`);
            return evolutionStatus.toUpperCase(); // Retornar em maiúsculas como fallback
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const { evolutionWebhookToken } = await params;
    console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida requisição POST.`);

    const workspace = await prisma.workspace.findUnique({
        where: { evolution_webhook_route_token: evolutionWebhookToken },
        select: { id: true, evolution_api_token: true, ai_delay_between_messages: true /* Este é o token da *instância* Evolution, pode ser útil para API calls futuras */ }
    });

    if (!workspace) {
        console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Workspace não encontrado para este token. Rejeitando.`);
        return new NextResponse('Workspace not found or invalid token', { status: 404 });
    }

    // 3. Processar Payload
    try {
        const payload: any = await request.json();
        console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Payload Recebido:`, JSON.stringify(payload, null, 2));

        // Verificar se é um evento de mensagem nova e se não é de nós mesmos (fromMe: false)
        if (payload.event === 'messages.upsert' && payload.data?.key && !payload.data.key.fromMe) {
            const messageData = payload.data;
            const workspaceId = workspace.id; // ID do nosso workspace

            // Extrair dados da mensagem
            let senderJidWithSuffix: string | undefined;
            if (messageData.key.remoteJid?.endsWith('@g.us')) {
                // Mensagem de Grupo: o remetente é o 'participant'
                senderJidWithSuffix = messageData.key.participant;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Mensagem de grupo detectada. Usando participant: ${senderJidWithSuffix}`);
            } else {
                // Mensagem Direta: o remetente é o 'remoteJid' dentro de 'data.key'
                senderJidWithSuffix = messageData.key.remoteJid; // CORRIGIDO: Usar o JID do cliente de data.key.remoteJid
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Mensagem direta detectada. Usando messageData.key.remoteJid: ${senderJidWithSuffix}`);
            }

            if (!senderJidWithSuffix) {
                console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Não foi possível determinar o JID do remetente. Pulando mensagem ${messageData.key.id}.`);
                return new NextResponse('EVENT_RECEIVED_MISSING_SENDER_JID', { status: 200 });
            }

            const senderName = messageData.pushName || null; // Nome do contato
            const messageIdFromEvolution = messageData.key.id; // ID da mensagem na Evolution

            let messageContentOutput: string | null = null;
            let messageTypeOutput: string = 'unknown'; // Tipo da mensagem (text, image, etc.)
            let mediaUrlOutput: string | null = null;
            let mediaTypeOutput: string | null = null;
            let mediaDurationOutput: number | undefined = undefined;
            let isPttOutput: boolean | undefined = undefined;
            let requiresProcessing = false;
            let mediaData_base64: string | null = null; // <<< Adicionar variável para o base64

            const typeOfMessage = payload.data.messageType; // Usar o messageType do payload.data
            // <<< Tentar extrair o base64 do nível messageData.message, se existir >>>
            if (messageData.message && typeof (messageData.message as any).base64 === 'string') {
                mediaData_base64 = (messageData.message as any).base64;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Campo base64 encontrado em messageData.message.`);
            }

            if (typeOfMessage === 'conversation' || typeOfMessage === 'extendedTextMessage') { // Evolution usa 'conversation' para texto simples
                messageContentOutput = messageData.message?.conversation || (messageData.message as any)?.extendedTextMessage?.text || "";
                messageTypeOutput = 'text';
                requiresProcessing = true;
            } else if (typeOfMessage === 'imageMessage' && messageData.message?.imageMessage) {
                const imgMsg = messageData.message.imageMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida imageMessage.`);
                messageContentOutput = imgMsg.caption || "[Imagem Recebida]";
                messageTypeOutput = 'image';
                mediaUrlOutput = imgMsg.url || imgMsg.directPath || null;
                mediaTypeOutput = imgMsg.mimetype || null;
                // Não há campo base64 na interface imageMessage, remover a tentativa de extração daqui
                requiresProcessing = true;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Image Details: Content='${messageContentOutput}', MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', HasBase64='${!!mediaData_base64}'`);
            } else if (typeOfMessage === 'audioMessage' && messageData.message?.audioMessage) {
                const audioMsg = messageData.message.audioMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida audioMessage.`);
                messageContentOutput = "[Áudio Recebido]";
                messageTypeOutput = 'audio';
                mediaUrlOutput = audioMsg.url || audioMsg.directPath || null;
                mediaTypeOutput = audioMsg.mimetype || null;
                // Não há campo base64 na interface audioMessage, remover a tentativa de extração daqui
                mediaDurationOutput = audioMsg.seconds;
                isPttOutput = audioMsg.ptt;
                requiresProcessing = true; // Áudios podem precisar de processamento (ex: transcrição)
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Audio Details: MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', DurationS='${mediaDurationOutput}', PTT='${isPttOutput}', HasBase64='${!!mediaData_base64}'`);
            } else if (typeOfMessage === 'videoMessage' && messageData.message?.videoMessage) {
                const videoMsg = messageData.message.videoMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida videoMessage.`);
                messageContentOutput = videoMsg.caption || "[Vídeo Recebido]";
                messageTypeOutput = 'video';
                mediaUrlOutput = videoMsg.url || videoMsg.directPath || null;
                mediaTypeOutput = videoMsg.mimetype || null;
                // Não há campo base64 na interface videoMessage, remover a tentativa de extração daqui
                mediaDurationOutput = videoMsg.seconds;
                requiresProcessing = true;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Video Details: Content='${messageContentOutput}', MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', DurationS='${mediaDurationOutput}', HasBase64='${!!mediaData_base64}'`);
            } else if (typeOfMessage === 'documentMessage' && messageData.message?.documentMessage) {
                const docMsg = messageData.message.documentMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida documentMessage.`);
                messageContentOutput = docMsg.caption || docMsg.fileName || "[Documento Recebido]";
                messageTypeOutput = 'document';
                mediaUrlOutput = docMsg.url || docMsg.directPath || null;
                mediaTypeOutput = docMsg.mimetype || null;
                // Não há campo base64 na interface documentMessage, remover a tentativa de extração daqui
                requiresProcessing = true;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Document Details: Content='${messageContentOutput}', MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', HasBase64='${!!mediaData_base64}'`);
            } else if (typeOfMessage === 'stickerMessage' && messageData.message?.stickerMessage) {
                const stickerMsg = messageData.message.stickerMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida stickerMessage.`);
                messageContentOutput = "[Sticker Recebido]";
                messageTypeOutput = 'sticker';
                mediaUrlOutput = stickerMsg.url || stickerMsg.directPath || null;
                mediaTypeOutput = stickerMsg.mimetype || null;
                // Não há campo base64 na interface stickerMessage, remover a tentativa de extração daqui
                requiresProcessing = false; // Stickers geralmente não precisam de processamento complexo
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Sticker Details: MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', HasBase64='${!!mediaData_base64}'`);
            } else {
                // Outros tipos de mensagem não tratados ou payload inesperado
                console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Tipo de mensagem '${typeOfMessage}' não suportado ou conteúdo ausente no payload da Evolution:`, messageData.message);
                return new NextResponse('EVENT_RECEIVED_UNSUPPORTED_MESSAGE_TYPE', { status: 200 });
            }

            // Timestamp da mensagem (converter para milissegundos se estiver em segundos)
            const receivedTimestamp = typeof messageData.messageTimestamp === 'string'
                ? parseInt(messageData.messageTimestamp, 10) * 1000
                : messageData.messageTimestamp * 1000;

            // Padronizar número do remetente (extrair apenas os dígitos do JID CORRETO)
            const senderPhoneNumberRaw = senderJidWithSuffix.split('@')[0]; // <<< Usa o JID correto
            const senderPhoneNumber = standardizeBrazilianPhoneNumber(senderPhoneNumberRaw);

            if (!senderPhoneNumber) {
                console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Número do remetente inválido ou não padronizável: ${senderPhoneNumberRaw}. Pulando mensagem ${messageIdFromEvolution}.`);
                return new NextResponse('EVENT_RECEIVED_INVALID_SENDER', { status: 200 });
            }


            const { client, conversation, conversationWasCreated } = await getOrCreateConversation(workspace.id, senderPhoneNumber, senderName, 'WHATSAPP_EVOLUTION');
            if (conversationWasCreated) {
                await handleDealCreationForNewClient(client, workspace.id);
                await initiateFollowUpSequence(client, conversation, workspace.id);
            }
           

            // Salvar registro da mensagem
            const savedMessage = await saveMessageRecord({
                conversation_id: conversation.id,
                sender_type: 'CLIENT',
                content: messageContentOutput!,
                timestamp: new Date(receivedTimestamp),
                metadata: {
                    messageIdFromProvider: messageIdFromEvolution,
                    provider: 'evolution',
                    clientId: client.id, // Add client ID
                    clientName: client.name, // Add client name
                    clientPhone: client.phone_number, // Add client phone number
                    ...(mediaUrlOutput && { mediaUrl: mediaUrlOutput }),
                    ...(mediaTypeOutput && { mediaType: mediaTypeOutput }),
                    ...(mediaData_base64 && { mediaData_base64: mediaData_base64 }),
                    ...(mediaDurationOutput !== undefined && { mediaDuration: mediaDurationOutput }),
                    ...(isPttOutput !== undefined && { isPtt: isPttOutput }),
                    messageType: messageTypeOutput,
                },
                channel_message_id: messageIdFromEvolution,
                providerMessageId: messageIdFromEvolution
            });
            console.log(
                `[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Mensagem ${savedMessage.id} salva para Conv ${conversation.id}.`
            );

            // Disparar evento Pusher
            try {
                const channelName = `private-workspace-${workspaceId}`;
                // Create a copy of savedMessage.metadata without mediaData_base64 for Pusher
                const originalMetadata = savedMessage.metadata;
                let pusherMetadata: Record<string, any>; // Explicitly type as object

                if (typeof originalMetadata === 'object' && originalMetadata !== null) {
                    pusherMetadata = { ...originalMetadata as Record<string, any> }; // Cast and spread
                } else {
                    pusherMetadata = {}; // Default to empty object if not a valid object
                }

                if (pusherMetadata.mediaData_base64) {
                    delete pusherMetadata.mediaData_base64;
                }

                const eventPayloadPusher = {
                    type: 'new_message',
                    payload: {
                        id: (savedMessage as any).id,
                        conversation_id: (savedMessage as any).conversation_id,
                        sender_type: (savedMessage as any).sender_type,
                        content: (savedMessage as any).content,
                        timestamp: (savedMessage as any).timestamp,
                        status: (savedMessage as any).status,
                        channel_message_id: (savedMessage as any).channel_message_id,
                        providerMessageId: (savedMessage as any).providerMessageId,
                        metadata: pusherMetadata, // Use the modified metadata
                    }
                };
                await pusher.trigger(channelName, 'new_message', eventPayloadPusher);
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Pusher event 'new_message' triggered on channel ${channelName} for msg ${savedMessage.id}`);
            } catch (pusherError) {
                console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Failed to trigger Pusher event for msg ${savedMessage.id}:`, pusherError);
            }

            // Enfileirar Job para Processamento da Mensagem (IA, etc.)
            if (requiresProcessing) {
                try {
                    const jobData = {
                        conversationId: conversation.id,
                        clientId: client.id,
                        newMessageId: savedMessage.id,
                        workspaceId: workspaceId,
                        receivedTimestamp: receivedTimestamp,
                        delayBetweenMessages: workspace.ai_delay_between_messages
                    };
                    await addMessageProcessingJob(jobData);
                    console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Job adicionado à fila message-processing para msg ${savedMessage.id}.`);
                } catch (queueError) {
                    console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Falha ao adicionar job à fila message-processing:`, queueError);
                }
            }

        } else if (payload.event === 'messages.update' && payload.data?.status && payload.data?.keyId && payload.data?.fromMe === true) {
            // <<< INÍCIO: Lógica de Tratamento de Status da Evolution API >>>
            console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] Processing status update.`);
            const statusData = payload.data;

            const providerMessageIdToUpdate = statusData.keyId; // Usar keyId como WAMID
            const evolutionNewStatus = statusData.status;
            const recipientJidRaw = statusData.remoteJid; // Este é o JID do destinatário da mensagem original

            if (!providerMessageIdToUpdate) {
                console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] keyId (providerMessageId) não encontrado no payload de status. Pulando.`);
                return new NextResponse('EVENT_RECEIVED_STATUS_UPDATE_MISSING_KEY_ID', { status: 200 });
            }

            const recipientPhoneNumber = standardizeBrazilianPhoneNumber(recipientJidRaw.split('@')[0]);
            if (!recipientPhoneNumber) {
                console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recipient JID ${recipientJidRaw} inválido ou não padronizável. Pulando status para ${providerMessageIdToUpdate}.`);
                return new NextResponse('EVENT_RECEIVED_STATUS_UPDATE_INVALID_RECIPIENT', { status: 200 });
            }
            
            console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] Processing Status: ProviderMsgID=${providerMessageIdToUpdate}, EvoStatus=${evolutionNewStatus}, Recipient=${recipientPhoneNumber}`);

            let targetMessage: SelectedMessageInfo | null = null;

            // 1. Tentar encontrar a mensagem pelo providerMessageId (keyId)
            targetMessage = await prisma.message.findFirst({
                where: { providerMessageId: providerMessageIdToUpdate }, // Assumindo que keyId é o WAMID
                select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, channel_message_id: true, metadata: true }
            });

            // 2. Fallback: Se status for 'SENT' e não encontrou pelo WAMID, buscar PENDING para o destinatário
            if (!targetMessage && evolutionNewStatus.toLowerCase() === 'sent') {
                const conversationForRecipient = await prisma.conversation.findFirst({
                    where: {
                        workspace_id: workspace.id,
                        client: { phone_number: recipientPhoneNumber },
                        channel: 'WHATSAPP_EVOLUTION' // Importante para filtrar a conversa correta
                    },
                    select: { id: true }
                });
                if (conversationForRecipient) {
                    targetMessage = await prisma.message.findFirst({
                        where: {
                            conversation_id: conversationForRecipient.id,
                            sender_type: 'AGENT', // Ou 'AI' se for o caso
                            status: 'PENDING',
                        },
                        orderBy: { timestamp: 'desc' },
                        select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, channel_message_id: true, metadata: true }
                    });
                    if (targetMessage) {
                        console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] Fallback: Found PENDING message ${targetMessage.id} for recipient ${recipientPhoneNumber} to update to SENT.`);
                    }
                }
            }

            if (!targetMessage) {
                console.warn(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] Could not find target message for ProviderMsgID ${providerMessageIdToUpdate}. Skipping status update.`);
                return new NextResponse('EVENT_RECEIVED_STATUS_UPDATE_MESSAGE_NOT_FOUND', { status: 200 });
            }

            const dbNewStatus = evolutionStatusToDbStatus(evolutionNewStatus);
            const currentStatusOrder = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'];
            const existingStatusIndex = currentStatusOrder.indexOf(targetMessage.status);
            const newStatusIndex = currentStatusOrder.indexOf(dbNewStatus);

            if (newStatusIndex > existingStatusIndex || (dbNewStatus === 'FAILED' && targetMessage.status !== 'FAILED')) {
                console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] DB_UPDATE: Progressing status for Msg ${targetMessage.id} from ${targetMessage.status} to ${dbNewStatus}.`);

                const dataToUpdate: Prisma.MessageUpdateInput = { status: dbNewStatus };

                // Se o status for SENT e a mensagem no DB não tiver providerMessageId, ou se for diferente do keyId
                if (dbNewStatus === 'SENT' && (!targetMessage.providerMessageId || targetMessage.providerMessageId !== providerMessageIdToUpdate)) {
                    dataToUpdate.providerMessageId = providerMessageIdToUpdate;
                    // channel_message_id também era usado para WAMID/keyId
                    if (targetMessage.channel_message_id !== providerMessageIdToUpdate) {
                        dataToUpdate.channel_message_id = providerMessageIdToUpdate;
                    }
                    console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] DB_UPDATE: Msg ${targetMessage.id}: Updating ProviderMsgID/ChannelMsgID to ${providerMessageIdToUpdate}`);
                }
                // Para outros status progressivos, se o providerMessageId estiver faltando ou for diferente (raro, mas garante consistência)
                else if ((dbNewStatus === 'DELIVERED' || dbNewStatus === 'READ') && (!targetMessage.providerMessageId || targetMessage.providerMessageId !== providerMessageIdToUpdate)) {
                    dataToUpdate.providerMessageId = providerMessageIdToUpdate;
                    if (targetMessage.channel_message_id !== providerMessageIdToUpdate) {
                        dataToUpdate.channel_message_id = providerMessageIdToUpdate;
                    }
                    console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] DB_UPDATE: Msg ${targetMessage.id}: Correcting ProviderMsgID/ChannelMsgID to ${providerMessageIdToUpdate} for status ${dbNewStatus}.`);
                }
                
                // TODO: Tratar erros da Evolution API.
                // A API Evolution pode não fornecer detalhes de erro da mesma forma que a Meta.
                // Por enquanto, se for FAILED, apenas atualizamos o status.
                // Será preciso investigar como a Evolution API retorna detalhes de erro em 'messages.update'
                if (dbNewStatus === 'FAILED') {
                    const currentMetadata = (typeof targetMessage.metadata === 'object' && targetMessage.metadata !== null) ? targetMessage.metadata : {};
                    dataToUpdate.metadata = {
                        ...currentMetadata,
                        evolutionErrorCode: statusData.errorCode || 'UNKNOWN', // Supondo que 'errorCode' possa vir no payload
                        evolutionErrorMessage: statusData.errorMessage || 'Message failed to send via Evolution.', // Supondo
                    };
                    console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] DB_UPDATE: Msg ${targetMessage.id}: Adding FAILED (Evolution) error details to metadata.`);
                }

                try {
                    await prisma.message.update({
                        where: { id: targetMessage.id },
                        data: dataToUpdate
                    });
                    console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] DB_UPDATE: Msg ${targetMessage.id}: DB Update successful. Status=${dbNewStatus}.` + (dataToUpdate.providerMessageId ? ` ProviderMsgID=${dataToUpdate.providerMessageId}` : ''));
                } catch (dbError) {
                    console.error(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] DB_UPDATE: Error updating message ${targetMessage.id} in DB:`, dbError);
                }

                const payloadToPublish = {
                    id: targetMessage.id, // Changed from messageId
                    conversation_id: targetMessage.conversation_id,
                    status: dbNewStatus, // Changed from newStatus
                    channel_message_id: providerMessageIdToUpdate, // Changed from providerMessageId
                    errorMessage: dbNewStatus === 'FAILED' ? (statusData.errorMessage || 'Failed via Evolution') : undefined
                };
                console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] Preparing 'message_status_updated' (${dbNewStatus}) for Msg ID ${targetMessage.id}`);

                const channelName = `private-workspace-${workspace.id}`;
                const eventPayloadPusher = { type: 'message_status_update', payload: payloadToPublish };

                try {
                    await pusher.trigger(channelName, 'message_status_update', eventPayloadPusher);
                    console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] Pusher event 'message_status_update' triggered on ${channelName} for Msg ID ${targetMessage.id}`);
                } catch (pusherError: any) {
                    console.error(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] Failed to trigger Pusher event for Msg ID ${targetMessage.id}:`, pusherError?.message || pusherError);
                }
            } else {
                console.log(`[EVO_STATUS_LOG - ${evolutionWebhookToken}] Received EvoStatus '${evolutionNewStatus}' (maps to ${dbNewStatus}) for Msg ID ${targetMessage.id}, but current DB status is '${targetMessage.status}'. No progression needed or already FAILED.`);
            }
             // <<< FIM: Lógica de Tratamento de Status da Evolution API >>>

        } else {
            // Evento não é 'messages.upsert' (nova mensagem recebida) nem 'messages.update' (status de mensagem enviada)
            // ou é uma mensagem de nós mesmos (fromMe: true para messages.upsert) que não deve ser processada como nova.
            // Ou é um 'messages.update' sem os campos necessários para status.
            console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Evento não processado ou mensagem de saída: ${payload.event}, fromMe: ${payload.data?.key?.fromMe}`);
        }

    } catch (error: any) {
        console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Erro ao processar payload:`, error);
        // Responder OK mesmo em erro de processamento para não bloquear a API Evolution
    }

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
}

// (Opcional) Adicionar método GET se a Evolution precisar de verificação como a Meta
// Esta API da Evolution normalmente não usa GET para verificação de webhook como a Meta.
// O token na URL é a forma de autenticação do webhook.
// export async function GET(request: NextRequest, { params }: RouteParams) { ... }
