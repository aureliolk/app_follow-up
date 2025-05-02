import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth/auth-utils';
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';

// Helper function para verificar permissão (evita repetição)
async function checkPermission(
  request: NextRequest,
  workspaceId: string,
  requireOwnership: boolean = false
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
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { owner_id: true },
  });
  if (workspace?.owner_id === userId) {
    isOwner = true;
  }

  // Se requer ownership e não é owner, nega acesso
  if (requireOwnership && !isOwner) {
     return {
      userId: null,
      errorResponse: NextResponse.json(
        { success: false, error: 'Acesso proibido: Apenas o dono pode executar esta ação.' },
        { status: 403 }
      ),
    };
  }

  // Se não requer ownership, basta ser membro ou owner
  if (!requireOwnership && !membership && !isOwner) {
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

// PUT handler envolvido pelo middleware
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> } // Parâmetros da rota
) {
  return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
    const awaitedParams = await params;
    const workspaceIdFromUrl = awaitedParams.id;
    const stageId = awaitedParams.stageId;

    if (!workspaceIdFromUrl || !stageId) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID e Stage ID são obrigatórios na URL' },
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
      // Verificar autenticação (sessão ou token)
      const userId = await getCurrentUserId(authedReq);
      if (!userId && !workspaceIdFromToken) {
        return NextResponse.json(
          { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
          { status: 401 }
        );
      }

      // Verificar permissão do usuário (se via sessão)
      // Atualizar stage geralmente requer pelo menos ser membro.
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
              { success: false, error: 'Acesso proibido para atualizar estágio (permissão de usuário)' },
              { status: 403 }
            );
          }
      }
      // Se for API token, assumimos permissão básica ao workspace.
      // Lógica mais granular pode ser necessária se apenas Admins pudessem atualizar.

      // Extrair dados do corpo
      const body = await authedReq.json();
      const { name, order } = body;

      if (name === undefined && order === undefined) {
         return NextResponse.json(
          { success: false, error: 'Pelo menos um campo (name ou order) deve ser fornecido' },
          { status: 400 }
        );
      }
      if (name !== undefined && typeof name !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Campo \'name\' deve ser uma string' },
          { status: 400 }
        );
      }
       if (order !== undefined && typeof order !== 'number') {
        return NextResponse.json(
          { success: false, error: 'Campo \'order\' deve ser um número' },
          { status: 400 }
        );
      }

      const updateData: { name?: string; order?: number } = {};
      if (name !== undefined) updateData.name = name;
      if (order !== undefined) updateData.order = order;

      const updatedStage = await prisma.pipelineStage.updateMany({
        where: { id: stageId, workspace_id: workspaceId },
        data: updateData,
      });

      if (updatedStage.count === 0) {
        return NextResponse.json(
          { success: false, error: 'Estágio não encontrado ou não pertence a este workspace' },
          { status: 404 }
        );
      }

      const resultStage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
      return NextResponse.json({ success: true, data: resultStage }, { status: 200 });

    } catch (error) {
      console.error('Erro ao atualizar estágio do pipeline:', error);
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { success: false, error: 'JSON inválido no corpo da requisição' },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
    }
  });
}

// DELETE handler envolvido pelo middleware
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> } // Parâmetros da rota
) {
  return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
    const awaitedParams = await params;
    const workspaceIdFromUrl = awaitedParams.id;
    const stageId = awaitedParams.stageId;

    if (!workspaceIdFromUrl || !stageId) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID e Stage ID são obrigatórios na URL' },
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
      // Verificar autenticação (sessão ou token)
      const userId = await getCurrentUserId(authedReq);
      if (!userId && !workspaceIdFromToken) {
        return NextResponse.json(
          { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
          { status: 401 }
        );
      }

       // Verificar permissão do usuário (se via sessão)
       // Deletar stage geralmente requer pelo menos ser membro.
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
              { success: false, error: 'Acesso proibido para deletar estágio (permissão de usuário)' },
              { status: 403 }
            );
          }
      }
       // Se for API token, assumimos permissão básica ao workspace.
       // Lógica mais granular pode ser necessária se apenas Admins pudessem deletar.

      // Tentar deletar o stage
      const deleteResult = await prisma.pipelineStage.deleteMany({
        where: { id: stageId, workspace_id: workspaceId },
      });

      if (deleteResult.count === 0) {
        return NextResponse.json(
          { success: false, error: 'Estágio não encontrado ou não pertence a este workspace' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, message: 'Estágio deletado com sucesso' }, { status: 200 });

    } catch (error: any) {
      console.error('Erro ao deletar estágio do pipeline:', error);
      if (error.code === 'P2003') { // Simplificado para pegar erro de FK
         return NextResponse.json(
          { success: false, error: 'Não é possível deletar o estágio pois existem negócios (deals) associados a ele.' },
          { status: 409 } // Conflict
        );
      }
      return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
    }
  });
} 