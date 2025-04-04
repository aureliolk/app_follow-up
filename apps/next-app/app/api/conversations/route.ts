// apps/next-app/app/api/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../packages/shared-lib/src/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '../../../../../packages/shared-lib/src/permissions';
import type { ClientConversation } from '../../../../../apps/next-app/app/types'; // Importar tipo
import { ConversationStatus, FollowUpStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  console.log("API GET /api/conversations: Request received.");
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn("API GET Conversations: Unauthorized - Invalid session.");
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');
    console.log(`API GET Conversations: Fetching for workspaceId: ${workspaceId}`);

    if (!workspaceId) {
      console.error("API GET Conversations: Error - workspaceId is required.");
      return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
    }

    // Check permission (VIEWER is sufficient to list conversations)
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
      console.warn(`API GET Conversations: Permission denied for User ${userId} on Workspace ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'Permissão negada para acessar este workspace' }, { status: 403 });
    }
    console.log(`API GET Conversations: User ${userId} has VIEWER permission on Workspace ${workspaceId}`);

    const conversations = await prisma.conversation.findMany({
      where: {
        workspace_id: workspaceId,
        // Filtro inicial simples: Apenas conversas com status ACTIVE
        // Você pode refinar isso depois para incluir conversas PAUSED
        // ou basear no status do FollowUp associado, se preferir
        status: ConversationStatus.ACTIVE
      },
      include: {
        client: {
          select: {
            id: true, name: true, phone_number: true,
            // Inclui o FollowUp ativo (ou pausado) associado ao cliente NESTE workspace
            follow_ups: {
              where: {
                workspace_id: workspaceId, // Redundante mas seguro
                status: { in: [FollowUpStatus.ACTIVE, FollowUpStatus.PAUSED] } // Busca Ativo ou Pausado
              },
              select: { id: true, status: true },
              take: 1 // Pega apenas um (deve haver só um ativo/pausado)
            }
          }
        },
        messages: { // Última mensagem
          select: { content: true, timestamp: true, sender_type: true },
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        last_message_at: { sort: 'desc', nulls: 'last' }, // Ordena por última msg, nulls por último
      },
    });

    // Format data for the frontend ClientConversation type
    const formattedData: ClientConversation[] = conversations.map(convo => ({
      id: convo.id,
      workspace_id: convo.workspace_id,
      client_id: convo.client_id,
      channel: convo.channel,
      channel_conversation_id: convo.channel_conversation_id,
      status: convo.status,
      is_ai_active: convo.is_ai_active,
      last_message_at: convo.last_message_at,
      created_at: convo.created_at,
      updated_at: convo.updated_at,
      metadata: convo.metadata,
      client: { // Dados básicos do cliente
        id: convo.client.id,
        name: convo.client.name,
        phone_number: convo.client.phone_number,
      },
      last_message: convo.messages[0] ? {
        content: convo.messages[0].content,
        timestamp: convo.messages[0].timestamp,
        sender_type: convo.messages[0].sender_type,
      } : null,
      // Adiciona o follow-up ativo/pausado encontrado
      activeFollowUp: convo.client.follow_ups[0] ? {
        id: convo.client.follow_ups[0].id,
        status: convo.client.follow_ups[0].status // Passa o status encontrado
      } : null,
    }));


    console.log(`API GET Conversations: Found ${formattedData.length} relevant conversations for workspace ${workspaceId}.`);
    return NextResponse.json({ success: true, data: formattedData });

  } catch (error) {
    console.error('API GET Conversations: Internal error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar conversas' }, { status: 500 });
  }
}