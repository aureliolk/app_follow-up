import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAuth, getCurrentUserId } from '@/lib/auth/auth-utils';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import crypto from 'crypto';
import { randomBytes } from 'crypto';

// Função para gerar token criptograficamente seguro
function generateToken() {
  // Formato: wsat_RANDOM_STRING
  // Onde RANDOM_STRING é um string aleatório em base64 (sem caracteres especiais)
  const randomBytes = crypto.randomBytes(32);
  const tokenString = randomBytes.toString('base64').replace(/[+/=]/g, '');
  return `wsat_${tokenString}`;
}

// Função auxiliar para processar requisições de listagem de tokens
async function processListTokensRequest(req: NextRequest, workspaceId: string) {
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

    // Buscar tokens (mas não retornar o valor do token completo)
    const tokens = await prisma.workspaceApiToken.findMany({
      where: {
        workspace_id: workspaceId,
      },
      select: {
        id: true,
        name: true,
        token: false, // Não retornar o token completo por segurança
        created_at: true,
        expires_at: true, 
        last_used_at: true,
        revoked: true,
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      tokens,
    });
  } catch (error) {
    console.error('Erro ao listar tokens:', error);
    return NextResponse.json(
      { success: false, error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// Função auxiliar para processar requisições de criação de tokens
async function processCreateTokenRequest(req: NextRequest, workspaceId: string) {
  try {
    const session = await getSession(); // Get the full session
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const isSuperAdmin = session.user.isSuperAdmin;
    const body = await req.json();

    // Validar o corpo da requisição
    const { name, expires_at } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Nome do token é obrigatório" },
        { status: 400 }
      );
    }

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

    // Gerar um novo token
    const tokenValue = generateToken();

    // Criar o token no banco de dados
    const token = await prisma.workspaceApiToken.create({
      data: {
        name,
        token: tokenValue,
        workspace_id: workspaceId,
        created_by: userId as string,
        expires_at: expires_at ? new Date(expires_at) : null,
      },
      select: {
        id: true,
        name: true,
        created_at: true,
        expires_at: true,
        revoked: true,
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      token: tokenValue, // Retorna o valor do token apenas na criação
      tokenInfo: token,
      message: "Token criado com sucesso",
    });
  } catch (error) {
    console.error('Erro ao criar token:', error);
    return NextResponse.json(
      { success: false, error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// Listar todos os tokens de API para o workspace
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  // Simplified access check, relies on processListTokensRequest for detailed checks
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }

  const params = await props.params;
  await Promise.resolve(); // Workaround for params issue
  const workspaceId = params.id;

  // A função processListTokensRequest já contém a lógica de autenticação e autorização
  return processListTokensRequest(request, workspaceId);
}

// Função auxiliar para obter a sessão atual
async function getSession() {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    console.error("Erro ao obter sessão:", error);
    return null;
  }
}

// Criar um novo token de API
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  // Simplified access check, relies on processCreateTokenRequest for detailed checks
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }

  const params = await props.params;
  // Para resolver o erro "params should be awaited", vamos seguir a documentação oficial do Next.js
  // e primeiro fazer uma operação assíncrona não relacionada aos parâmetros
  await Promise.resolve(); // Operação assíncrona simples

  // Agora é seguro acessar os parâmetros dinâmicos
  const workspaceId = params.id;

  // A função processCreateTokenRequest já contém a lógica de autenticação e autorização
  return processCreateTokenRequest(request, workspaceId);
}