// apps/next-app/app/api/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { sendWhatsappMessage } from "@/lib/channel/whatsappSender";
import { decrypt } from '@/lib/encryption';
import { redisConnection } from '@/lib/redis';
import { MessageSenderType, ConversationStatus } from '@prisma/client';
import type { Message } from "@/app/types";
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiTokenAuth(req, async (authedReq, workspaceIdFromToken) => {
    const awaitedParams = await params;
    const conversationId = awaitedParams.id;
    console.log(`API GET /api/conversations/${conversationId}/messages: Request received (API Token Auth: ${!!workspaceIdFromToken}).`);

    let userId: string | undefined = undefined; // To store user ID if session-based auth
    let hasAccess = false;
    let conversationWorkspaceId: string | undefined = undefined;

    try {
        // 1. Fetch conversation to get its workspace ID
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { workspace_id: true }
        });

        if (!conversation) {
            console.warn(`API GET Messages: Conversation ${conversationId} not found.`);
            return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
        }
        conversationWorkspaceId = conversation.workspace_id;

        // 2. Determine Authentication Method and Check Permissions
        if (workspaceIdFromToken) {
            // API Token Authentication
            console.log(`API GET Messages: Authenticating via API Token for Workspace ${workspaceIdFromToken}. Checking against Conversation Workspace ${conversationWorkspaceId}.`);
            if (workspaceIdFromToken === conversationWorkspaceId) {
                hasAccess = true;
                console.log(`API GET Messages: API Token access granted for Conv ${conversationId} in Workspace ${workspaceIdFromToken}.`);
            } else {
                 console.warn(`API GET Messages: API Token Mismatch. Token Workspace ${workspaceIdFromToken} vs Conversation Workspace ${conversationWorkspaceId} for Conv ${conversationId}.`);
                // Return 403 Forbidden, as the token is valid but not for this conversation's workspace
                 return NextResponse.json({ success: false, error: 'Token de API não autorizado para acessar esta conversa' }, { status: 403 });
            }
        } else {
            // Session-based Authentication
            console.log(`API GET Messages: Authenticating via User Session for Conv ${conversationId} (Workspace ${conversationWorkspaceId}).`);
            const session = await getServerSession(authOptions);
            if (!session?.user?.id) {
                console.warn(`API GET Messages: Unauthorized - Invalid session for conv ${conversationId}.`);
                return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
            }
            userId = session.user.id;

            // Check user permission within the conversation's actual workspace
            hasAccess = await checkPermission(conversationWorkspaceId, userId, 'VIEWER');
            if (hasAccess) {
                 console.log(`API GET Messages: User ${userId} has permission for Conv ${conversationId} in Workspace ${conversationWorkspaceId}.`);
            } else {
                 console.warn(`API GET Messages: User ${userId} permission denied for Conv ${conversationId} in Workspace ${conversationWorkspaceId}.`);
            }
        }

        // 3. Final Access Check
        if (!hasAccess) {
            console.warn(`API GET Messages: Final access check failed for Conv ${conversationId}.`);
            return NextResponse.json({ success: false, error: 'Permissão negada para acessar esta conversa' }, { status: 403 });
        }

        // 4. Fetch Messages (If access granted)
        console.log(`API GET Messages: Access granted. Fetching messages for conversation ${conversationId}.`);
        const messages = await prisma.message.findMany({
            where: { conversation_id: conversationId },
            orderBy: { timestamp: 'asc' }, // Ordenar da mais antiga para a mais recente
            select: { // Selecionar campos necessários para a UI
                id: true,
                conversation_id: true,
                sender_type: true,
                content: true,
                timestamp: true,
                channel_message_id: true,
                metadata: true,
                media_url: true,
                media_mime_type: true,
                media_filename: true,
                status: true,
                providerMessageId: true,
                sentAt: true,
                errorMessage: true,
            },
        });

        // Add the required message_type before casting
        const messagesWithType = messages.map(msg => ({
            ...msg,
            message_type: 'TEXT', // Assign default 'TEXT' since it's missing from DB
        }));

        console.log(`API GET Messages: Found ${messagesWithType.length} messages for conversation ${conversationId}.`);
        return NextResponse.json({ success: true, data: messagesWithType as Message[] }); // Cast should be safer now

    } catch (error) {
        console.error(`API GET Messages (${conversationId}): Error processing request:`, error);
        return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
    }
  });
}


const sendMessageSchema = z.object({
  content: z.string().min(1, "O conteúdo da mensagem não pode ser vazio."),
  // workspaceId: z.string().uuid(), // Não precisa vir no body, pegamos da conversa
  // senderType: z.enum(['AI', 'SYSTEM']), // Opcional: Definir quem está enviando manualmente
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const awaitedParams = await params;
  const conversationId = awaitedParams.id;
  console.log(`API POST /api/conversations/${conversationId}/messages: Request received - Send Manual Message`);

  try {
    // 1. Autenticação e Autorização
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Buscar Conversa e Dados Relacionados (Canal, Cliente, Workspace Creds)
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { // Selecionar apenas o necessário
            id: true,
            channel: true,
            client_id: true,
            client: {
                select: { phone_number: true }
            },
            workspace_id: true,
            workspace: { // Incluir relação workspace
                select: {
                    id: true,
                    whatsappPhoneNumberId: true,
                    whatsappAccessToken: true, // Criptografado
                    ai_name: true
                }
            }
        }
    });

    if (!conversation) {
        return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
    }
    if (!conversation.workspace) {
        console.error(`API POST Messages (${conversationId}): Relação Workspace ausente na conversa encontrada.`);
        return NextResponse.json({ success: false, error: 'Dados do Workspace associado não encontrados' }, { status: 500 });
    }
    if (!conversation.client) {
         console.error(`API POST Messages (${conversationId}): Relação Client ausente na conversa encontrada.`);
        return NextResponse.json({ success: false, error: 'Dados do Cliente associado não encontrados' }, { status: 500 });
    }
    const workspaceId = conversation.workspace.id;
    const clientId = conversation.client_id;

    // 3. Verificar Permissão
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER'); // Ajuste role se necessário
    if (!hasPermission) {
        return NextResponse.json({ success: false, error: 'Permissão negada para enviar mensagem nesta conversa' }, { status: 403 });
    }

    // 4. Validar Corpo da Requisição
    const body = await req.json();
    const validation = sendMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { content } = validation.data;
    const senderType = MessageSenderType.SYSTEM; // Usar SYSTEM (ou criar AGENT no futuro)

    // 5. Lógica de Envio Condicional
    let sendSuccess = false;
    let channelMessageIdFromApi: string | undefined = undefined;

    if (conversation.channel === 'WHATSAPP') {
        console.log(`API POST Messages (${conversationId}): Attempting send via WHATSAPP.`);
        const { whatsappPhoneNumberId, whatsappAccessToken } = conversation.workspace;
        const clientPhoneNumber = conversation.client?.phone_number;

        if (!whatsappPhoneNumberId || !whatsappAccessToken || !clientPhoneNumber) {
            console.error(`API POST Messages (${conversationId}): WhatsApp credentials/phone missing for workspace ${workspaceId} or client.`);
            return NextResponse.json({ success: false, error: 'Configuração do WhatsApp incompleta para envio.' }, { status: 500 });
        }

        try {
            console.log(`API POST Messages (${conversationId}): Decrypting WhatsApp token...`);
            const decryptedAccessToken = decrypt(whatsappAccessToken);
            if (!decryptedAccessToken) throw new Error("Token de acesso descriptografado está vazio.");
            console.log(`API POST Messages (${conversationId}): Token decrypted. Sending message...`);

            const sendResult = await sendWhatsappMessage(
                whatsappPhoneNumberId,
                clientPhoneNumber,
                decryptedAccessToken,
                content,
                session?.user?.name || 'Operador'
            );

            if (sendResult.success) {
                sendSuccess = true;
                channelMessageIdFromApi = sendResult.wamid;
                console.log(`API POST Messages (${conversationId}): Message sent successfully via WhatsApp (API Msg ID: ${channelMessageIdFromApi}).`);
            } else {
                console.error(`API POST Messages (${conversationId}): Failed to send message via WhatsApp.`, sendResult.error);
                throw new Error(`Falha ao enviar mensagem para o WhatsApp: ${JSON.stringify(sendResult.error)}`);
            }
        } catch (error: any) {
            console.error(`API POST Messages (${conversationId}): Error during WhatsApp send/decrypt:`, error);
            return NextResponse.json({ success: false, error: error.message || 'Erro ao enviar via WhatsApp.' }, { status: 500 });
        }

    } else {
         console.warn(`API POST Messages (${conversationId}): Channel is '${conversation.channel}', which is not supported for manual sending.`);
         return NextResponse.json({ success: false, error: `Envio manual não suportado para o canal ${conversation.channel}` }, { status: 400 });
    }

    // 6. Salvar Mensagem no Banco de Dados (APÓS envio bem-sucedido)
    let newMessage = null;
    if (sendSuccess) {
        const messageTimestamp = new Date();
        
        // <<< OBTER NOME DO USUÁRIO E ADICIONAR PREFIXO >>>
        const senderName = session?.user?.name || 'Operador'; // Usar "Operador" como fallback
        const prefixedContent = `*${senderName}*\n ${content}`;
        
        try {
            newMessage = await prisma.message.create({
                data: {
                    conversation_id: conversationId,
                    sender_type: senderType, // Já definido como SYSTEM
                    content: prefixedContent, // <<< SALVAR CONTEÚDO COM PREFIXO
                    timestamp: messageTimestamp,
                    channel_message_id: channelMessageIdFromApi,
                    metadata: { manual_sender_id: userId },
                    status: 'SENT' // <<< CONFIRMADO: Status já está sendo definido como SENT!
                },
                select: { // Selecionar dados para retornar e publicar
                    id: true, conversation_id: true, sender_type: true,
                    content: true, timestamp: true, channel_message_id: true, metadata: true,
                    // <<< Adicionar status ao select para retornar/publicar >>>
                    status: true 
                }
            });
            console.log(`API POST Messages (${conversationId}): Manual message saved to DB (ID: ${newMessage.id}) with prefix.`);

            // 7. Atualizar last_message_at da Conversa
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { last_message_at: messageTimestamp, status: ConversationStatus.ACTIVE, updated_at: new Date() }
            });
            console.log(`API POST Messages (${conversationId}): Conversation last_message_at updated.`);

            console.log(`API POST Messages (${conversationId}): Skipping publish to CONVERSATION channel (handled by optimistic update).`);

            // Manter publicação no Canal do Workspace (notificação enriquecida)
            try {
                const workspaceChannel = `workspace-updates:${workspaceId}`;
                const workspacePayload = {
                    type: 'new_message', // Ou 'conversation_updated'?
                    conversationId: conversationId,
                    lastMessageTimestamp: newMessage.timestamp.toISOString(),
                     // Incluir outros dados úteis para preview se necessário
                };
                await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
                console.log(`API POST Messages (${conversationId}): Notification published to WORKSPACE channel ${workspaceChannel}.`);
            } catch (redisError) {
                 console.error(`API POST Messages (${conversationId}): Failed to publish to WORKSPACE channel:`, redisError);
            }

        } catch (error: any) {
            console.error(`API POST Messages (${conversationId}): Error saving message to DB:`, error);
            return NextResponse.json({ success: false, error: 'Erro ao salvar mensagem no banco de dados' }, { status: 500 });
        }
    } else {
         // If sendSuccess is false, newMessage will be null
         return NextResponse.json({ success: false, error: 'Falha no envio da mensagem, não foi salva.' }, { status: 500 });
    }

    // 9. Retornar Sucesso com a Mensagem Criada
    // Add the required message_type before returning
    const responseMessage = newMessage ? {
        ...newMessage,
        message_type: 'TEXT' // Add default type
    } : null;

    return NextResponse.json({ success: true, data: responseMessage as Message | null });

  } catch (error: any) {
    console.error(`API POST Messages (${conversationId}): Unhandled error:`, error);
    return NextResponse.json({ success: false, error: 'Erro interno no servidor' }, { status: 500 });
  }
}