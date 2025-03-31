import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Middleware para verificar e validar tokens de API
 * 
 * Este middleware pode ser usado para rotas que precisam suportar
 * autenticação via token de API, além da autenticação padrão por cookie.
 */
export async function withApiTokenAuth(
  req: NextRequest,
  handler: (req: NextRequest, workspaceId?: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  // Verificar se há token de API no header
  const apiToken = req.headers.get('x-api-key');
  
  // Se não houver token, proceder sem autenticação por token
  // (pode ser que o usuário esteja autenticado por cookie)
  if (!apiToken) {
    return handler(req);
  }
  
  try {
    // Verificar se o token é válido e não foi revogado
    const tokenRecord = await prisma.workspaceApiToken.findFirst({
      where: {
        token: apiToken,
        revoked: false,
        OR: [
          { expires_at: null },
          { expires_at: { gt: new Date() } }
        ]
      },
      include: {
        workspace: true
      }
    });
    
    // Se token não for encontrado ou for inválido
    if (!tokenRecord) {
      return NextResponse.json(
        { success: false, error: "Token de API inválido ou expirado" },
        { status: 401 }
      );
    }
    
    // Atualizar último uso do token
    await prisma.workspaceApiToken.update({
      where: { id: tokenRecord.id },
      data: { last_used_at: new Date() }
    });
    
    // Chamar o handler com o ID do workspace associado ao token
    return handler(req, tokenRecord.workspace_id);
    
  } catch (error) {
    console.error('Erro ao validar token de API:', error);
    return NextResponse.json(
      { success: false, error: "Erro ao processar autenticação" },
      { status: 500 }
    );
  }
}