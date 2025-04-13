// app/api/webhooks/ingress/whatsapp/[routeToken]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { redisConnection } from '@/lib/redis'; // Importar conexão Redis
import { addMessageProcessingJob } from '@/lib/queues/queueService'; // Importar função de enfileiramento
import { ConversationStatus, Prisma, Message as PrismaMessage } from '@prisma/client'; // Importar tipos necessários
// import { FollowUpStatus } from '@prisma/client'; // <<< REMOVER OU COMENTAR: Não será mais usado aqui
// import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue'; // <<< REMOVER OU COMENTAR: Não será mais usado aqui

// Define a type for the selected message fields
type SelectedMessageInfo = {
    id: string;
    conversation_id: string;
    status: string;
    sender_type: string; // Assuming MessageSenderType is string-based enum
    providerMessageId: string | null;
    metadata: Prisma.JsonValue; // Use Prisma.JsonValue for metadata type
};

// Interface para dados do job de sequência (pode estar em lib/types se usada em mais lugares)
// interface SequenceJobData {
//  followUpId: string;
//  stepRuleId: string;
//  workspaceId: string;
// }

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

    // 1. Buscar Workspace
    const workspace = await getWorkspaceByRouteToken(routeToken);
    
    // <<< ADICIONADO: Obter App Secret da variável de ambiente >>>
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] ERRO CRÍTICO: Variável de ambiente WHATSAPP_APP_SECRET não está definida.`);
        // Retornar 500 pois é um erro de configuração do servidor
        return new NextResponse('Internal Server Error: App Secret configuration missing.', { status: 500 });
    }

    // 2. Validar Assinatura (usando appSecret do env)
    if (!signatureHeader) {
        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Assinatura ausente (X-Hub-Signature-256). Rejeitando.`);
        return new NextResponse('Missing signature header', { status: 400 });
    }
    const expectedSignature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const receivedSignatureHash = signatureHeader.split('=')[1];
    
    // <<< REATIVADO: Comparação da assinatura >>>
    if (expectedSignature !== receivedSignatureHash) {
        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Assinatura inválida. Expected: ${expectedSignature}, Received Hash: ${receivedSignatureHash}. Rejeitando.`);
        return new NextResponse('Invalid signature', { status: 403 });
    }
    
    // <<< LOG AJUSTADO: Não menciona mais o workspace ID aqui, pois o segredo é global >>>
    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Assinatura validada com sucesso.`);

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
                                    const receivedTimestamp = parseInt(message.timestamp, 10) * 1000; // Timestamp da mensagem (em segundos, converter para ms)
                                    const senderPhoneNumber = message.from; // Número de quem enviou
                                    const messageIdFromWhatsapp = message.id; // ID da mensagem na API do WhatsApp
                                    const workspacePhoneNumberId = metadata?.phone_number_id; // <<< USAR METADATA DEFINIDO ACIMA

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

                                    // --- Upsert Client ---
                                    const client = await prisma.client.upsert({
                                        where: {
                                            workspace_id_phone_number_channel: {
                                                workspace_id: workspace.id,
                                                phone_number: senderPhoneNumber,
                                                channel: 'WHATSAPP', // Canal específico
                                            }
                                        },
                                        update: { updated_at: new Date() }, // Atualiza timestamp se existir
                                        create: {
                                            workspace_id: workspace.id,
                                            phone_number: senderPhoneNumber,
                                            channel: 'WHATSAPP',
                                            name: change.value.contacts?.find((c: any) => c.wa_id === senderPhoneNumber)?.profile?.name || senderPhoneNumber, // Tenta pegar nome do perfil, senão usa telefone
                                            external_id: senderPhoneNumber, // Usa telefone como ID externo por falta de outro
                                        },
                                    });
                                    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Cliente ${client.id} (Telefone: ${senderPhoneNumber}) Upserted.`);

                                    // --- Tentar Criar ou Atualizar Conversa ---
                                    let conversation: Prisma.ConversationGetPayload<{}>; // Definir tipo explícito
                                    let wasCreated = false;
                                    try {
                                        // Tenta criar primeiro
                                        conversation = await prisma.conversation.create({
                                            data: {
                                                workspace_id: workspace.id,
                                                client_id: client.id,
                                                channel: 'WHATSAPP',
                                                status: ConversationStatus.ACTIVE,
                                                is_ai_active: true, // Começa com IA ativa
                                                last_message_at: new Date(receivedTimestamp),
                                            }
                                        });
                                        wasCreated = true;
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Nova Conversa ${conversation.id} CRIADA para Cliente ${client.id}. (wasCreated = true)`);
                                    } catch (e) {
                                        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                                            // Violação de constraint única, a conversa já existe. Atualizar.
                                            console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Conversa existente para cliente ${client.id} encontrada. Atualizando...`);
                                            conversation = await prisma.conversation.update({
                                                where: {
                                                    workspace_id_client_id_channel: {
                                                        workspace_id: workspace.id,
                                                        client_id: client.id,
                                                        channel: 'WHATSAPP',
                                                    }
                                                },
                                                data: {
                                                    last_message_at: new Date(receivedTimestamp),
                                                    status: ConversationStatus.ACTIVE, // Reabre se estava fechada
                                                    updated_at: new Date(),
                                                }
                                            });
                                            console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Conversa ${conversation.id} ATUALIZADA.`);
                                        } else {
                                            // Outro erro durante a criação/atualização da conversa
                                            console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Erro inesperado ao criar/atualizar conversa para cliente ${client.id}:`, e);
                                            // Considerar se deve parar aqui ou continuar sem conversa? Por segurança, vamos parar.
                                            // Não retornar 500 para a Meta, apenas logar e pular esta mensagem.
                                            continue; // Pula para a próxima mensagem no loop
                                        }
                                    }
                                    // --- Fim Criar/Atualizar Conversa ---

                                    // --- Save Message ---
                                    const newMessage = await prisma.message.create({
                                        data: {
                                            conversation_id: conversation.id,
                                            sender_type: 'CLIENT',
                                            content: messageContent, // Placeholder para mídias
                                            timestamp: new Date(receivedTimestamp),
                                            channel_message_id: messageIdFromWhatsapp,
                                            metadata: { // Armazenar detalhes da mídia
                                                whatsappMessage: message,
                                                // Somente adicionar campos se existirem
                                                ...(mediaId && { mediaId }),
                                                ...(mimeType && { mimeType }),
                                                messageType: messageType, // Sempre guardar o tipo original
                                            }
                                        },
                                        select: { id: true, conversation_id: true, content: true, timestamp: true, sender_type: true }
                                    });
                                    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Mensagem ${newMessage.id} (WPP ID: ${messageIdFromWhatsapp}) salva para Conv ${conversation.id}.`);

                                    // --- Publish to Redis (Canal da Conversa - CORRIGIDO) ---
                                    try {
                                        const conversationChannel = `chat-updates:${conversation.id}`;
                                        // <<< CORREÇÃO AQUI >>> Envolver no formato { type, payload }
                                        const conversationPayload = { 
                                            type: 'new_message', 
                                            payload: newMessage 
                                        };
                                        const conversationPayloadString = JSON.stringify(conversationPayload); 
                                        await redisConnection.publish(conversationChannel, conversationPayloadString);
                                        // Atualizar log para refletir o novo formato
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Evento {type: 'new_message', payload: Msg ${newMessage.id}} publicado no canal Redis da CONVERSA: ${conversationChannel}`); 
                                    } catch (publishError) {
                                        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Falha ao publicar evento new_message para ${newMessage.id} no Redis (Canal Conversa):`, publishError);
                                    }

                                    // --- Publish to Redis (Canal do Workspace) ---
                                    try {
                                        const workspaceChannel = `workspace-updates:${workspace.id}`;
                                        const workspacePayload = {
                                            type: 'new_message',
                                            conversationId: conversation.id,
                                            channel: conversation.channel,
                                            status: conversation.status,
                                            is_ai_active: conversation.is_ai_active,
                                            lastMessageTimestamp: newMessage.timestamp.toISOString(),
                                            last_message_at: newMessage.timestamp.toISOString(), // Redundante mas mantém consistência
                                            clientId: client.id,
                                            clientName: client.name,
                                            clientPhone: client.phone_number,
                                            lastMessageContent: newMessage.content,
                                            lastMessageSenderType: newMessage.sender_type,
                                            metadata: conversation.metadata, // Incluir metadata da conversa
                                        };
                                        await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Notificação ENRIQUECIDA publicada no canal Redis do WORKSPACE: ${workspaceChannel}`);
                                    } catch (publishError) {
                                        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Falha ao publicar notificação no Redis (Canal Workspace):`, publishError);
                                    }

                                    // --- Enqueue Job para Processamento da Mensagem (IA, etc.) ---
                                    // É importante que este job NÃO dependa do início do follow-up
                                    if (requiresProcessing) {
                                        try {
                                            const jobData = {
                                                conversationId: conversation.id,
                                                clientId: client.id,
                                                newMessageId: newMessage.id,
                                                workspaceId: workspace.id,
                                                receivedTimestamp: receivedTimestamp,
                                            };
                                            await addMessageProcessingJob(jobData);
                                            console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Job adicionado à fila message-processing para msg ${newMessage.id}.`);
                                        } catch (queueError) {
                                            console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Falha ao adicionar job à fila message-processing:`, queueError);
                                             // Logar o erro, mas continuar, pois a mensagem foi salva
                                        }
                                    } else {
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Mensagem ${newMessage.id} (Tipo: ${messageType}) não requer processamento pela IA/Worker. Job não enfileirado.`);
                                    }
                       

                                } // Fim if message.from
                            } // Fim loop messages
                        } // Fim if change.field === 'messages'

                        // <<< INÍCIO: Processamento de Statuses >>>
                        if (change.field === 'messages' && change.value?.statuses?.length > 0) {
                            console.log(`[WH_STATUS_LOG] Processing ${change.value.statuses.length} status update(s).`);
                            for (const statusUpdate of change.value.statuses) {
                                const messageIdFromWhatsapp = statusUpdate.id; // ID da mensagem original (wamid)
                                const newStatus = statusUpdate.status.toUpperCase(); // sent, delivered, read -> SENT, DELIVERED, READ
                                const recipientId = statusUpdate.recipient_id; // Número do destinatário (cliente)
                                const timestamp = parseInt(statusUpdate.timestamp, 10) * 1000;
                                const conversationIdentifier = statusUpdate.conversation?.id; // ID da conversa na API do WhatsApp (pode ser útil)

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
                                    if (newStatus === 'SENT') {
                                        // Para SENT, precisamos encontrar a mensagem PENDING enviada pelo AGENT/SYSTEM.
                                        // A melhor forma é buscar a última mensagem PENDING do AGENT/SYSTEM para este cliente/conversa.
                                        // Primeiro, encontrar a conversa pelo recipientId (número do cliente) e workspaceId.
                                        const conversation = await prisma.conversation.findUnique({
                                             where: {
                                                 workspace_id_client_id_channel: { // <<< CORREÇÃO: Usar a constraint por client_id
                                                      workspace_id: workspace.id,
                                                      client_id: await prisma.client.findUniqueOrThrow({ where: { workspace_id_phone_number_channel: { workspace_id: workspace.id, phone_number: recipientId, channel: 'WHATSAPP'}}, select:{id:true}}).then(c=>c.id), // <<< Buscar client_id pelo phone_number
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
                                                 providerMessageId: null 
                                             },
                                             orderBy: { timestamp: 'desc' }, 
                                             select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, metadata: true } 
                                         }) as SelectedMessageInfo | null; // <<< TYPE ASSERTION

                                        if (messageInDb) {
                                             console.log(`[WH_STATUS_LOG] SENT Status: Found PENDING message (ID: ${messageInDb.id}) for Conv ${targetConversationId}.`);
                                        } else {
                                            console.warn(`[WH_STATUS_LOG] SENT Status: PENDING message from SYSTEM/AGENT not found for Conv ${targetConversationId}. Might have been processed already or race condition.`);
                                            // Poderia tentar buscar por WAMID se já foi atualizado por outra via?
                                            // Buscar por WAMID e assert type
                                            messageInDb = await prisma.message.findFirst({
                                                where: { providerMessageId: messageIdFromWhatsapp }, 
                                                select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, metadata: true } 
                                            }) as SelectedMessageInfo | null; // <<< TYPE ASSERTION
                                            if (messageInDb) {
                                                console.log(`[WH_STATUS_LOG] SENT Status: Found message by WAMID ${messageIdFromWhatsapp} (ID: ${messageInDb.id}). Treating as status update (original status was ${newStatus}).`);
                                            } else {
                                                console.warn(`[WH_STATUS_LOG] SENT Status: Message with WAMID ${messageIdFromWhatsapp} also not found. Ignoring.`);
                                                continue;
                                            }
                                        }

                                    } else { // Para DELIVERED, READ, FAILED - Tentar buscar por WAMID, com fallback
                                        try { // <<< Adicionar try/catch em volta da busca
                                            // <<< TENTATIVA 1: Buscar por WAMID >>>
                                            messageInDb = await prisma.message.findFirst({
                                                where: { providerMessageId: messageIdFromWhatsapp },
                                                select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, metadata: true } 
                                            }) as SelectedMessageInfo | null; 

                                            if (!messageInDb) {
                                                 // <<< TENTATIVA 2 (Fallback): Buscar última SENT do SYSTEM/AGENT na conversa >>>
                                                 console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Message not found by WAMID ${messageIdFromWhatsapp}. Attempting fallback search...`);
                                                 // Precisamos do targetConversationId, que pode não ter sido definido se entramos direto neste else.
                                                 // Obter conversationId mapeando recipientId novamente (pode otimizar guardando o resultado anterior)
                                                  const conversationForFallback = await prisma.conversation.findUnique({
                                                      where: {
                                                          workspace_id_client_id_channel: { 
                                                               workspace_id: workspace.id,
                                                               client_id: await prisma.client.findUniqueOrThrow({ where: { workspace_id_phone_number_channel: { workspace_id: workspace.id, phone_number: recipientId, channel: 'WHATSAPP'}}, select:{id:true}}).then(c=>c.id),
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
                                                              providerMessageId: null // Opcional: talvez o WAMID ainda não tenha sido salvo?
                                                          },
                                                          orderBy: { timestamp: 'desc' },
                                                           select: { id: true, conversation_id: true, status: true, sender_type: true, providerMessageId: true, metadata: true }
                                                      }) as SelectedMessageInfo | null; // <<< TYPE ASSERTION
                                                       if (messageInDb) {
                                                            console.log(`[WH_STATUS_LOG] ${newStatus} Status: Found potential message (ID: ${messageInDb.id}) via fallback search (Last SENT). Assuming it matches WAMID ${messageIdFromWhatsapp}.`);
                                                            // ATENÇÃO: Se encontrar via fallback, PRECISAMOS salvar o WAMID agora, pois ele claramente não estava lá antes.
                                                            await prisma.message.update({ where: { id: messageInDb.id }, data: { providerMessageId: messageIdFromWhatsapp } });
                                                            console.log(`[WH_STATUS_LOG] ${newStatus} Status: Updated WAMID ${messageIdFromWhatsapp} for message ${messageInDb.id} found via fallback.`);
                                                       } else {
                                                             console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Fallback search failed for Conv ${targetConversationId}. Ignoring status update.`);
                                                       }
                                                  } else {
                                                       console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Conversation not found for fallback search (Recipient: ${recipientId}). Ignoring.`);
                                                  }
                                            }

                                            // Garantir que targetConversationId foi definido se encontramos a mensagem
                                            if (messageInDb && !targetConversationId) { 
                                                targetConversationId = messageInDb.conversation_id; 
                                            }

                                            // Proceder somente se messageInDb foi encontrado por um dos métodos
                                            if (!messageInDb) {
                                                 console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Message with WAMID ${messageIdFromWhatsapp} not found. Ignoring.`);
                                                 continue;
                                              }
                                        } catch (fallbackDbError) { // <<< Catch para a busca DELIVERED/READ/FAILED
                                            console.error(`[WH_STATUS_LOG] Error during DELIVERED/READ/FAILED message search (WAMID: ${messageIdFromWhatsapp}):`, fallbackDbError);
                                            continue; // Pular para o próximo status se a busca falhar
                                        }
                                    }

                                    // Garantir que targetConversationId foi definido se encontramos a mensagem
                                    if (messageInDb && !targetConversationId) { 
                                        targetConversationId = messageInDb.conversation_id; 
                                    }

                                    // Proceder somente se messageInDb foi encontrado por um dos métodos
                                    if (!messageInDb) {
                                         console.warn(`[WH_STATUS_LOG] ${newStatus} Status: Message with WAMID ${messageIdFromWhatsapp} not found. Ignoring.`);
                                         continue;
                                     }
                                } catch (dbError) { // <<< Catch original da busca SENT
                                     console.error(`[WH_STATUS_LOG] Error finding message in DB for WAMID ${messageIdFromWhatsapp} / Recipient ${recipientId}:`, dbError);
                                     continue; // Pular para o próximo status
                                }
                                // --- Fim: Lógica para encontrar mensagem --- 

                                // Se messageInDb foi encontrado (e targetConversationId definido)
                                if (messageInDb && targetConversationId) {
                                     // --- Atualizar DB e Preparar Evento Redis --- 
                                     let eventTypeToPublish: string | null = null;
                                     let payloadToPublish: any = null;
                                     let shouldUpdateDb = true;

                                     // Lógica para não regredir status (opcional mas recomendado)
                                      const statusOrder: Record<string, number> = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
                                      if (statusOrder[newStatus] <= statusOrder[messageInDb.status]) {
                                           console.log(`[WH_STATUS_LOG] Status ${newStatus} for Msg ${messageInDb.id} is not newer than current status ${messageInDb.status}. Skipping DB update and Redis publish.`);
                                           shouldUpdateDb = false;
                                           // Continuar mesmo assim para garantir consistência se o status for SENT e faltar WAMID?
                                           // Explicitly check for null instead of relying on truthiness
                                           if (newStatus === 'SENT' && messageInDb.providerMessageId === null /* <<< ACESSAR AQUI AGORA É SEGURO */) { 
                                                console.log(`[WH_STATUS_LOG] Msg ${messageInDb.id} status is already SENT or later, but WAMID is missing. Updating WAMID only.`);
                                                shouldUpdateDb = true; // Forçar update do WAMID
                                           } else {
                                               continue; // Pular o resto se não for atualizar
                                           }
                                      }

                                     // Determinar tipo de evento e payload para Redis
                                     if (newStatus === 'SENT') {
                                         eventTypeToPublish = 'new_message';
                                         try {
                                             // Buscar a mensagem completa atualizada (incluindo o WAMID que será setado)
                                             // O update do DB acontece depois, então buscamos ANTES e adicionamos o WAMID manualmente ao payload
                                             const fullMessage = await prisma.message.findUnique({ 
                                                  where: { id: messageInDb.id },
                                                  // Incluir todos os campos necessários para o tipo Message da UI
                                                  include: { conversation: { select: { client: true }} } // Exemplo para pegar dados do cliente
                                              }); 
                                             if (!fullMessage) throw new Error('Full message not found after SENT status');
                                             
                                             // Adicionar/Atualizar campos para o payload SSE
                                             payloadToPublish = {
                                                 ...fullMessage,
                                                 status: 'SENT', // Garantir status
                                                 providerMessageId: messageIdFromWhatsapp, // Adicionar WAMID
                                                 // Mapear/adicionar outros campos esperados pelo tipo Message da UI, se necessário
                                                 message_type: fullMessage.media_url ? 'MEDIA' : 'TEXT', // Inferir message_type? Ou buscar de metadata?
                                             };
                                              console.log(`[WH_STATUS_LOG] Preparing 'new_message' event for Msg ID ${messageInDb.id}`);
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
                                               // <<< LOG Antes de decidir se adiciona WAMID >>>
                                               console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${messageInDb.id}: Checking if WAMID should be added. NewStatus=${newStatus}, Existing WAMID=${messageInDb.providerMessageId}`);
                                               
                                               if (newStatus === 'SENT' || messageInDb.providerMessageId === null) { // Adicionar WAMID se for SENT ou se não existir ainda 
                                                   console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${messageInDb.id}: Adding/Updating WAMID to ${messageIdFromWhatsapp}`);
                                                   dataToUpdate.providerMessageId = messageIdFromWhatsapp;
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
                                               console.log(`[WH_STATUS_LOG DB_UPDATE] Msg ${messageInDb.id}: DB Update successful. Status=${newStatus}` + (dataToUpdate.providerMessageId ? `, WAMID=${dataToUpdate.providerMessageId}` : '. No WAMID updated.'));
                                           } catch (updateError) {
                                               console.error(`[WH_STATUS_LOG DB_UPDATE] Failed to update message ${messageInDb.id} status in DB:`, updateError);
                                               // Continuar para publicar no Redis mesmo se update falhar?
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
                                } else {
                                     // Mensagem não encontrada no DB, já logado anteriormente
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
