import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAuth, getCurrentUserId } from '@/lib/auth/auth-utils';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';

// Função auxiliar para obter a sessão atual
async function getSession() {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    console.error("Erro ao obter sessão:", error);
    return null;
  }
}

// Função auxiliar para processar requisições de exclusão permanente do token
async function processPermanentDeleteRequest(req: NextRequest, workspaceId: string, tokenId: string) {
  try {
    const session = await getSession(); // Get the full session
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const isSuperAdmin = session.user.isSuperAdmin;

    // Verificar se o usuário tem acesso ao workspace (se não for super admin)
    let hasAccess = false;
    if (isSuperAdmin) {
        hasAccess = true;
    } else {
        const memberAccess = await prisma.workspaceMember.findFirst({
            where: {
                workspace_id: workspaceId,
                user_id: userId as string,
                 // TODO: Consider checking for specific roles (e.g., ADMIN, OWNER) if needed
            },
        });

        const workspaceOwner = await prisma.workspace.findFirst({
            where: {
                id: workspaceId,
                owner_id: userId as string,
            }
        });
        hasAccess = !!memberAccess || !!workspaceOwner;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Acesso negado a este workspace ou operação não permitida" },
        { status: 403 }
      );
    }

    // Verificar se o token existe e pertence ao workspace
    const token = await prisma.workspaceApiToken.findFirst({
      where: {
        id: tokenId,
        workspace_id: workspaceId,
      },
    });

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token não encontrado" },
        { status: 404 }
      );
    }

    // Verificar se o token está revogado (só podemos excluir tokens revogados)
    if (!token.revoked) {
      return NextResponse.json(
        { success: false, error: "Somente tokens revogados podem ser excluídos permanentemente" },
        { status: 400 }
      );
    }

    // Excluir o token permanentemente
    await prisma.workspaceApiToken.delete({
      where: {
        id: tokenId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Token excluído permanentemente",
    });
  } catch (error) {
    console.error('Erro ao excluir token permanentemente:', error);
    return NextResponse.json(
      { success: false, error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// Função auxiliar para processar requisições de revogação de token
async function processRevokeTokenRequest(req: NextRequest, workspaceId: string, tokenId: string) {
  try {
    const session = await getSession(); // Get the full session
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const isSuperAdmin = session.user.isSuperAdmin;

    // Verificar se o usuário tem acesso ao workspace (se não for super admin)
    let hasAccess = false;
    if (isSuperAdmin) {
        hasAccess = true;
    } else {
        const memberAccess = await prisma.workspaceMember.findFirst({
            where: {
                workspace_id: workspaceId,
                user_id: userId as string,
                 // TODO: Consider checking for specific roles (e.g., ADMIN, OWNER) if needed
            },
        });

        const workspaceOwner = await prisma.workspace.findFirst({
            where: {
                id: workspaceId,
                owner_id: userId as string,
            }
        });
        hasAccess = !!memberAccess || !!workspaceOwner;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Acesso negado a este workspace ou operação não permitida" },
        { status: 403 }
      );
    }

    // Verificar se o token existe e pertence ao workspace
    const token = await prisma.workspaceApiToken.findFirst({
      where: {
        id: tokenId,
        workspace_id: workspaceId,
      },
    });

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token não encontrado" },
        { status: 404 }
      );
    }

    // Revogar o token (não deletamos para manter o histórico)
    await prisma.workspaceApiToken.update({
      where: {
        id: tokenId,
      },
      data: {
        revoked: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Token revogado com sucesso",
    });
  } catch (error) {
    console.error('Erro ao revogar token:', error);
    return NextResponse.json(
      { success: false, error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// Revogar um token de API específico (soft delete)
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; tokenId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }

  const params = await props.params;
  await Promise.resolve(); // Workaround for params issue

  const workspaceId = params.id;
  const tokenId = params.tokenId;

  return processRevokeTokenRequest(request, workspaceId, tokenId);
}

// Excluir permanentemente um token (hard delete)
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; tokenId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }

  const params = await props.params;
  await Promise.resolve(); // Workaround for params issue

  const workspaceId = params.id;
  const tokenId = params.tokenId;

  try {
    // Verificar se o cabeçalho de exclusão permanente foi fornecido
    const permanentDelete = request.headers.get('x-permanent-delete');
    
    if (permanentDelete !== 'true') {
      return NextResponse.json(
        { success: false, error: "Cabeçalho x-permanent-delete não encontrado" },
        { status: 400 }
      );
    }
    
    return processPermanentDeleteRequest(request, workspaceId, tokenId);
  } catch (error) {
    console.error("Erro de autenticação:", error);
    return NextResponse.json(
      { success: false, error: "Erro de autenticação" },
      { status: 500 }
    );
  }
}