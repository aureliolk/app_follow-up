import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { ConversationStatus, FollowUpStatus, Prisma } from '@prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>; // Next.js 15+ params são Promises
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: conversationId } = await params; // Acessar ID com await
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const includeFollowUp = searchParams.get('includeFollowUp') === 'true';

    console.log(`GET /api/conversations/${conversationId}: Request received (Workspace: ${workspaceId}, IncludeFollowUp: ${includeFollowUp})`);

    // 1. Validar Sessão
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn(`GET /api/conversations/${conversationId}: Unauthorized (no session)`);
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Validar Workspace ID
    if (!workspaceId) {
      console.warn(`GET /api/conversations/${conversationId}: Bad Request (missing workspaceId)`);
      return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
    }

    // 3. Verificar Permissão (Membro do Workspace)
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId,
        },
      },
      select: { id: true }, // Seleciona apenas o necessário para confirmar a existência
    });

    // 3. Modificar verificação para incluir Super Admin
    if (!member && !session.user.isSuperAdmin) { // Permitir se for membro OU Super Admin
      console.warn(`GET /api/conversations/${conversationId}: Forbidden (user ${userId} is not member and not Super Admin for workspace ${workspaceId})`);
      return NextResponse.json({ success: false, error: 'Acesso negado a este workspace' }, { status: 403 });
    }
    console.log(`GET /api/conversations/${conversationId}: User ${userId} has access (Member: ${!!member}, SuperAdmin: ${session.user.isSuperAdmin}).`);

    // 4. Buscar a Conversa (garantindo que pertence ao workspace)
    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        workspace_id: workspaceId, // Filtra pelo workspace ID!
      },
      include: {
        client: true, // Inclui todos os dados do cliente
        // Não incluir follow-up diretamente aqui, faremos query separada
      },
    });

    if (!conversation) {
      console.warn(`GET /api/conversations/${conversationId}: Not Found (in workspace ${workspaceId})`);
      return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
    }
    console.log(`GET /api/conversations/${conversationId}: Conversation found.`);

    // 5. Buscar FollowUp Ativo (se solicitado)
    let activeFollowUp = null;
    if (includeFollowUp && conversation.client_id) {
      console.log(`GET /api/conversations/${conversationId}: Fetching active follow-up for client ${conversation.client_id}...`);
      activeFollowUp = await prisma.followUp.findFirst({
        where: {
          client_id: conversation.client_id,
          workspace_id: workspaceId,
          status: FollowUpStatus.ACTIVE, // Busca apenas follow-ups ATIVOS
        },
        orderBy: {
          started_at: 'desc', // Pega o mais recente se houver múltiplos (não deveria)
        },
        // Selecionar apenas os campos necessários para a UI
        select: {
            id: true,
            status: true,
            // Adicione outros campos se o ClientConversation type precisar
        }
      });
      if (activeFollowUp) {
         console.log(`GET /api/conversations/${conversationId}: Active follow-up found (ID: ${activeFollowUp.id})`);
      } else {
         console.log(`GET /api/conversations/${conversationId}: No active follow-up found.`);
      }
    }

    // 6. Montar e Retornar Resposta
    // O tipo ClientConversation no frontend espera 'activeFollowUp', então adicionamos
    const responseData = {
      ...conversation,
      activeFollowUp: activeFollowUp, // Será null se não encontrado ou não solicitado
    };

    return NextResponse.json({ success: true, data: responseData }, { status: 200 });

  } catch (error) {
    console.error(`GET /api/conversations/[id]: Error fetching conversation:`, error);
    // Evitar expor detalhes do erro no Prisma
    if (error instanceof Prisma.PrismaClientValidationError) {
         return NextResponse.json({ success: false, error: 'Erro nos dados da requisição.' }, { status: 400 });
    }
    // Erro genérico
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
} 