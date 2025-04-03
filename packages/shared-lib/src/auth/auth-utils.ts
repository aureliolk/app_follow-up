// lib/auth/auth-utils.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/packages/shared-lib/src/db';

// Middleware utility for checking authentication in API routes
export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  // Verificar API key para testes ou tokens de API
  const apiKey = req.headers.get('x-api-key');
  const testApiKey = 'test-api-key-123456'; // Chave fixa para testes
  
  if (apiKey === testApiKey) {
    // Se a API key para testes for válida, permitir o acesso
    console.log('Acesso via API key de teste');
    return handler(req);
  }
  
  // Verificar se é um token de API válido
  if (apiKey && apiKey.startsWith('wsat_')) {
    try {
      // Verificar se o token é válido e não foi revogado
      const tokenRecord = await prisma.workspaceApiToken.findFirst({
        where: {
          token: apiKey,
          revoked: false,
          OR: [
            { expires_at: null },
            { expires_at: { gt: new Date() } }
          ]
        }
      });
      
      if (tokenRecord) {
        // Atualizar último uso do token
        await prisma.workspaceApiToken.update({
          where: { id: tokenRecord.id },
          data: { last_used_at: new Date() }
        });
        
        console.log(`Acesso via token de API (workspace: ${tokenRecord.workspace_id})`);
        return handler(req);
      }
    } catch (error) {
      console.error('Erro ao validar token de API:', error);
    }
  }

  // Get the token from the request
  const token = await getToken({ req });

  // If there's no token, the user is not authenticated
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Não autorizado - Autenticação necessária' },
      { status: 401 }
    );
  }

  // Token exists, proceed with the handler
  return handler(req);
}

// Middleware utility for checking super admin status
export async function withSuperAdminCheck(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  // Verificar API key para testes
  const apiKey = req.headers.get('x-api-key');
  const testApiKey = 'test-api-key-123456'; // Chave fixa para testes
  
  if (apiKey === testApiKey) {
    // Se a API key para testes for válida, permitir o acesso
    console.log('Acesso via API key de teste (super admin)');
    return handler(req);
  }
  
  // Get the token from the request
  const token = await getToken({ req });

  // If there's no token, the user is not authenticated
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Não autorizado - Autenticação necessária' },
      { status: 401 }
    );
  }

  // Check for super admin status
  if (!token.isSuperAdmin) {
    return NextResponse.json(
      { success: false, error: 'Proibido - Acesso de super admin necessário' },
      { status: 403 }
    );
  }

  // Token exists and user is super admin, proceed with the handler
  return handler(req);
}

// Get the current user ID from token
export async function getCurrentUserId(
  req: NextRequest
): Promise<string | null> {
  const token = await getToken({ req });
  return token?.id as string || null;
}