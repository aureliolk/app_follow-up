// app/api/webhooks/ingress/whatsapp/[routeToken]/route.ts

import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

import { addMessageProcessingJob } from '@/lib/queues/queueService'; // Importar função de enfileiramento
import { Prisma, FollowUpStatus } from '@prisma/client'; // Importar tipos necessários E FollowUpStatus
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue'; // <<< IMPORTAR a fila de sequência
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils'; // CORREÇÃO: Importar do local correto
import { saveMessageRecord } from '@/lib/services/persistenceService';
import { triggerNewMessageNotification, triggerStatusUpdateNotification } from '@/lib/pusherEvents';
import { createDeal } from '@/lib/actions/pipelineActions';
import { getPipelineStages } from '@/lib/actions/pipelineActions';
import { 
  getOrCreateConversation, 
  handleDealCreationForNewClient, 
  initiateFollowUpSequence 
} from '@/lib/services/createConversation';


// Define a type for the selected message fields
type SelectedMessageInfo = {
    id: string;
    conversation_id: string;
    status: string;
    sender_type: string; // Assuming MessageSenderType is string-based enum
    providerMessageId: string | null;
    channel_message_id: string | null;
    metadata: Prisma.JsonValue; // Use Prisma.JsonValue for metadata type
};

// Define interface for route parameters if not already defined earlier
interface RouteParams {
    params: {
        routeToken: string;
    }
}

// --- Função auxiliar para mapear status do WhatsApp para status do DB ---
function whatsappStatusToDbStatus(whatsappStatus: string): string {
    const lowerStatus = whatsappStatus.toLowerCase();
    switch (lowerStatus) {
        case 'sent':
            return 'SENT';
        case 'delivered':
            return 'DELIVERED';
        case 'read':
            return 'READ';
        case 'failed':
            return 'FAILED';
        default:
            console.warn(`[whatsappStatusToDbStatus] Unknown WhatsApp status: ${whatsappStatus}. Returning as raw.`);
            return whatsappStatus.toUpperCase(); // Retornar em maiúsculas como fallback
    }
}

// --- Função auxiliar para buscar Workspace e segredos ---
async function getWorkspaceByRouteToken(routeToken: string) {
    if (!routeToken) return null;

    // Busca o workspace pelo token único da rota do webhook
    const workspace = await prisma.workspace.findUnique({
        where: { whatsappWebhookRouteToken: routeToken },
        select: {
            id: true,
            whatsappWebhookVerifyToken: true, // Usado no GET
            whatsappAppSecret: true,        // Usado no POST (precisa descriptografar)
            ai_delay_between_messages: true,
        }
    });

    console.log(`[WHATSAPP WEBHOOK - WORKSPACE ${routeToken}] Workspace encontrada: ${workspace?.id}`);
    return workspace;
}

// --- Método GET para Verificação ---
export async function GET(request: NextRequest, { params }: RouteParams) {
    const { routeToken } = await params;
    console.log(`[WHATSAPP WEBHOOK - GET ${routeToken}] Recebida requisição GET para verificação.`);

    // Log antes da busca
    console.log(`[WHATSAPP WEBHOOK - GET ${routeToken}] Buscando workspace com whatsappWebhookRouteToken = ${routeToken}`);

    // Buscar o workspace para obter o Verify Token específico
    const workspace = await getWorkspaceByRouteToken(routeToken);

    // Log após a busca
    console.log(`[WHATSAPP WEBHOOK - GET ${routeToken}] Resultado da busca: ${workspace ? `Workspace ID: ${workspace.id}` : 'Nenhum workspace encontrado.'}`);

    if (!workspace || !workspace.whatsappWebhookVerifyToken) {
        // Log explicando o motivo do 404
        if (!workspace) {
            console.warn(`[WHATSAPP WEBHOOK - GET ${routeToken}] ERRO 404/405: Nenhum workspace encontrado no banco com este routeToken.`);
        } else {
            console.warn(`[WHATSAPP WEBHOOK - GET ${routeToken}] ERRO 404/405: Workspace ${workspace.id} encontrado, mas não possui whatsappWebhookVerifyToken configurado.`);
        }
        // Retornar 404 se não encontrou ou não tem o token de verificação
        return new NextResponse('Endpoint configuration not found or invalid.', { status: 404 });
    }
    const expectedVerifyToken = workspace.whatsappWebhookVerifyToken; // Token específico do Workspace!

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token'); // Token enviado pela Meta
    const challenge = searchParams.get('hub.challenge'); // Challenge a ser retornado

    console.log(`[WHATSAPP WEBHOOK - GET ${routeToken}] Modo: ${mode}, Token Recebido: ${token}, Token Esperado: ${expectedVerifyToken}, Challenge: ${challenge}`);

    // Verifica se o modo e o token estão corretos
    if (mode === 'subscribe' && token === expectedVerifyToken) {
        console.log(`[WHATSAPP WEBHOOK - GET ${routeToken}] Verificação bem-sucedida.`);
        // Responde com o challenge e status 200 OK
        return new NextResponse(challenge, { status: 200 });
    } else {
        console.warn(`[WHATSAPP WEBHOOK - GET ${routeToken}] Falha na verificação (modo ou token incorreto).`);
        // Responde com 403 Forbidden se o token ou modo estiverem incorretos
        return new NextResponse('Failed validation. Make sure the validation tokens match.', { status: 403 });
    }
}

// --- Método POST para Receber Eventos ---
export async function POST(request: NextRequest, { params }: RouteParams) {
    const { routeToken } = await params;
    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Recebida requisição POST (evento).`);

    const rawBody = await request.clone().text();

    const workspace = await getWorkspaceByRouteToken(routeToken);
    if (!workspace) {
        // Se não encontrar o workspace, ainda não podemos processar a mensagem.
        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Workspace não encontrado para este routeToken. Rejeitando.`);
        // Usar 404 Not Found ou 400 Bad Request pode ser apropriado aqui
        return new NextResponse('Workspace not found for route token', { status: 404 });
    }

    // 2. OBTER APP SECRET DA VARIÁVEL DE AMBIENTE
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] ERRO CRÍTICO: Variável de ambiente WHATSAPP_APP_SECRET não está definida.`);
        // Retornar 500 pois é um erro de configuração do servidor
        return new NextResponse('Internal Server Error: App Secret configuration missing.', { status: 500 });
    }

    // --- INÍCIO: Processamento do Payload (APÓS validação) ---
    try {
        const payload = JSON.parse(rawBody); // Parse seguro APÓS validação
        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Payload Parsed:`, JSON.stringify(payload, null, 2));

        // Navegar pelo payload do WhatsApp Cloud API
        if (payload.object === 'whatsapp_business_account' && payload.entry?.length > 0) {
            for (const entry of payload.entry) {
                if (entry.changes?.length > 0) {
                    for (const change of entry.changes) {
                        if (change.field === 'messages' && change.value?.messages?.length > 0) {
                            const metadata = change.value.metadata; 
                            const contacts = change.value.contacts; 
                            for (const message of change.value.messages) {
                                
                                if (message.from) {
                                    const senderName = contacts?.[0]?.profile?.name;

                                    const receivedTimestamp = parseInt(message.timestamp, 10) * 1000; // Timestamp da mensagem (em segundos, converter para ms)
                                    const senderPhoneNumberRaw = message.from; // Número original
                                    const messageIdFromWhatsapp = message.id; // ID da mensagem na API do WhatsApp
                                    const workspacePhoneNumberId = metadata?.phone_number_id; // <<< USAR METADATA DEFINIDO ACIMA

                                    // Padronizar número do remetente
                                    const senderPhoneNumber = standardizeBrazilianPhoneNumber(senderPhoneNumberRaw);
                                    if (!senderPhoneNumber) {
                                        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Número do remetente inválido ou não padronizável: ${senderPhoneNumberRaw}. Pulando mensagem ${messageIdFromWhatsapp}.`);
                                    }

                                    const { client, conversation, conversationWasCreated } =  await getOrCreateConversation(workspace.id, senderPhoneNumber, senderName, 'WHATSAPP_CLOUDAPI');
                                    if (conversationWasCreated) {
                                        await handleDealCreationForNewClient(client, workspace.id);
                                        await initiateFollowUpSequence(client, conversation, workspace.id);
                                    }

                                    let messageContent: string | null = null;
                                    const messageType = message.type;
                                    let mediaId: string | null = null;
                                    let mimeType: string | null = null; 
                                    let requiresProcessing = false; 

                                    if (messageType === 'text') {
                                        messageContent = message.text?.body;
                                        requiresProcessing = true; // Texto normal também vai para IA
                                    } else if (messageType === 'image') { // <<< Tratamento de Imagem >>>
                                        messageContent = "[Imagem Recebida]"; // Placeholder
                                        mediaId = message.image?.id ?? null;
                                        mimeType = message.image?.mime_type ?? null;
                                        requiresProcessing = !!mediaId; // Só processa se tiver ID
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Imagem Recebida: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`);
                                    } else if (messageType === 'audio') { // <<< Tratamento de Áudio >>>
                                        messageContent = "[Áudio Recebido]"; // Placeholder
                                        mediaId = message.audio?.id ?? null;
                                        mimeType = message.audio?.mime_type ?? null;
                                        requiresProcessing = !!mediaId;
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Áudio Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`);
                                    } else if (messageType === 'video') { // <<< Tratamento de Vídeo >>>
                                        messageContent = "[Vídeo Recebido]"; // Placeholder
                                        mediaId = message.video?.id ?? null;
                                        mimeType = message.video?.mime_type ?? null;
                                        requiresProcessing = !!mediaId;
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Vídeo Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`);
                                    } else if (messageType === 'document') { // <<< Tratamento de Documento >>>
                                        messageContent = `[Documento Recebido: ${message.document?.filename || 'Nome não disponível'}]`; // Placeholder com nome do arquivo
                                        mediaId = message.document?.id ?? null;
                                        mimeType = message.document?.mime_type ?? null;
                                        requiresProcessing = !!mediaId;
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Documento Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`);
                                    } else if (messageType === 'sticker') { // <<< Tratamento de Sticker >>>
                                        messageContent = "[Sticker Recebido]"; // Placeholder
                                        mediaId = message.sticker?.id ?? null;
                                        mimeType = message.sticker?.mime_type ?? null;
                                        requiresProcessing = !!mediaId; // Sticker também pode ser baixado
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Sticker Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`);
                                    } else {
                                        // Outros tipos (location, contacts, etc.) - Logar e não processar
                                        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Tipo de mensagem não suportado recebido: ${messageType}. Pulando.`);
                                        continue; // Pula para a próxima mensagem
                                    }
                                    // Validar se temos conteúdo (ou placeholder)
                                    if (!messageContent || !requiresProcessing) { // Pula se não tiver conteúdo OU não for para processar
                                        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Conteúdo da mensagem não processável ou tipo ${messageType} não tratado. Pulando.`);
                                        continue;
                                    }

                                    if (!workspacePhoneNumberId) {
                                        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Workspace Phone Number ID não encontrado. Rejeitando.`);
                                        continue;
                                    }

                                    // --- Save Message ---
                                    const savedMessage = await saveMessageRecord({
                                        conversation_id: conversation.id,
                                        sender_type: 'CLIENT',
                                        content: messageContent!,
                                        timestamp: new Date(receivedTimestamp),
                                        metadata: {
                                            provider: 'whatsapp_cloudapi',
                                            clientId: client.id,
                                            clientPhone: senderPhoneNumber,
                                            clientName: senderName,
                                            messageIdFromWhatsapp,
                                            ...(mediaId && { mediaId }),
                                            ...(mimeType && { mimeType }),
                                            messageType
                                        },
                                        channel_message_id: messageIdFromWhatsapp
                                    });
                                    console.log(
                                        `[WHATSAPP WEBHOOK - POST ${routeToken}] Mensagem ${savedMessage.id} salva para Conv ${conversation.id}.`
                                    );


                                    // --- Disparar evento Pusher para notificar a UI ---
                                    try {
                                        await triggerNewMessageNotification(workspace.id, savedMessage, 'whatsapp');
                                    } catch (pusherError) {
                                        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Failed to trigger Pusher event for msg ${savedMessage.id}:`, pusherError);
                                        // Não falhar o processamento do webhook por causa do Pusher, apenas logar.
                                    }
                                 
                                    if (requiresProcessing) {
                                        try {
                                            const jobData = {
                                                conversationId: conversation.id,
                                                clientId: client.id,
                                                newMessageId: savedMessage.id,
                                                workspaceId: workspace.id,
                                                receivedTimestamp: receivedTimestamp,
                                                delayBetweenMessages: workspace.ai_delay_between_messages
                                            };
                                            await addMessageProcessingJob(jobData);
                                            console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Job adicionado à fila message-processing para msg ${savedMessage.id}.`);
                                        } catch (queueError) {
                                            console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Falha ao adicionar job à fila message-processing:`, queueError);
                                            // Logar o erro, mas continuar, pois a mensagem foi salva
                                        }
                                    } else {
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Mensagem ${savedMessage.id} (Tipo: ${messageType}) não requer processamento pela IA/Worker. Job não enfileirado.`);
                                    }

                                } // Fim if message.from
                            } // Fim loop messages
                        }

                     
                        if (change.field === 'messages' && change.value?.statuses?.length > 0) {
                            console.log(`[WH_STATUS_LOG] Processing ${change.value.statuses.length} status update(s).`);

                            for (const status of change.value.statuses) {
                                const recipientPhoneNumberRaw = status.recipient_id;
                                const recipientPhoneNumber = standardizeBrazilianPhoneNumber(recipientPhoneNumberRaw);
                                if (!recipientPhoneNumber) {
                                    console.warn(`[WH_STATUS_LOG] Recipient ID ${recipientPhoneNumberRaw} inválido ou não padronizável. Pulando status ${status.id}.`);
                                    continue;
                                }
                                console.log(`[WH_STATUS_LOG] Recipient ID padronizado de ${recipientPhoneNumberRaw} para ${recipientPhoneNumber}`);
                                console.log(`[WH_STATUS_LOG] Processing Status: WAMID=${status.id}, Status=${status.status.toUpperCase()}, Recipient=${recipientPhoneNumber}, ConvID_WPP=${status.conversation?.id}`);

                                let targetMessage: SelectedMessageInfo | null = null;
                                let targetConversationId: string | null = null;

                                targetMessage = await prisma.message.findFirst({
                                    where: { providerMessageId: status.id },
                                    select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, channel_message_id: true, metadata: true }
                                });

                                if (targetMessage) {
                                    console.log(`[WH_STATUS_LOG] Found message by WAMID ${status.id} (ID: ${targetMessage.id}). Treating as status update (original status was ${targetMessage.status}).`);
                                    targetConversationId = targetMessage.conversation_id;
                                } else {
                                    if (status.status.toLowerCase() === 'sent') { // Chave minúscula para switch
                                        const conversationForRecipient = await prisma.conversation.findFirst({
                                            where: {
                                                workspace_id: workspace.id,
                                                client: { phone_number: recipientPhoneNumber }
                                            },
                                            select: { id: true }
                                        });
                                        if (conversationForRecipient) {
                                            targetConversationId = conversationForRecipient.id;
                                            targetMessage = await prisma.message.findFirst({
                                                where: {
                                                    conversation_id: targetConversationId,
                                                    sender_type: 'AGENT',
                                                    status: 'PENDING',
                                                },
                                                orderBy: { timestamp: 'desc' },
                                                select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, channel_message_id: true, metadata: true }
                                            });
                                            if (targetMessage) {
                                                console.log(`[WH_STATUS_LOG] Fallback: Found PENDING message ${targetMessage.id} for recipient ${recipientPhoneNumber} to update to SENT.`);
                                            } else {
                                                console.log(`[WH_STATUS_LOG] SENT Status: PENDING message from AGENT not found for Conv ${targetConversationId}.`);
                                            }
                                        } else {
                                            console.log(`[WH_STATUS_LOG] SENT Status: No conversation found for recipient ${recipientPhoneNumber}.`);
                                        }
                                    }
                                }

                                if (!targetMessage || !targetConversationId) {
                                    console.warn(`[WH_STATUS_LOG] Could not find target message or conversation for WAMID ${status.id}. Skipping.`);
                                    continue;
                                }

                                const currentStatusOrder = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'];
                                const dbNewStatus = whatsappStatusToDbStatus(status.status); // Uso da função corrigida

                                const existingStatusIndex = currentStatusOrder.indexOf(targetMessage.status);
                                const newStatusIndex = currentStatusOrder.indexOf(dbNewStatus);

                                if (newStatusIndex > existingStatusIndex || (dbNewStatus === 'FAILED' && targetMessage.status !== 'FAILED')) {
                                    console.log(`[WH_STATUS_LOG DB_UPDATE] Progressing status for Msg ${targetMessage.id} from ${targetMessage.status} to ${dbNewStatus}.`);

                                    let dataToUpdate: Prisma.MessageUpdateInput = { status: dbNewStatus };
                                    console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${targetMessage.id}: Checking WAMID. NewStatus=${dbNewStatus}, Existing ProviderID=${targetMessage.providerMessageId}, Status WAMID=${status.id}`);

                                    // Se o status for SENT e a mensagem no DB não tiver providerMessageId, ou se o providerMessageId for diferente do WAMID do status (para casos de fallback)
                                    if (dbNewStatus === 'SENT' && (!targetMessage.providerMessageId || targetMessage.providerMessageId !== status.id) && status.id) {
                                        dataToUpdate.providerMessageId = status.id;
                                        // channel_message_id também era usado para WAMID, garantir consistência se ele também for diferente
                                        if (targetMessage.channel_message_id !== status.id) {
                                            dataToUpdate.channel_message_id = status.id;
                                        }
                                        console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${targetMessage.id}: Updating WAMID (providerMessageId/channel_message_id) to ${status.id}`);
                                    }
                                    // Para outros status progressivos, se o providerMessageId estiver faltando ou for diferente (raro, mas garante consistência)
                                    else if ((dbNewStatus === 'DELIVERED' || dbNewStatus === 'READ') && (!targetMessage.providerMessageId || targetMessage.providerMessageId !== status.id) && status.id) {
                                        dataToUpdate.providerMessageId = status.id;
                                        if (targetMessage.channel_message_id !== status.id) {
                                            dataToUpdate.channel_message_id = status.id;
                                        }
                                        console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${targetMessage.id}: Correcting WAMID (providerMessageId/channel_message_id) to ${status.id} for status ${dbNewStatus}.`);
                                    }

                                    if (dbNewStatus === 'FAILED' && status.errors) {
                                        const errorInfo = status.errors[0];
                                        const currentMetadata = (typeof targetMessage.metadata === 'object' && targetMessage.metadata !== null) ? targetMessage.metadata : {};
                                        dataToUpdate.metadata = {
                                            ...currentMetadata,
                                            errorCode: errorInfo?.code,
                                            errorTitle: errorInfo?.title,
                                            errorMessage: errorInfo?.message,
                                            errorDetails: errorInfo?.error_data?.details,
                                        };
                                        console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${targetMessage.id}: Adding FAILED error details to metadata.`);
                                    }

                                    try {
                                        await prisma.message.update({
                                            where: { id: targetMessage.id },
                                            data: dataToUpdate
                                        });
                                        console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${targetMessage.id}: DB Update successful. Status=${dbNewStatus}.` + (dataToUpdate.providerMessageId ? ` WAMID=${dataToUpdate.providerMessageId}` : ''));
                                    } catch (dbError) {
                                        console.error(`[WH_STATUS_LOG DB_UPDATE] Error updating message ${targetMessage.id} in DB:`, dbError);
                                    }

                                    console.log(`[WH_STATUS_LOG] Preparing 'message_status_updated' (${dbNewStatus}) for Msg ID ${targetMessage.id}`);

                                    try {
                                        const errorMessage = dbNewStatus === 'FAILED' ? (status.errors?.[0]?.title || 'Failed') : undefined;
                                        await triggerStatusUpdateNotification(
                                            workspace.id,
                                            targetMessage.id,
                                            targetConversationId,
                                            dbNewStatus,
                                            status.id,
                                            errorMessage,
                                            'whatsapp'
                                        );
                                    } catch (pusherError: any) {
                                        console.error(`[WH_STATUS_LOG] Failed to trigger Pusher event for Msg ID ${targetMessage.id}:`, pusherError?.message || pusherError);
                                    }
                                } else {
                                    console.log(`[WH_STATUS_LOG] Received status '${status.status}' (maps to ${dbNewStatus}) for Msg ID ${targetMessage.id}, but current status is '${targetMessage.status}' (${existingStatusIndex} >= ${newStatusIndex}) or new status is not FAILED while current is. No update or Pusher event needed.`);
                                }
                            }
                        } 

                    } 
                } 
            } 
        } 
    } catch (parseError) {
        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Erro ao fazer parse do JSON ou processar payload:`, parseError);
    }

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
