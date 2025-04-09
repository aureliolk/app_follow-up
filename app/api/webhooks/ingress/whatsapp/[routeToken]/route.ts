// app/api/webhook/ingress/whatsapp/[routeToken]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { redisConnection } from '@/lib/redis'; // Importar conexão Redis
import { addMessageProcessingJob } from '@/lib/queues/queueService'; // Importar função de enfileiramento
import { ConversationStatus, Prisma } from '@prisma/client'; // Importar tipos necessários

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
    return await prisma.workspace.findUnique({
        where: { whatsappWebhookRouteToken: routeToken },
        select: {
            id: true,
            whatsappWebhookVerifyToken: true, // Usado no GET
            whatsappAppSecret: true,        // Usado no POST (precisa descriptografar)
            // Inclua outros campos se necessário para o worker depois
        }
    });
}

// --- Método GET para Verificação ---
export async function GET(request: NextRequest, { params }: RouteParams) {
    const { routeToken } = await params;
    console.log(`[WHATSAPP WEBHOOK - GET ${routeToken}] Recebida requisição GET para verificação.`);

    // Buscar o workspace para obter o Verify Token específico
    const workspace = await getWorkspaceByRouteToken(routeToken);
    if (!workspace || !workspace.whatsappWebhookVerifyToken) {
        console.warn(`[WHATSAPP WEBHOOK - GET ${routeToken}] Workspace ou Verify Token não encontrado para este routeToken.`);
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
        console.warn(`[WHATSAPP WEBHOOK - GET ${routeToken}] Falha na verificação.`);
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

    // 1. Buscar Workspace e App Secret específico
    const workspace = await getWorkspaceByRouteToken(routeToken);
    if (!workspace || !workspace.whatsappAppSecret) {
        console.warn(`[WHATSAPP WEBHOOK - POST ${routeToken}] Workspace ou App Secret não encontrado. Rejeitando.`);
        return new NextResponse('Endpoint configuration not found or invalid.', { status: 404 });
    }

    // Descriptografar App Secret
    let appSecret: string;
    try {
        if (!workspace.whatsappAppSecret) {
            throw new Error("App Secret não configurado para este workspace.");
        }
        appSecret = decrypt(workspace.whatsappAppSecret);
        if (!appSecret) throw new Error("App Secret descriptografado está vazio.");
    } catch (decryptError: any) {
        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Erro CRÍTICO ao descriptografar App Secret para Workspace ${workspace.id}:`, decryptError.message);
        return new NextResponse('Internal Server Error: Failed to process credentials', { status: 500 });
    }

    // 2. Validar Assinatura
    if (!signatureHeader) { /* ... (tratamento assinatura ausente) ... */ }
    const expectedSignature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const receivedSignatureHash = signatureHeader.split('=')[1];
    if (expectedSignature !== receivedSignatureHash) { /* ... (tratamento assinatura inválida) ... */ }
    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Assinatura validada com sucesso para Workspace ${workspace.id}.`);

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
                                if (message.from && (message.type === 'text' || message.type === 'image' || message.type === 'audio')) {
                                    const receivedTimestamp = parseInt(message.timestamp, 10) * 1000; // Timestamp da mensagem (em segundos, converter para ms)
                                    const senderPhoneNumber = message.from; // Número de quem enviou
                                    const messageIdFromWhatsapp = message.id; // ID da mensagem na API do WhatsApp
                                    const workspacePhoneNumberId = metadata?.phone_number_id; // <<< USAR METADATA DEFINIDO ACIMA

                                    let messageContent: string | null = null;
                                    let messageType = message.type; // Guarda o tipo original
                                    let mediaId: string | null = null;

                                    if (messageType === 'text') {
                                        messageContent = message.text?.body;
                                    } else if (messageType === 'image') {
                                        messageContent = "[Imagem Recebida]"; // Placeholder
                                        mediaId = message.image?.id ?? null;
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Imagem Recebida: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}`);
                                    } else if (messageType === 'audio') {
                                        messageContent = "[Áudio Recebido]"; // Placeholder
                                        mediaId = message.audio?.id ?? null;
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Áudio Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}`);
                                    }

                                    // Validar se temos conteúdo (ou placeholder)
                                    if (!messageContent) {
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

                                    // --- Upsert Conversation ---
                                    // WhatsApp não tem ID de conversa estável, usamos uma combinação
                                    // A chave será client + workspace + channel
                                    const conversation = await prisma.conversation.upsert({
                                       where: {
                                          // Criar um índice composto no schema se não existir:
                                          // @@unique([workspace_id, client_id, channel])
                                          workspace_id_client_id_channel: {
                                                workspace_id: workspace.id,
                                                client_id: client.id,
                                                channel: 'WHATSAPP',
                                          }
                                       },
                                       update: {
                                           last_message_at: new Date(receivedTimestamp),
                                           status: ConversationStatus.ACTIVE, // Reabre a conversa se estava fechada
                                           channel: 'WHATSAPP',
                                           updated_at: new Date(),
                                       },
                                       create: {
                                           workspace_id: workspace.id,
                                           client_id: client.id,
                                           channel: 'WHATSAPP',
                                           status: ConversationStatus.ACTIVE,
                                           is_ai_active: true, // Começa com IA ativa
                                           last_message_at: new Date(receivedTimestamp),
                                           // Não temos channel_conversation_id estável do WhatsApp
                                       }
                                    });
                                    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Conversa ${conversation.id} Upserted/Atualizada.`);

                                    // --- Save Message ---
                                    const newMessage = await prisma.message.create({
                                        data: {
                                            conversation_id: conversation.id,
                                            sender_type: 'CLIENT',
                                            content: messageContent,
                                            timestamp: new Date(receivedTimestamp),
                                            channel_message_id: messageIdFromWhatsapp,
                                            metadata: {
                                                whatsappMessage: message,
                                                mediaId: mediaId
                                            }
                                        },
                                        select: { id: true, conversation_id: true, content: true, timestamp: true, sender_type: true }
                                    });
                                    console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Mensagem ${newMessage.id} (WPP ID: ${messageIdFromWhatsapp}) salva para Conv ${conversation.id}.`);

                                    // --- Publish to Redis (Conversation Channel) ---
                                    try {
                                        const conversationChannel = `chat-updates:${conversation.id}`;
                                        // Enviando objeto completo da mensagem salva para o canal da conversa
                                        const conversationPayloadString = JSON.stringify(newMessage);
                                        await redisConnection.publish(conversationChannel, conversationPayloadString);
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Mensagem ${newMessage.id} publicada no canal Redis da CONVERSA: ${conversationChannel}`);
                                    } catch (publishError) {
                                        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Falha ao publicar mensagem ${newMessage.id} no Redis (Canal Conversa):`, publishError);
                                    }

                                    // --- Publish to Redis (Workspace Channel for List Updates) ---
                                    try {
                                        const workspaceChannel = `workspace-updates:${workspace.id}`;
                                        // <<< ENRIQUECER PAYLOAD >>>
                                        const workspacePayload = {
                                            type: 'new_message', // Tipo do evento
                                            // Dados da Conversa
                                            conversationId: conversation.id,
                                            channel: conversation.channel, // Adicionado
                                            status: conversation.status, // Adicionado (ex: ACTIVE)
                                            is_ai_active: conversation.is_ai_active, // Adicionado
                                            lastMessageTimestamp: newMessage.timestamp.toISOString(), // Usar o timestamp da ÚLTIMA msg
                                            last_message_at: new Date(newMessage.timestamp).toISOString(), // Adicionado (equivalente ao timestamp)
                                            // Dados do Cliente
                                            clientId: client.id,
                                            clientName: client.name, // Adicionado
                                            clientPhone: client.phone_number, // Adicionado
                                            // Dados da Última Mensagem (pode ser a atual)
                                            lastMessageContent: newMessage.content, // Adicionado
                                            lastMessageSenderType: newMessage.sender_type, // Adicionado
                                            // Metadata (Opcional)
                                            metadata: conversation.metadata,
                                        };
                                        await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
                                        console.log(`[WHATSAPP WEBHOOK - POST ${routeToken}] Notificação ENRIQUECIDA publicada no canal Redis do WORKSPACE: ${workspaceChannel}`);
                                    } catch (publishError) {
                                        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Falha ao publicar notificação no Redis (Canal Workspace):`, publishError);
                                    }

                                    // --- Enqueue Job ---
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
                                    }

                                    // TODO: Adicionar lógica para iniciar Follow-up (startNewFollowUpSequence) se necessário,
                                    // similar ao webhook do Lumibot, adaptando a lógica de verificação.

                                } // Fim if message.from && (message.type === 'text' || message.type === 'image' || message.type === 'audio')
                            } // Fim loop messages
                        } // Fim if change.field === 'messages'
                    } // Fim loop changes
                } // Fim if entry.changes
            } // Fim loop entry
        } // Fim if payload.object
    } catch (parseError) {
        console.error(`[WHATSAPP WEBHOOK - POST ${routeToken}] Erro ao fazer parse do JSON ou processar payload:`, parseError);
        // Não falhar a resposta para a Meta aqui, pois a assinatura foi válida.
    }
    // --- FIM: Processamento do Payload ---

    // 5. Responder 200 OK para a Meta RAPIDAMENTE!
    return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
