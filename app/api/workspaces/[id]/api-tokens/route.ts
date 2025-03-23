import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, getCurrentUserId } from '@/lib/auth/auth-utils';
import crypto from 'crypto';

// Função para gerar token criptograficamente seguro
function generateToken() {
  // Formato: wsat_RANDOM_STRING
  // Onde RANDOM_STRING é um string aleatório em base64 (sem caracteres especiais)
  const randomBytes = crypto.randomBytes(32);
  const tokenString = randomBytes.toString('base64').replace(/[+/=]/g, '');
  return `wsat_${tokenString}`;
}

// Listar todos os tokens de API para o workspace
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (req) => {
    try {
      const workspaceId = params.id;
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
  });
}

// Criar um novo token de API
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (req) => {
    try {
      const workspaceId = params.id;
      const userId = await getCurrentUserId(req);
      const body = await req.json();

      // Validar o corpo da requisição
      const { name, expires_at } = body;

      if (!name) {
        return NextResponse.json(
          { success: false, error: "Nome do token é obrigatório" },
          { status: 400 }
        );
      }

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
  });
}