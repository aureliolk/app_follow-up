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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } // 'id' aqui é o conversationId
) {
  const awaitedParams = await params;
  const conversationId = awaitedParams.id;
  console.log(`API GET /api/conversations/${conversationId}/messages: Request received.`);

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn(`API GET Messages: Unauthorized - Invalid session for conv ${conversationId}.`);
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 1. Buscar a conversa para obter o workspaceId e verificar existência
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { workspace_id: true } // Só precisamos do workspace_id
    });

    if (!conversation) {
      console.error(`API GET Messages: Conversation ${conversationId} not found.`);
      return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
    }
    const workspaceId = conversation.workspace_id;

    // 2. Verificar permissão no workspace da conversa
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
      console.warn(`API GET Messages: Permission denied for User ${userId} on Workspace ${workspaceId} (Conv: ${conversationId})`);
      return NextResponse.json({ success: false, error: 'Permissão negada para acessar esta conversa' }, { status: 403 });
    }
    console.log(`API GET Messages: User ${userId} has permission for Conv ${conversationId}`);

    // 3. Buscar as mensagens da conversa
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

    console.log(`API GET Messages: Found ${messages.length} messages for conversation ${conversationId}.`);
    return NextResponse.json({ success: true, data: messages as Message[] }); // Cast para Message

  } catch (error) {
    console.error(`API GET Messages: Internal error for conversation ${conversationId}:`, error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar mensagens' }, { status: 500 });
  }
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
                channelMessageIdFromApi = sendResult.messageId;
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
    let newMessage: Message | null = null;
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

            // 8. Publicar no Redis (ambos os canais)
            // Canal da Conversa
            try {
                const conversationChannel = `chat-updates:${conversationId}`;
                const redisPayload = {
                    type: 'new_message',
                    payload: {
                        id: newMessage.id,
                        conversation_id: newMessage.conversation_id,
                        content: newMessage.content, // <<< Enviar conteúdo com prefixo
                        sender_type: newMessage.sender_type,
                        timestamp: newMessage.timestamp instanceof Date 
                            ? newMessage.timestamp.toISOString() 
                            : newMessage.timestamp,
                        status: newMessage.status // <<< Incluir status no payload do Redis
                    }
                };
                await redisConnection.publish(conversationChannel, JSON.stringify(redisPayload));
                console.log(`API POST Messages (${conversationId}): Message ${newMessage.id} published to CONVERSATION channel ${conversationChannel}.`);
            } catch (publishError) {
                console.error(`API POST Messages (${conversationId}): Failed to publish to CONVERSATION channel:`, publishError);
            }
            // Canal do Workspace
            try {
                const workspaceChannel = `workspace-updates:${workspaceId}`;
                // Garantir que é uma string ISO 8601
                const timestampString = newMessage.timestamp instanceof Date 
                    ? newMessage.timestamp.toISOString() 
                    : String(newMessage.timestamp); // Converte para string se não for Date
                
                const workspacePayload = {
                    type: 'new_message',
                    conversationId: conversationId,
                    clientId: clientId,
                    lastMessageTimestamp: timestampString, // Usa a string garantida
                };
                await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
                console.log(`API POST Messages (${conversationId}): Notification published to WORKSPACE channel ${workspaceChannel}.`);
            } catch (publishError) {
                console.error(`API POST Messages (${conversationId}): Failed to publish to WORKSPACE channel:`, publishError);
            }

        } catch (dbError) {
             console.error(`API POST Messages (${conversationId}): Error saving message or updating conversation after successful send:`, dbError);
             return NextResponse.json({ success: false, error: 'Mensagem enviada, mas ocorreu um erro ao registrar no sistema.' }, { status: 500 });
        }
    } else {
         return NextResponse.json({ success: false, error: 'Falha no envio da mensagem, não foi salva.' }, { status: 500 });
    }

    // 9. Retornar Sucesso com a Mensagem Criada
    return NextResponse.json({ success: true, data: newMessage as Message });

  } catch (error: any) {
    console.error(`API POST Messages (${conversationId}): Unhandled Internal Server Error:`, error);
    return NextResponse.json({ success: false, error: error.message || 'Erro interno do servidor ao enviar mensagem.' }, { status: 500 });
  }
}