import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth/auth-utils';
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';
import { Prisma } from '@prisma/client';

// Helper simplificado para verificar permissão (igual ao de stages)
async function checkPermission(
  request: NextRequest,
  workspaceId: string
): Promise<{ userId: string | null; errorResponse: NextResponse | null }> {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { success: false, error: 'Não autorizado' },
        { status: 401 }
      ),
    };
  }
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspace_id: workspaceId, user_id: userId },
  });
  let isOwner = false;
  if (!membership) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true },
    });
    if (workspace?.owner_id === userId) isOwner = true;
  }
  if (!membership && !isOwner) {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { success: false, error: 'Acesso proibido a este workspace' },
        { status: 403 }
      ),
    };
  }
  return { userId, errorResponse: null };
}

// GET (byId) handler envolvido pelo middleware
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dealId: string }> }
) {
  return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
    const awaitedParams = await params;
    const workspaceIdFromUrl = awaitedParams.id;
    const dealId = awaitedParams.dealId;

    if (!workspaceIdFromUrl || !dealId) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID e Deal ID são obrigatórios na URL' },
        { status: 400 }
      );
    }

    if (workspaceIdFromToken && workspaceIdFromToken !== workspaceIdFromUrl) {
        return NextResponse.json(
          { success: false, error: 'Token de API não pertence a este workspace' },
          { status: 403 }
        );
    }
    const workspaceId = workspaceIdFromUrl;

    try {
      // Verificar autenticação
      const userId = await getCurrentUserId(authedReq);
      if (!userId && !workspaceIdFromToken) {
        return NextResponse.json(
          { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
          { status: 401 }
        );
      }

      // Verificar permissão do usuário (se via sessão)
      if (userId) {
          const membership = await prisma.workspaceMember.findFirst({
            where: { workspace_id: workspaceId, user_id: userId },
          });
          let isOwner = false;
          if (!membership) {
            const workspace = await prisma.workspace.findUnique({
              where: { id: workspaceId }, select: { owner_id: true },
            });
            if (workspace?.owner_id === userId) isOwner = true;
          }
          if (!membership && !isOwner) {
            return NextResponse.json(
              { success: false, error: 'Acesso proibido a este workspace (permissão de usuário)' },
              { status: 403 }
            );
          }
      }

      // Buscar o Deal específico
      const deal = await prisma.deal.findUnique({
        where: { id: dealId, workspace_id: workspaceId }, // Filtrar também por workspaceId
        include: { // Incluir dados relacionados como na listagem
          stage: true,
          assignedTo: { select: { id: true, name: true, email: true, image: true } },
          client: { select: { id: true, name: true, phone_number: true } },
          // Incluir também notas, tarefas, documentos, logs?
          // dealNotes: { orderBy: { createdAt: 'desc' } },
          // dealTasks: { orderBy: { due_date: 'asc' } },
          // dealDocuments: { orderBy: { createdAt: 'desc' } },
          // dealActivityLogs: { orderBy: { created_at: 'desc' } }
        },
      });

      if (!deal) {
        return NextResponse.json(
          { success: false, error: 'Deal não encontrado ou não pertence a este workspace' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data: deal }, { status: 200 });

    } catch (error) {
      console.error('Erro ao buscar deal específico:', error);
      return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
    }
  });
}

// PUT handler envolvido pelo middleware
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dealId: string }> }
) {
   return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
    const awaitedParams = await params;
    const workspaceIdFromUrl = awaitedParams.id;
    const dealId = awaitedParams.dealId;

    if (!workspaceIdFromUrl || !dealId) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID e Deal ID são obrigatórios na URL' },
        { status: 400 }
      );
    }

    if (workspaceIdFromToken && workspaceIdFromToken !== workspaceIdFromUrl) {
        return NextResponse.json(
          { success: false, error: 'Token de API não pertence a este workspace' },
          { status: 403 }
        );
    }
    const workspaceId = workspaceIdFromUrl;

    try {
      // Verificar autenticação
      const userId = await getCurrentUserId(authedReq);
      if (!userId && !workspaceIdFromToken) {
        return NextResponse.json(
          { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
          { status: 401 }
        );
      }

      // Verificar permissão do usuário (se via sessão)
      if (userId) {
         const membership = await prisma.workspaceMember.findFirst({
            where: { workspace_id: workspaceId, user_id: userId },
          });
          let isOwner = false;
          if (!membership) {
            const workspace = await prisma.workspace.findUnique({
              where: { id: workspaceId }, select: { owner_id: true },
            });
            if (workspace?.owner_id === userId) isOwner = true;
          }
          if (!membership && !isOwner) {
            return NextResponse.json(
              { success: false, error: 'Acesso proibido para atualizar deal (permissão de usuário)' },
              { status: 403 }
            );
          }
      }

      // Extrair dados do corpo
      const body = await authedReq.json();
      const {
        name, // Corrigido de title para name
        stageId,
        value,
        assignedToId,
        clientId,
        probability, // Adicionar outros campos atualizáveis
        expectedCloseDate,
        source,
        ai_controlled,
        // Não permitir atualizar order se não existe
      } = body;

      // Validar se pelo menos um campo foi fornecido
      if (Object.keys(body).length === 0) { // Melhor validação
        return NextResponse.json(
          { success: false, error: 'Nenhum campo fornecido para atualização' },
          { status: 400 }
        );
      }

      // Montar objeto de atualização
      const updateData: Prisma.DealUpdateInput = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim() === '') { return NextResponse.json({ error: 'Nome inválido' }, { status: 400 }); }
        updateData.name = name;
      }
      if (value !== undefined) {
        updateData.value = value === null ? null : parseFloat(value);
      }
      if (probability !== undefined) {
          updateData.probability = probability === null ? null : parseFloat(probability);
      }
      if (expectedCloseDate !== undefined) {
          updateData.expectedCloseDate = expectedCloseDate === null ? null : new Date(expectedCloseDate);
      }
       if (source !== undefined) {
          // TODO: Validar se source é um valor válido do enum DealSource
          updateData.source = source;
       }
        if (ai_controlled !== undefined) {
          updateData.ai_controlled = Boolean(ai_controlled);
        }

      // Validar e preparar conexões de relacionamento
      if (stageId !== undefined) {
        if (typeof stageId !== 'string') { return NextResponse.json({ error: 'StageId inválido' }, { status: 400 }); }
        const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId, workspace_id: workspaceId } });
        if (!stage) { return NextResponse.json({ error: 'Estágio inválido ou não pertence a este workspace' }, { status: 400 }); }
        updateData.stage = { connect: { id: stageId } };
      }
      if (assignedToId !== undefined) {
        if (assignedToId === null) {
            updateData.assignedTo = { connect: null };
        } else {
            if (typeof assignedToId !== 'string') { return NextResponse.json({ error: 'assignedToId inválido' }, { status: 400 }); }
            const user = await prisma.user.findUnique({ where: { id: assignedToId } });
            if (!user) { return NextResponse.json({ error: 'Usuário responsável inválido' }, { status: 400 }); }
            updateData.assignedTo = { connect: { id: assignedToId } };
        }
      }
       if (clientId !== undefined) {
          if (clientId === null) {
              updateData.client = { connect: null };
          } else {
             if (typeof clientId !== 'string') { return NextResponse.json({ error: 'clientId inválido' }, { status: 400 }); }
             const client = await prisma.client.findUnique({ where: { id: clientId, workspace_id: workspaceId } });
             if (!client) { return NextResponse.json({ error: 'Cliente inválido ou não pertence a este workspace' }, { status: 400 }); }
             updateData.client = { connect: { id: clientId } };
          }
      }

      // Atualizar o Deal (usando update para suportar relações)
      const updatedDeal = await prisma.deal.update({
        where: { id: dealId }, // Usar apenas o ID único para update
        data: updateData,
        // Opcional: Verificar se o deal pertence ao workspace antes?
        // Embora update por ID seja direto, uma verificação prévia poderia ser mais segura
        // No entanto, a permissão já foi verificada no início.
        include: { // Retornar o deal atualizado com relações
            stage: true,
            assignedTo: { select: { id: true, name: true, email: true, image: true } },
            client: { select: { id: true, name: true, phone_number: true } }
        }
      });

      // Não precisamos mais verificar updatedResult.count
      // Se o update falhar por não encontrar o ID, ele lançará um erro P2025

      // Buscar e retornar o deal atualizado (o update já retorna)
      // const resultDeal = await prisma.deal.findUnique({ ... }); // Não necessário
      return NextResponse.json({ success: true, data: updatedDeal }, { status: 200 });

    } catch (error: any) {
      console.error('Erro ao atualizar deal:', error);
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { success: false, error: 'JSON inválido no corpo da requisição' },
          { status: 400 }
        );
      }
      // Adicionar tratamento para P2025 (Not Found)
       if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
           return NextResponse.json(
            { success: false, error: 'Deal não encontrado para atualização.' },
            { status: 404 }
          );
      }
      return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
    }
  });
}

// DELETE handler envolvido pelo middleware
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dealId: string }> }
) {
  return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
    const awaitedParams = await params;
    const workspaceIdFromUrl = awaitedParams.id;
    const dealId = awaitedParams.dealId;

     if (!workspaceIdFromUrl || !dealId) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID e Deal ID são obrigatórios na URL' },
        { status: 400 }
      );
    }

    if (workspaceIdFromToken && workspaceIdFromToken !== workspaceIdFromUrl) {
        return NextResponse.json(
          { success: false, error: 'Token de API não pertence a este workspace' },
          { status: 403 }
        );
    }
    const workspaceId = workspaceIdFromUrl;

    try {
      // Verificar autenticação
      const userId = await getCurrentUserId(authedReq);
      if (!userId && !workspaceIdFromToken) {
        return NextResponse.json(
          { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
          { status: 401 }
        );
      }

       // Verificar permissão do usuário (se via sessão)
      if (userId) {
          const membership = await prisma.workspaceMember.findFirst({
            where: { workspace_id: workspaceId, user_id: userId },
          });
          let isOwner = false;
          if (!membership) {
            const workspace = await prisma.workspace.findUnique({
              where: { id: workspaceId }, select: { owner_id: true },
            });
            if (workspace?.owner_id === userId) isOwner = true;
          }
          if (!membership && !isOwner) {
            return NextResponse.json(
              { success: false, error: 'Acesso proibido para deletar deal (permissão de usuário)' },
              { status: 403 }
            );
          }
      }

      // Deletar o Deal
      const deleteResult = await prisma.deal.deleteMany({
        where: { id: dealId, workspace_id: workspaceId },
      });

      if (deleteResult.count === 0) {
        return NextResponse.json(
          { success: false, error: 'Deal não encontrado ou não pertence a este workspace' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, message: 'Deal deletado com sucesso' }, { status: 200 });

    } catch (error: any) {
      console.error('Erro ao deletar deal:', error);
       // Tratar erro P2025 (Registro não encontrado para deletar)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
           return NextResponse.json(
            { success: false, error: 'Deal não encontrado para deleção.' },
            { status: 404 }
          );
      }
      return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
    }
  });
} 