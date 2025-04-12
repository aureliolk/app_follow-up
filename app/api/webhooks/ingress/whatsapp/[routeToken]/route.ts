// app/api/webhooks/ingress/whatsapp/[routeToken]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { redisConnection } from '@/lib/redis'; // Importar conexão Redis
import { addMessageProcessingJob } from '@/lib/queues/queueService'; // Importar função de enfileiramento
import { ConversationStatus, FollowUpStatus, Prisma } from '@prisma/client'; // Importar tipos necessários
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue'; // Importar a fila de sequência

// Interface para dados do job de sequência (pode estar em lib/types se usada em mais lugares)
interface SequenceJobData {
  followUpId: string;
  stepRuleId: string;
  workspaceId: string;
}

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

                                    // --- INÍCIO: Lógica para Iniciar Follow-up ---
                                    if (wasCreated) {
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Nova conversa (${conversation.id}) detectada. Verificando regras de follow-up para Workspace ${workspace.id}...`);
                                        try {
                                            // 1. Buscar regras de follow-up para este workspace
                                            const followUpRules = await prisma.workspaceAiFollowUpRule.findMany({
                                                where: { workspace_id: workspace.id },
                                                orderBy: { created_at: 'asc' }, // Ordenar pela data de criação (ou um campo 'order' se existir)
                                                select: { id: true, delay_milliseconds: true }
                                            });

                                            if (followUpRules.length > 0) {
                                                console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] ${followUpRules.length} regra(s) de follow-up encontradas para Workspace ${workspace.id}. Iniciando sequência...`);
                                                const firstRule = followUpRules[0];

                                                // 2. Criar o registro de FollowUp
                                                const newFollowUp = await prisma.followUp.create({
                                                    data: {
                                                        workspace_id: workspace.id,
                                                        client_id: client.id,
                                                        status: FollowUpStatus.ACTIVE, // Começa ativo
                                                        current_sequence_step_order: 0, // Indica que nenhum passo foi executado ainda
                                                        // next_sequence_message_at será definido após agendar o job
                                                    }
                                                });
                                                console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Registro FollowUp ${newFollowUp.id} criado para cliente ${client.id}.`);

                                                // 3. Calcular delay e agendar o primeiro job na fila sequenceStepQueue
                                                const firstDelay = Number(firstRule.delay_milliseconds); // Converter BigInt para Number

                                                if (isNaN(firstDelay) || firstDelay < 0) {
                                                    console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Delay inválido (${firstRule.delay_milliseconds}) para a primeira regra ${firstRule.id}. Follow-up não será agendado.`);
                                                     // Opcional: Marcar FollowUp como falhado ou logar
                                                     await prisma.followUp.update({
                                                         where: { id: newFollowUp.id },
                                                         data: { status: FollowUpStatus.FAILED }
                                                     });
                                                } else {
                                                    const jobData: SequenceJobData = {
                                                        followUpId: newFollowUp.id,
                                                        stepRuleId: firstRule.id,
                                                        workspaceId: workspace.id,
                                                    };
                                                    const jobOptions = {
                                                        delay: firstDelay,
                                                        jobId: `seq_${newFollowUp.id}_step_${firstRule.id}`, // ID único para idempotência
                                                        removeOnComplete: true, // Remove da fila se completar com sucesso
                                                        removeOnFail: 5000, // Mantém por 5000 jobs falhados (ou um número razoável)
                                                    };

                                                    try {
                                                        await sequenceStepQueue.add('processSequenceStep', jobData, jobOptions);
                                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Primeiro job de follow-up (Regra: ${firstRule.id}) agendado para FollowUp ${newFollowUp.id} com delay de ${firstDelay}ms.`);

                                                        // Atualizar o FollowUp com a data do próximo envio
                                                        await prisma.followUp.update({
                                                            where: { id: newFollowUp.id },
                                                            data: { next_sequence_message_at: new Date(Date.now() + firstDelay) }
                                                        });

                                                    } catch (scheduleError) {
                                                        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] ERRO CRÍTICO ao agendar primeiro job de follow-up para FollowUp ${newFollowUp.id}:`, scheduleError);
                                                         // Marcar o FollowUp como FAILED, pois o agendamento falhou
                                                         await prisma.followUp.update({
                                                            where: { id: newFollowUp.id },
                                                            data: { status: FollowUpStatus.FAILED }
                                                        });
                                                    }
                                                }
                                            } else {
                                                console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Nenhuma regra de follow-up encontrada para Workspace ${workspace.id}. Sequência não iniciada.`);
                                            }
                                        } catch (followUpError) {
                                            console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Erro ao tentar iniciar a sequência de follow-up para cliente ${client.id}:`, followUpError);
                                            // Logar o erro, mas não parar o processamento da mensagem principal
                                        }
                                    } else {
                                         console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Conversa existente (${conversation.id}) atualizada. Não iniciando nova sequência de follow-up.`);
                                    }
                                    // --- FIM: Lógica para Iniciar Follow-up ---

                                } // Fim if message.from
                            } // Fim loop messages
                        } // Fim if change.field === 'messages'

                        // <<< INÍCIO: Processamento de Statuses >>>
                        if (change.field === 'messages' && change.value?.statuses?.length > 0) {
                            console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Processando ${change.value.statuses.length} atualização(ões) de status.`);
                            for (const statusUpdate of change.value.statuses) {
                                const messageIdFromWhatsapp = statusUpdate.id; // ID da mensagem original (wamid)
                                const newStatus = statusUpdate.status.toUpperCase(); // sent, delivered, read -> SENT, DELIVERED, READ
                                const recipientId = statusUpdate.recipient_id; // Número do destinatário
                                const timestamp = parseInt(statusUpdate.timestamp, 10) * 1000;

                                // Validar status recebido para evitar processar tipos inesperados
                                const validStatuses = ['SENT', 'DELIVERED', 'READ', 'FAILED']; // Adicionar FAILED se relevante
                                if (!validStatuses.includes(newStatus)) {
                                     console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Status Update: Status desconhecido '${newStatus}' para WAMID ${messageIdFromWhatsapp}. Ignorando.`);
                                     continue;
                                }

                                console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Status Update: WAMID=${messageIdFromWhatsapp}, Status=${newStatus}, Recipient=${recipientId}`);

                                // 1. Encontrar a mensagem no DB pelo provider_message_id (wamid)
                                let messageInDb;
                                try {
                                    messageInDb = await prisma.message.findFirst({
                                        where: { providerMessageId: messageIdFromWhatsapp },
                                        select: { id: true, conversation_id: true, status: true } // Selecionar IDs e status atual
                                    });
                                } catch (dbError) {
                                     console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Status Update: Erro ao buscar mensagem com WAMID ${messageIdFromWhatsapp} no DB:`, dbError);
                                     continue; // Pular para o próximo status
                                }

                                if (!messageInDb) {
                                    console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Status Update: Mensagem com WAMID ${messageIdFromWhatsapp} não encontrada no DB. Ignorando.`);
                                    continue;
                                }

                                // 2. Opcional: Atualizar o status no DB (se necessário)
                                // Por enquanto, vamos focar em apenas publicar no Redis para a UI
                                // A lógica de não voltar status pode ser implementada na UI ou aqui se desejado.
                                // Exemplo: if (statusOrder[newStatus] > statusOrder[messageInDb.status]) { update... }

                                // 3. Publicar atualização no Redis (Canal da Conversa)
                                try {
                                    const conversationChannel = `chat-updates:${messageInDb.conversation_id}`;
                                    const statusPayload = {
                                        type: 'message_status_updated', // Tipo de evento para SSE
                                        payload: {
                                            messageId: messageInDb.id, // ID interno da mensagem
                                            newStatus: newStatus,      // Status recebido (SENT, DELIVERED, READ)
                                            providerMessageId: messageIdFromWhatsapp, // WAMID original
                                            timestamp: new Date(timestamp).toISOString(),
                                        }
                                    };
                                    // Publicar o objeto JSON stringificado
                                    await redisConnection.publish(conversationChannel, JSON.stringify(statusPayload));
                                    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Status Update (${newStatus}) para Msg ID ${messageInDb.id} publicado no canal Redis ${conversationChannel}`);
                                } catch (publishError) {
                                    console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Falha ao publicar status update para Msg ID ${messageInDb.id} no Redis:`, publishError);
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
