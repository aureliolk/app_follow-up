// apps/next-app/app/api/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { redisConnection } from '@/lib/redis';
import type { Message } from "@/app/types";
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';
import { sendOperatorMessage } from '@/lib/services/conversationService';
import pusher from '@/lib/pusher';

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
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const awaitedParams = await params;
  const conversationId = awaitedParams.id;
  console.log(`API POST /api/conversations/${conversationId}/messages: Request received - Send Manual Message`);

  try {
    // 1. Autenticação
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;
    const userName = session.user.name; // Get user name for the service

    // 2. Validar Corpo da Requisição
    let content: string;
    try {
        const body = await req.json();
        const validation = sendMessageSchema.safeParse(body);
        if (!validation.success) {
          return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
        }
        content = validation.data.content;
    } catch (parseError) {
         console.error(`API POST Messages (${conversationId}): Error parsing request body:`, parseError);
         return NextResponse.json({ success: false, error: 'Corpo da requisição inválido.' }, { status: 400 });
    }


    // 3. Verificar Permissão (Necessário buscar workspace ID primeiro)
    const conversationForPermission = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { workspace_id: true }
    });

    if (!conversationForPermission) {
        return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
    }
    const workspaceId = conversationForPermission.workspace_id;

    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER'); // Or appropriate role
    if (!hasPermission) {
        return NextResponse.json({ success: false, error: 'Permissão negada para enviar mensagem nesta conversa' }, { status: 403 });
    }

    // --- 4. Chamar o Serviço para Enviar a Mensagem ---
    console.log(`API POST Messages (${conversationId}): Calling sendOperatorMessage service for user ${userId}.`);
    const result = await sendOperatorMessage(
        conversationId,
        userId,
        userName,
        content
    );

    // 5. Lidar com a Resposta do Serviço
    if (result.success && result.message) {
        console.log(`API POST Messages (${conversationId}): Service call successful. Message ID: ${result.message.id}`);

        // Publicar evento para atualização em tempo real via Pusher
        // O eventPayload deve conter a mensagem completa para a UI
        const eventPayload = JSON.stringify({ type: 'new_message', payload: result.message });
        const channelName = `private-workspace-${result.message.conversation.workspace_id}`; // Corrigido: Usar o workspaceId da conversa
        try {
          await pusher.trigger(channelName, 'new_message', eventPayload);
          console.log(`[API POST /messages] Pusher event triggered on channel ${channelName}`);
        } catch (pusherError) {
          console.error(`API POST Messages (${conversationId}): Failed to trigger Pusher event:`, pusherError);
          // Considerar logar o erro ou alguma forma de fallback/notificação
        }

        // Retornar a mensagem criada pelo serviço
        return NextResponse.json({ success: true, message: result.message });
    } else {
        console.error(`API POST Messages (${conversationId}): Service call failed. Error: ${result.error}`);
        // Usar o statusCode retornado pelo serviço, se disponível
        return NextResponse.json({ success: false, error: result.error || 'Falha ao enviar mensagem.' }, { status: result.statusCode || 500 });
    }

  } catch (error: any) {
    console.error(`API POST Messages (${conversationId}): Unhandled error in POST handler:`, error);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor ao processar a requisição.' }, { status: 500 });
  }
}