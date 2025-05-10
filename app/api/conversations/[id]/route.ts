import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import type { ClientConversation } from "@/app/types";
import { ConversationStatus, FollowUpStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

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

    // 5. Buscar FollowUp (se solicitado)
    let activeFollowUp = null;
    if (includeFollowUp) {
      console.log(`GET /api/conversations/${conversationId}: Fetching followups for this conversation...`);
      
      // Buscar apenas por conversationId diretamente
      const followupByConversation = await prisma.followUp.findFirst({
        where: {
          conversationId: conversationId,
          workspace_id: workspaceId,
          status: { in: [FollowUpStatus.ACTIVE, FollowUpStatus.CONVERTED, FollowUpStatus.PAUSED] },
        },
        select: {
            id: true,
            status: true,
        },
        orderBy: {
          updated_at: 'desc', // O mais recentemente atualizado
        }
      });
      
      if (followupByConversation) {
        activeFollowUp = followupByConversation;
        console.log(`GET /api/conversations/${conversationId}: Found followup by conversation ID (ID: ${activeFollowUp.id}, Status: ${activeFollowUp.status})`);
      } else {
        console.log(`GET /api/conversations/${conversationId}: No followup directly linked to this conversation.`);
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

// Schema para validação do corpo do PATCH
const conversationPatchSchema = z.object({
  is_ai_active: z.boolean(), // Espera explicitamente o novo estado booleano
});

// --- PATCH: Atualizar status da IA da conversa ---
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } } // Assinatura padrão para rotas dinâmicas
) {
  try {
    const { id: conversationId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json();
    console.log(`PATCH /api/conversations/${conversationId}: Request body:`, body);

    // Validar o corpo da requisição
    const validation = conversationPatchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { is_ai_active } = validation.data;

    // Buscar o workspace ID da conversa para checar permissão
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { workspace_id: true }
    });

    if (!conversation) {
         return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
    }
    const workspaceId = conversation.workspace_id;

    // Verificar permissão (ex: MEMBER ou superior)
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });
    }

    // Atualizar a conversa
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        is_ai_active: is_ai_active,
        // Opcional: adicionar uma mensagem do sistema informando a mudança?
        // messages: {
        //   create: {
        //     sender_type: 'SYSTEM',
        //     content: `IA ${is_ai_active ? 'reiniciada' : 'pausada'} pelo operador.`
        //   }
        // }
      },
      // Incluir dados necessários para atualizar o contexto
      include: {
          client: { 
              select: { id: true, name: true, phone_number: true, metadata: true }
          },
          messages: { 
              select: { id: true, content: true, timestamp: true, sender_type: true },
              orderBy: { timestamp: 'desc' },
              take: 1
          }
      }
    });

    console.log(`PATCH /api/conversations/${conversationId}: Status da IA atualizado para ${is_ai_active}.`);
    // Retornar a conversa atualizada completa para o contexto
    return NextResponse.json({ success: true, data: updatedConversation });

  } catch (error) {
    console.error(`PATCH /api/conversations/[id]: Error updating conversation:`, error);
    return NextResponse.json({ success: false, error: 'Erro interno ao atualizar conversa' }, { status: 500 });
  }
} 