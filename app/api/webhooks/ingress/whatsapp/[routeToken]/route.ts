// app/api/webhooks/ingress/whatsapp/[routeToken]/route.ts

import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { redisConnection } from '@/lib/redis'; // Importar conexão Redis
import { addMessageProcessingJob } from '@/lib/queues/queueService'; // Importar função de enfileiramento
import { ConversationStatus, Prisma, Message as PrismaMessage, FollowUpStatus } from '@prisma/client'; // Importar tipos necessários E FollowUpStatus
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue'; // <<< IMPORTAR a fila de sequência
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils'; // CORREÇÃO: Importar do local correto
import { getOrCreateConversation } from '@/lib/services/conversationService';
import { saveMessageRecord } from '@/lib/services/persistenceService';
import { publishConversationUpdate, publishWorkspaceUpdate } from '@/lib/services/notifierService';
import pusher from '@/lib/pusher'; // <-- Adicionar importação do Pusher


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
            // Inclua outros campos se necessário para o worker depois
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
    const signatureHeader = request.headers.get('X-Hub-Signature-256');

    // 1. BUSCAR O WORKSPACE (AINDA NECESSÁRIO PARA ASSOCIAR MENSAGENS)
    //    Mas NÃO usaremos mais workspace.whatsappAppSecret para validação aqui.
    const workspace = await getWorkspaceByRouteToken(routeToken);
    if (!workspace) {
        // Se não encontrar o workspace, ainda não podemos processar a mensagem.
        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Workspace não encontrado para este routeToken. Rejeitando.`);
        // Usar 404 Not Found ou 400 Bad Request pode ser apropriado aqui
        return new NextResponse('Workspace not found for route token', { status: 404 });
    }
    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Workspace ${workspace.id} encontrado. Prosseguindo com validação de assinatura global.`);

    // 2. OBTER APP SECRET DA VARIÁVEL DE AMBIENTE
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] ERRO CRÍTICO: Variável de ambiente WHATSAPP_APP_SECRET não está definida.`);
        // Retornar 500 pois é um erro de configuração do servidor
        return new NextResponse('Internal Server Error: App Secret configuration missing.', { status: 500 });
    }

    // 3. VALIDAR ASSINATURA (USANDO APP SECRET DO AMBIENTE)
    if (!signatureHeader) {
        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Assinatura ausente (X-Hub-Signature-256). Rejeitando.`);
        return new NextResponse('Missing signature header', { status: 400 });
    }

    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Assinatura validada com sucesso (usando segredo global).`);

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
                            const metadata = change.value.metadata; // <<< DEFINIR METADATA AQUI (fora do loop de msg)
                            const contacts = change.value.contacts; // <<< DEFINIR CONTACTS AQUI (fora do loop de msg)
                            for (const message of change.value.messages) {
                                // Processar mensagens de texto, imagem ou áudio recebidas
                                if (message.from) {
                                    // <<< Extrair nome do contato (se disponível) >>>
                                    const senderName = contacts?.[0]?.profile?.name;

                                    const receivedTimestamp = parseInt(message.timestamp, 10) * 1000; // Timestamp da mensagem (em segundos, converter para ms)
                                    const senderPhoneNumberRaw = message.from; // Número original
                                    const messageIdFromWhatsapp = message.id; // ID da mensagem na API do WhatsApp
                                    const workspacePhoneNumberId = metadata?.phone_number_id; // <<< USAR METADATA DEFINIDO ACIMA

                                    // Padronizar número do remetente
                                    const senderPhoneNumber = standardizeBrazilianPhoneNumber(senderPhoneNumberRaw);
                                    if (!senderPhoneNumber) {
                                        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Número do remetente inválido ou não padronizável: ${senderPhoneNumberRaw}. Pulando mensagem ${messageIdFromWhatsapp}.`);
                                        continue; // Pular esta mensagem se o número for inválido
                                    }
                                    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Remetente padronizado de ${senderPhoneNumberRaw} para ${senderPhoneNumber}`);
                                    
                                    // Obter ou criar conversa e client usando serviço modularizado
                                    const { conversation, client, wasCreated } = await getOrCreateConversation(
                                        workspace.id,
                                        senderPhoneNumber,
                                        senderName // <<< Passar o nome extraído
                                    );
                                    console.log(
                                        `[WHATSAPP WEBHOOK - POST ${routeToken}] Conversation ${conversation.id} ${wasCreated ? 'criada' : 'recuperada'} para client ${client.id}.` + (senderName ? ` (Nome: ${senderName})` : '') // Log opcional do nome
                                    );

                                    let messageContent: string | null = null;
                                    const messageType = message.type;
                                    let mediaId: string | null = null;
                                    let mimeType: string | null = null; // <<< Guardar mime_type
                                    let requiresProcessing = false; // <<< Flag para saber se deve enfileirar job

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
                                    // Persiste mensagem no banco via saveMessageRecord
                                    const savedMessage = await saveMessageRecord({
                                        conversation_id: conversation.id,
                                        sender_type: 'CLIENT',
                                        content: messageContent!,
                                        timestamp: new Date(receivedTimestamp),
                                        metadata: {
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

                                    // Notificar front-end via serviço modularizado
                                    await publishConversationUpdate(
                                        `chat-updates:${conversation.id}`,
                                        { 
                                            type: 'new_message', 
                                            payload: {
                                                ...savedMessage, // Mantém os dados originais da mensagem salva
                                                workspace_id: workspace.id // <<< ADICIONA O WORKSPACE ID AQUI
                                            } 
                                        } 
                                    );

                                    // Notificar workspace subscribers via serviço modularizado
                                    await publishWorkspaceUpdate(
                                        `workspace-updates:${workspace.id}`,
                                        {
                                            type: 'new_message',
                                            payload: savedMessage 
                                        }
                                    );

                                    // --- Disparar evento Pusher para notificar a UI ---
                                    try {
                                        const channelName = `private-workspace-${workspace.id}`;
                                        const eventPayload = JSON.stringify({ type: 'new_message', payload: savedMessage });
                                        await pusher.trigger(channelName, 'new_message', eventPayload);
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Pusher event 'new_message' triggered on channel ${channelName} for msg ${savedMessage.id}`);
                                    } catch (pusherError) {
                                        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Failed to trigger Pusher event for msg ${savedMessage.id}:`, pusherError);
                                        // Não falhar o processamento do webhook por causa do Pusher, apenas logar.
                                    }
                                    // --- Fim do disparo Pusher ---

                                    // --- Enqueue Job para Processamento da Mensagem (IA, etc.) ---
                                    // É importante que este job NÃO dependa do início do follow-up
                                    if (requiresProcessing) {
                                        try {
                                            const jobData = {
                                                conversationId: conversation.id,
                                                clientId: client.id,
                                                newMessageId: savedMessage.id,
                                                workspaceId: workspace.id,
                                                receivedTimestamp: receivedTimestamp,
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

                                    // **************************************************
                                    // <<< INÍCIO: Lógica de Disparo do Follow-up >>>
                                    // Dispara na PRIMEIRA resposta do cliente, se não houver follow-up ativo.
                                    // **************************************************
                                    // Verificar se já existe um follow-up ATIVO para este cliente
                                    const existingActiveFollowUp = await prisma.followUp.findFirst({
                                        where: {
                                            client_id: client.id,
                                            workspace_id: workspace.id,
                                            status: FollowUpStatus.ACTIVE // <<< Verifica se está ATIVO
                                        },
                                        select: { id: true } // Só precisamos saber se existe
                                    });

                                    // Só inicia um NOVO follow-up se NÃO houver um ativo
                                    if (!existingActiveFollowUp) {
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Nenhum follow-up ativo encontrado para cliente ${client.id}. Iniciando nova sequência...`);
                                        try {
                                            // 1. Buscar Regras de Follow-up para o Workspace
                                            const followUpRules = await prisma.workspaceAiFollowUpRule.findMany({
                                                where: { workspace_id: workspace.id },
                                                orderBy: { delay_milliseconds: 'asc' }, // <<< ALTERADO para ordenar pelo delay >>>
                                            });
                                            console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Encontradas ${followUpRules.length} regras de follow-up para Workspace ${workspace.id} (ordenadas por delay).`); // Log ajustado

                                            if (followUpRules.length > 0) {
                                                // 2. Pegar a primeira regra
                                                const firstRule = followUpRules[0];
                                                const firstDelayMs = Number(firstRule.delay_milliseconds); // Converter BigInt para Number para o delay do job

                                                if (isNaN(firstDelayMs) || firstDelayMs < 0) {
                                                    console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Delay da primeira regra (${firstRule.id}) é inválido (${firstDelayMs}ms). Follow-up não será iniciado.`);
                                                } else {
                                                    // 3. Criar Registro FollowUp
                                                    const newFollowUp = await prisma.followUp.create({
                                                        data: {
                                                            workspace_id: workspace.id,
                                                            client_id: client.id,
                                                            status: FollowUpStatus.ACTIVE, // Usar Enum
                                                            started_at: new Date(),
                                                            current_sequence_step_order: 0, // Começa em 0
                                                            next_sequence_message_at: new Date(Date.now() + firstDelayMs),
                                                        },
                                                    });
                                                    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Registro FollowUp ${newFollowUp.id} criado.`);

                                                    // 4. Agendar Job para o Primeiro Passo
                                                    const jobData = {
                                                        followUpId: newFollowUp.id,
                                                        stepRuleId: firstRule.id, // ID da regra a ser processada
                                                        workspaceId: workspace.id,
                                                    };
                                                    const jobOptions = {
                                                        delay: firstDelayMs,
                                                        jobId: `seq_${newFollowUp.id}_step_${firstRule.id}`, // ID único
                                                        removeOnComplete: true,
                                                        removeOnFail: 5000,
                                                    };
                                                    await sequenceStepQueue.add('processSequenceStep', jobData, jobOptions);
                                                    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Primeiro job de sequência agendado para FollowUp ${newFollowUp.id} (Regra: ${firstRule.id}, Delay: ${firstDelayMs}ms).`);
                                                }
                                            } else {
                                                console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Nenhuma regra de follow-up encontrada para Workspace ${workspace.id}. Nenhum follow-up iniciado.`);
                                            }
                                        } catch (followUpError) {
                                            console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Erro ao iniciar sequência de follow-up para Conv ${conversation.id}:`, followUpError);
                                            // Não falhar a resposta para a Meta, apenas logar
                                        }
                                    } else {
                                        // Já existe um follow-up ativo, não fazer nada
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Follow-up ativo ${existingActiveFollowUp.id} já existe para cliente ${client.id}. Nenhuma nova sequência iniciada.`);
                                    }
                                    // ************************************************
                                    // <<< FIM: Lógica de Disparo do Follow-up >>>
                                    // ************************************************

                                } // Fim if message.from
                            } // Fim loop messages
                        } // Fim if change.field === 'messages'

                        // <<< INÍCIO: Processamento de Statuses >>>
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
                                        console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${targetMessage.id}: DB Update successful. Status=${dbNewStatus}.` + (dataToUpdate.providerMessageId ? ` WAMID=${dataToUpdate.providerMessageId}`: ''));
                                    } catch (dbError) {
                                        console.error(`[WH_STATUS_LOG DB_UPDATE] Error updating message ${targetMessage.id} in DB:`, dbError);
                                    }
    
                                    const payloadToPublish = {
                                        messageId: targetMessage.id,
                                        conversation_id: targetConversationId,
                                        newStatus: dbNewStatus,
                                        providerMessageId: status.id,
                                        errorMessage: dbNewStatus === 'FAILED' ? (status.errors?.[0]?.title || 'Failed') : undefined
                                    };
                                    console.log(`[WH_STATUS_LOG] Preparing 'message_status_updated' (${dbNewStatus}) for Msg ID ${targetMessage.id}`);
        
                                    const channelName = `private-workspace-${workspace.id}`;
                                    const eventPayloadPusher = { type: 'message_status_update', payload: payloadToPublish };

                                    try {
                                        await pusher.trigger(channelName, 'message_status_update', eventPayloadPusher);
                                        console.log(`[WH_STATUS_LOG] Pusher event 'message_status_update' triggered on ${channelName} for Msg ID ${targetMessage.id}`);
                                    } catch (pusherError: any) {
                                        console.error(`[WH_STATUS_LOG] Failed to trigger Pusher event for Msg ID ${targetMessage.id}:`, pusherError?.message || pusherError);
                                    }
                                } else {
                                    console.log(`[WH_STATUS_LOG] Received status '${status.status}' (maps to ${dbNewStatus}) for Msg ID ${targetMessage.id}, but current status is '${targetMessage.status}' (${existingStatusIndex} >= ${newStatusIndex}) or new status is not FAILED while current is. No update or Pusher event needed.`);
                                }
                            }
                        } // <<< FIM: Processamento de Statuses >>>

                    } // Fim loop changes
                } // Fim if entry.changes
            } // Fim loop entry
        } // Fim if payload.object
    } catch (parseError) {
        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Erro ao fazer parse do JSON ou processar payload:`, parseError);
        // Não falhar a resposta para a Meta aqui, pois a assinatura foi válida.
        // Responder 200 OK mesmo assim, mas logar o erro interno.
    }
    // --- FIM: Processamento do Payload ---

    // 5. Responder 200 OK para a Meta RAPIDAMENTE!
    return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
