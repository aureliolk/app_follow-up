// apps/next-app/app/api/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../packages/shared-lib/src/db'; // Ajuste o import se necessário
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../packages/shared-lib/src/auth/auth-options'; // Ajuste o import se necessário
import { checkPermission } from '../../../../../packages/shared-lib/src/permissions'; // Ajuste o import se necessário
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
    }

    // Verificar permissão de visualização no workspace
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Acesso negado a este workspace' }, { status: 403 });
    }

    // Buscar conversas, ordenando pelas mais recentes, incluindo dados do cliente e última mensagem
    const conversations = await prisma.conversation.findMany({
      where: {
        workspace_id: workspaceId,
      },
      orderBy: {
        last_message_at: 'desc', // Ordena pela última atividade
      },
      select: {
        id: true,
        status: true,
        last_message_at: true,
        updated_at: true, // Para desempate se last_message_at for igual
        is_ai_active: true,
        client: { // Inclui dados básicos do cliente
          select: {
            id: true,
            name: true,
            phone_number: true,
          },
        },
        messages: { // Pega apenas a última mensagem para o snippet
          orderBy: {
            timestamp: 'desc',
          },
          take: 1,
          select: {
            content: true,
            sender_type: true,
          },
        },
        // Opcional: Incluir status do FollowUp associado (query mais complexa)
        // _count: { select: { followUps: { where: { status: 'ACTIVE' } } } } // Exemplo simples
        // Ou buscar followups separadamente se necessário
      },
       // Adicionar paginação se a lista puder ficar muito grande
       // take: 50,
       // skip: ...
    });

    // Formatar os dados para a UI
    const formattedConversations = conversations.map(conv => {
         const lastMessage = conv.messages[0];
         let snippet = lastMessage?.content || 'Nenhuma mensagem ainda';
         if (lastMessage?.sender_type === 'AI' || lastMessage?.sender_type === 'SYSTEM') {
             snippet = `Você: ${snippet}`; // Ou `IA: ...` / `Sistema: ...`
         }
         // Limita o tamanho do snippet
         if (snippet.length > 50) {
            snippet = snippet.substring(0, 47) + '...';
         }

         return {
            id: conv.id,
            status: conv.status,
            lastActivity: conv.last_message_at ? new Date(conv.last_message_at).toLocaleString('pt-BR', { timeStyle: 'short', dateStyle: 'short'}) : '',
            client: conv.client,
            lastMessageSnippet: snippet,
            isAiActive: conv.is_ai_active,
            // Adicionar followUpStatus aqui se buscar na query
         }
    });


    return NextResponse.json({ success: true, data: formattedConversations });

  } catch (error) {
    console.error('API GET /api/conversations Error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar conversas' }, { status: 500 });
  }
}