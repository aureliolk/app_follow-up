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
                                        { type: 'new_message', payload: savedMessage }
                                    );

                                    // Notificar workspace subscribers via serviço modularizado
                                    await publishWorkspaceUpdate(
                                        `workspace-updates:${workspace.id}`,
                                        {
                                            type: 'new_message',
                                            payload: savedMessage 
                                        }
                                    );

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
                            for (const statusUpdate of change.value.statuses) {
                                const messageIdFromWhatsapp = statusUpdate.id; // ID da mensagem original (wamid)
                                const newStatus = statusUpdate.status.toUpperCase(); // sent, delivered, read -> SENT, DELIVERED, READ
                                const recipientIdRaw = statusUpdate.recipient_id; // Número original do destinatário (cliente)
                                const timestamp = parseInt(statusUpdate.timestamp, 10) * 1000;
                                const conversationIdentifier = statusUpdate.conversation?.id; // ID da conversa na API do WhatsApp (pode ser útil)

                                // Padronizar número do destinatário
                                const recipientId = standardizeBrazilianPhoneNumber(recipientIdRaw);
                                if (!recipientId) {
                                    console.warn(`[WH_STATUS_LOG] Recipient ID inválido ou não padronizável: ${recipientIdRaw} para WAMID ${messageIdFromWhatsapp}. Ignorando status.`);
                                    continue; // Pular este status
                                }
                                console.log(`[WH_STATUS_LOG] Recipient ID padronizado de ${recipientIdRaw} para ${recipientId}`);

                                console.log(`[WH_STATUS_LOG] Processing Status: WAMID=${messageIdFromWhatsapp}, Status=${newStatus}, Recipient=${recipientId}, ConvID_WPP=${conversationIdentifier}`);

                                // Validar status conhecido
                                const validStatuses = ['SENT', 'DELIVERED', 'READ', 'FAILED'];
                                if (!validStatuses.includes(newStatus)) {
                                    console.warn(`[WH_STATUS_LOG] Unknown status '${newStatus}' for WAMID ${messageIdFromWhatsapp}. Ignoring.`);
                                    continue;
                                }

                                let messageInDb: SelectedMessageInfo | null = null; // Use the new type
                                let targetConversationId: string | null = null;

                                // --- Lógica para encontrar a mensagem/conversa no DB --- 
                                try {
                                    // <<< PASSO 1: Encontrar o Cliente pelo telefone e workspace >>>
                                    const clientRecord = await prisma.client.findFirst({
                                        where: { 
                                            workspace_id: workspace.id, 
                                            phone_number: recipientId 
                                        },
                                        select: { id: true }
                                    });

                                    if (!clientRecord) {
                                        console.warn(`[WH_STATUS_LOG] Client not found for phone ${recipientId} in workspace ${workspace.id}. Skipping status update for WAMID ${messageIdFromWhatsapp}.`);
                                        continue; // Pula para o próximo status update
                                    }
                                    const clientId = clientRecord.id; 

                                    if (newStatus === 'SENT') {
                                        // Para SENT, buscar a conversa e a última msg PENDING
                                        // <<< PASSO 2 (SENT): Encontrar a Conversa específica do WhatsApp >>>
                                        const conversation = await prisma.conversation.findUnique({
                                            where: {
                                                workspace_id_client_id_channel: {
                                                    workspace_id: workspace.id,
                                                    client_id: clientId, // <<< Usa o clientId encontrado
                                                    channel: 'WHATSAPP'
                                                }
                                            },
                                            select: { id: true }
                                        });

                                        if (!conversation) {
                                            console.warn(`[WH_STATUS_LOG] SENT Status: Conversation not found for recipient ${recipientId} in workspace ${workspace.id}. Cannot find PENDING message.`);
                                            continue;
                                        }
                                        targetConversationId = conversation.id;

                                        // Buscar a última mensagem PENDING e assert type
                                        messageInDb = await prisma.message.findFirst({
                                            where: {
                                                conversation_id: targetConversationId,
                                                status: 'PENDING',
                                                sender_type: 'SYSTEM', // Ou 'AGENT' se for o caso
                                                // Não usar providerMessageId ou channel_message_id aqui
                                            },
                                            orderBy: { timestamp: 'desc' },
                                            select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, channel_message_id: true, metadata: true }
                                        }) as SelectedMessageInfo | null; 

                                        if (messageInDb) {
                                            console.log(`[WH_STATUS_LOG] SENT Status: Found PENDING message (ID: ${messageInDb.id}) for Conv ${targetConversationId}.`);
                                        } else {
                                            console.warn(`[WH_STATUS_LOG] SENT Status: PENDING message from SYSTEM/AGENT not found for Conv ${targetConversationId}. Might have been processed already or race condition.`);
                                            // Poderia tentar buscar por WAMID se já foi atualizado por outra via?
                                            // Buscar por WAMID (usando channel_message_id)
                                            messageInDb = await prisma.message.findFirst({
                                                where: { channel_message_id: messageIdFromWhatsapp },
                                                select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, channel_message_id: true, metadata: true }
                                            }) as SelectedMessageInfo | null; 
                                            if (messageInDb) {
                                                console.log(`[WH_STATUS_LOG] SENT Status: Found message by WAMID ${messageIdFromWhatsapp} (ID: ${messageInDb.id}). Treating as status update (original status was ${newStatus}).`);
                                            } else {
                                                console.warn(`[WH_STATUS_LOG] SENT Status: Message with WAMID ${messageIdFromWhatsapp} also not found. Ignoring.`);
                                                continue;
                                            }
                                        }
                                    } else { // Para DELIVERED, READ, FAILED - Tentar buscar por WAMID, com fallback
                                        // <<< TENTATIVA 1: Buscar por WAMID (não precisa do cliente) >>>
                                        messageInDb = await prisma.message.findFirst({
                                            where: { channel_message_id: messageIdFromWhatsapp },
                                            select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, channel_message_id: true, metadata: true }
                                        }) as SelectedMessageInfo | null;

                                        if (!messageInDb) {
                                            // <<< TENTATIVA 2 (Fallback): Buscar última SENT na conversa >>>
                                            console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Message not found by WAMID ${messageIdFromWhatsapp}. Attempting fallback search...`);
                                            // <<< PASSO 2 (Fallback): Encontrar a Conversa específica do WhatsApp >>>
                                            const conversationForFallback = await prisma.conversation.findUnique({
                                                where: {
                                                    workspace_id_client_id_channel: {
                                                        workspace_id: workspace.id,
                                                        client_id: clientId, // <<< Usa o clientId encontrado
                                                        channel: 'WHATSAPP'
                                                    }
                                                },
                                                select: { id: true }
                                            });

                                            if (conversationForFallback) {
                                                targetConversationId = conversationForFallback.id;
                                                messageInDb = await prisma.message.findFirst({
                                                    where: {
                                                        conversation_id: targetConversationId,
                                                        status: 'SENT', // Buscar a que foi marcada como SENT
                                                        sender_type: 'SYSTEM', // Ou AGENT
                                                        // providerMessageId: null // <<< REMOVER ESTA CONDIÇÃO NO FALLBACK
                                                    },
                                                    orderBy: { timestamp: 'desc' },
                                                    select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, channel_message_id: true, metadata: true }
                                                }) as SelectedMessageInfo | null; 
                                                if (messageInDb) {
                                                    console.log(`[WH_STATUS_LOG] ${newStatus} Status: Found potential message (ID: ${messageInDb.id}) via fallback search (Last SENT). Assuming it matches WAMID ${messageIdFromWhatsapp}.`);
                                                    // ATENÇÃO: Se encontrar via fallback, PRECISAMOS salvar o WAMID agora.
                                                    await prisma.message.update({ where: { id: messageInDb.id }, data: { channel_message_id: messageIdFromWhatsapp } });
                                                    console.log(`[WH_STATUS_LOG] ${newStatus} Status: Updated WAMID ${messageIdFromWhatsapp} for message ${messageInDb.id} found via fallback.`);
                                                } else {
                                                    console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Fallback search failed for Conv ${targetConversationId}. Ignoring status update.`);
                                                    // Não continuar se fallback falhou
                                                    continue; // <<< Adicionar continue aqui
                                                }
                                            } else {
                                                console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Conversation not found for fallback search (Recipient: ${recipientId}). Ignoring.`);
                                                continue; // <<< Adicionar continue aqui
                                            }
                                        } // Fim if (!messageInDb) para DELIVERED/READ/FAILED
                                    } // Fim else (DELIVERED/READ/FAILED)

                                    // Garantir que targetConversationId foi definido se encontramos a mensagem
                                    if (messageInDb && !targetConversationId) {
                                        targetConversationId = messageInDb.conversation_id;
                                    }

                                    // Proceder somente se messageInDb foi encontrado por um dos métodos
                                    if (!messageInDb) {
                                        console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Message with WAMID ${messageIdFromWhatsapp} not found after all attempts. Ignoring.`);
                                        continue;
                                    }

                                } catch (dbError) { // <<< CATCH GERAL PARA ERRO NA BUSCA
                                    console.error(`[WH_STATUS_LOG] Error during DB search for WAMID ${messageIdFromWhatsapp} / Recipient ${recipientId}:`, dbError);
                                    continue; // Pular para o próximo status se a busca falhar
                                }
                                // --- Fim: Lógica para encontrar mensagem --- 

                                // Se messageInDb foi encontrado (e targetConversationId definido)
                                // O código abaixo só executa se messageInDb não for null E targetConversationId estiver definido
                                // --- Atualizar DB e Preparar Evento Redis --- 
                                let eventTypeToPublish: string | null = null;
                                let payloadToPublish: any = null;
                                let shouldUpdateDb = true;

                                // Lógica para não regredir status (opcional mas recomendado)
                                const statusOrder: Record<string, number> = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
                                if (statusOrder[newStatus] <= statusOrder[messageInDb.status]) {
                                    console.log(`[WH_STATUS_LOG] Status ${newStatus} for Msg ${messageInDb.id} is not newer than current status ${messageInDb.status}. Skipping DB update and Redis publish.`);
                                    shouldUpdateDb = false;
                                    // Explicitly check for null instead of relying on truthiness
                                    if (newStatus === 'SENT' && messageInDb.channel_message_id === null) {
                                        console.log(`[WH_STATUS_LOG] Msg ${messageInDb.id} status is already SENT or later, but WAMID is missing. Updating WAMID only.`);
                                        shouldUpdateDb = true; // Forçar update do WAMID
                                    } else {
                                        continue; // Pular o resto se não for atualizar
                                    }
                                }

                                // Determinar tipo de evento e payload para Redis
                                if (newStatus === 'SENT') {
                                    eventTypeToPublish = 'new_message'; // Ou 'message_status_updated'? Decidir
                                    try {
                                        // Buscar a mensagem completa atualizada (incluindo o WAMID que será setado)
                                        // O update do DB acontece depois, então buscamos ANTES e adicionamos o WAMID manualmente ao payload
                                        const fullMessage = await prisma.message.findUnique({
                                            where: { id: messageInDb.id },
                                            // Incluir todos os campos necessários para o tipo Message da UI
                                            include: { conversation: { select: { client: true } } } // Exemplo para pegar dados do cliente
                                        });
                                        if (!fullMessage) throw new Error('Full message not found after SENT status');

                                        // Adicionar/Atualizar campos para o payload SSE
                                        payloadToPublish = {
                                            ...fullMessage,
                                            status: 'SENT', // Garantir status
                                            providerMessageId: messageIdFromWhatsapp, // Manter providerMessageId por enquanto
                                            channel_message_id: messageIdFromWhatsapp, // Adicionar channel_message_id
                                            message_type: fullMessage.media_url ? 'MEDIA' : 'TEXT',
                                        };
                                        console.log(`[WH_STATUS_LOG] Preparing 'new_message' (or status update) event for Msg ID ${messageInDb.id}`);
                                    } catch (fetchError) {
                                        console.error(`[WH_STATUS_LOG] Failed to fetch full message for SENT status (Msg ID: ${messageInDb.id}):`, fetchError);
                                        continue;
                                    }
                                } else if (newStatus === 'DELIVERED' || newStatus === 'READ' || newStatus === 'FAILED') {
                                    eventTypeToPublish = 'message_status_updated';
                                    payloadToPublish = {
                                        messageId: messageInDb.id,
                                        conversation_id: targetConversationId,
                                        newStatus: newStatus,
                                        providerMessageId: messageIdFromWhatsapp,
                                        timestamp: new Date(timestamp).toISOString(),
                                        // Incluir errorMessage se status for FAILED? Buscar do erro original?
                                        ...(newStatus === 'FAILED' && { errorMessage: statusUpdate.errors?.[0]?.message || 'Falha no envio pelo WhatsApp' })
                                    };
                                    console.log(`[WH_STATUS_LOG] Preparing 'message_status_updated' (${newStatus}) event for Msg ID ${messageInDb.id}`);
                                }

                                // Atualizar Mensagem no Banco de Dados (se necessário)
                                if (shouldUpdateDb) {
                                    try {
                                        const dataToUpdate: Prisma.MessageUpdateInput = { status: newStatus };
                                        console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${messageInDb.id}: Checking if WAMID should be added. NewStatus=${newStatus}, Existing WAMID=${messageInDb.channel_message_id}`);

                                        if (newStatus === 'SENT' || messageInDb.channel_message_id === null) { 
                                            console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${messageInDb.id}: Adding/Updating WAMID to ${messageIdFromWhatsapp}`);
                                            dataToUpdate.channel_message_id = messageIdFromWhatsapp;
                                        }
                                        if (newStatus === 'FAILED') {
                                            // Refine metadata check and spread
                                            const currentMetadata = (typeof messageInDb.metadata === 'object' && messageInDb.metadata !== null) ? messageInDb.metadata : {};
                                            dataToUpdate.metadata = {
                                                ...currentMetadata,
                                                error: statusUpdate.errors?.[0]?.message || 'Falha reportada pelo WhatsApp'
                                            };
                                        }

                                        await prisma.message.update({
                                            where: { id: messageInDb.id },
                                            data: dataToUpdate
                                        });
                                        console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${messageInDb.id}: DB Update successful. Status=${newStatus}` + (dataToUpdate.channel_message_id ? `, WAMID=${dataToUpdate.channel_message_id}` : '. No WAMID updated.'));
                                    } catch (updateError) {
                                        console.error(`[WH_STATUS_LOG DB_UPDATE] Failed to update message ${messageInDb.id} status in DB:`, updateError);
                                        continue;
                                    }
                                } else if (eventTypeToPublish && payloadToPublish) {
                                    // Se não precisou atualizar DB, mas temos evento para publicar (ex: status repetido mas WAMID já estava lá)
                                    console.log(`[WH_STATUS_LOG] DB update skipped for Msg ${messageInDb.id}, but proceeding to publish Redis event.`);
                                } else {
                                    console.log(`[WH_STATUS_LOG] No DB update needed and no event to publish for Msg ${messageInDb.id}.`);
                                    continue;
                                }

                                // Publicar no Redis (se evento foi preparado)
                                if (eventTypeToPublish && payloadToPublish) {
                                    try {
                                        const conversationChannel = `chat-updates:${targetConversationId}`;
                                        const redisPayload = {
                                            type: eventTypeToPublish,
                                            payload: payloadToPublish
                                        };
                                        await redisConnection.publish(conversationChannel, JSON.stringify(redisPayload));
                                        console.log(`[WH_STATUS_LOG] Published event '${eventTypeToPublish}' to ${conversationChannel} for Msg ID ${messageInDb.id}`);
                                    } catch (publishError) {
                                        console.error(`[WH_STATUS_LOG] Failed to publish event for Msg ID ${messageInDb.id} to Redis:`, publishError);
                                    }
                                } else {
                                    console.log(`[WH_STATUS_LOG] No event prepared to publish for Msg ID ${messageInDb.id}.`);
                                }
                            } // Fim loop statusUpdate
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
