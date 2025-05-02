// app/api/workspaces/[id]/pipeline/stages/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth/auth-utils';
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';

// GET handler
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // Recuperar params aqui
) {
  // Chamar o middleware, passando a requisição e o handler real
  return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
    const awaitedParams = await params; // Aguardar params dentro do handler
    const workspaceIdFromUrl = awaitedParams.id;

    if (!workspaceIdFromUrl) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID não encontrado na URL' },
        { status: 400 }
      );
    }

    // Validar se o token (se existir) corresponde ao workspace da URL
    if (workspaceIdFromToken && workspaceIdFromToken !== workspaceIdFromUrl) {
        return NextResponse.json(
          { success: false, error: 'Token de API não pertence a este workspace' },
          { status: 403 } // Forbidden
        );
    }

    const workspaceId = workspaceIdFromUrl; // Usar o workspaceId da URL após validação

    try {
      // Usar authedReq que pode ter sido modificada pelo middleware (embora não neste caso)
      const userId = await getCurrentUserId(authedReq);
      if (!userId && !workspaceIdFromToken) { // Autenticação falhou se não houver sessão nem token válido
        return NextResponse.json(
          { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
          { status: 401 }
        );
      }

      // Lógica de permissão (se houver usuário de sessão)
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
      // Se for API token, acesso ao workspace já foi validado pelo middleware.

      // Buscar os Stages
      const stages = await prisma.pipelineStage.findMany({
        where: { workspace_id: workspaceId },
        orderBy: { order: 'asc' },
      });

      return NextResponse.json({ success: true, data: stages }, { status: 200 });

    } catch (error) {
      console.error('Erro ao buscar estágios do pipeline:', error);
      return NextResponse.json(
        { success: false, error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  });
}

// POST handler
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // Recuperar params aqui
) {
   // Chamar o middleware, passando a requisição e o handler real
  return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
    const awaitedParams = await params; // Aguardar params dentro do handler
    const workspaceIdFromUrl = awaitedParams.id;

    if (!workspaceIdFromUrl) {
      return NextResponse.json(
        { success: false, error: 'Workspace ID não encontrado na URL' },
        { status: 400 }
      );
    }

    // Validar se o token (se existir) corresponde ao workspace da URL
    if (workspaceIdFromToken && workspaceIdFromToken !== workspaceIdFromUrl) {
        return NextResponse.json(
          { success: false, error: 'Token de API não pertence a este workspace' },
          { status: 403 }
        );
    }
    const workspaceId = workspaceIdFromUrl; // Usar o workspaceId da URL após validação

    try {
       // Usar authedReq
      const userId = await getCurrentUserId(authedReq);
      if (!userId && !workspaceIdFromToken) { // Autenticação falhou
        return NextResponse.json(
          { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
          { status: 401 }
        );
      }

      // Lógica de permissão (se houver usuário de sessão)
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
              { success: false, error: 'Acesso proibido para criar estágio (permissão de usuário)' },
              { status: 403 }
            );
          }
      }
      // Se for API token, acesso ao workspace já foi validado.
      // A permissão de *criar* stage via token precisaria de lógica adicional se necessária.

      const body = await authedReq.json(); // Usar authedReq para ler o corpo
      const { name } = body;

      if (!name || typeof name !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Nome do estágio é obrigatório' },
          { status: 400 }
        );
      }

      const lastStage = await prisma.pipelineStage.findFirst({
        where: { workspace_id: workspaceId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });

      const nextOrder = (lastStage?.order ?? -1) + 1;

      const newStage = await prisma.pipelineStage.create({
        data: {
          name,
          workspace_id: workspaceId,
          order: nextOrder,
        },
      });

      return NextResponse.json({ success: true, data: newStage }, { status: 201 });

    } catch (error) {
      console.error('Erro ao criar estágio do pipeline:', error);
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { success: false, error: 'JSON inválido no corpo da requisição' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  });
} 