import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, getCurrentUserId } from '@/lib/auth/auth-utils';

// Função auxiliar para processar requisições de exclusão permanente do token
async function processPermanentDeleteRequest(req: NextRequest, workspaceId: string, tokenId: string) {
  try {
    const userId = await getCurrentUserId(req);

    // Verificar se o usuário tem acesso ao workspace
    const memberAccess = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: workspaceId,
        user_id: userId as string,
      },
    });

    const workspaceOwner = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        owner_id: userId as string,
      }
    });

    if (!memberAccess && !workspaceOwner) {
      return NextResponse.json(
        { success: false, error: "Acesso negado a este workspace" },
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
    const userId = await getCurrentUserId(req);

    // Verificar se o usuário tem acesso ao workspace
    const memberAccess = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: workspaceId,
        user_id: userId as string,
      },
    });

    const workspaceOwner = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        owner_id: userId as string,
      }
    });

    if (!memberAccess && !workspaceOwner) {
      return NextResponse.json(
        { success: false, error: "Acesso negado a este workspace" },
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
  req: NextRequest,
  context: { params: { id: string; tokenId: string } }
) {
  // Extract parameters from context before passing to async function
  const { id: workspaceId, tokenId } = context.params;
  
  // Use withAuth with the extracted parameters
  return withAuth(req, async (req) => {
    return processRevokeTokenRequest(req, workspaceId, tokenId);
  });
}

// Excluir permanentemente um token (hard delete)
export async function PATCH(
  req: NextRequest,
  context: { params: { id: string; tokenId: string } }
) {
  // Extract parameters from context before passing to async function
  const { id: workspaceId, tokenId } = context.params;
  
  // Use withAuth with the extracted parameters
  return withAuth(req, async (req) => {
    // Verificar se o cabeçalho de exclusão permanente foi fornecido
    const permanentDelete = req.headers.get('x-permanent-delete');
    
    if (permanentDelete !== 'true') {
      return NextResponse.json(
        { success: false, error: "Cabeçalho x-permanent-delete não encontrado" },
        { status: 400 }
      );
    }
    
    return processPermanentDeleteRequest(req, workspaceId, tokenId);
  });
}