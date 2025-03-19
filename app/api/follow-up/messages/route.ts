// app/api/follow-up/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * GET /api/follow-up/messages
 * Retorna todas as mensagens de um follow-up específico
 * 
 * Parâmetros de query:
 * - followUpId: ID do follow-up
 */
export async function GET(req: NextRequest) {
  try {
    // Obter parâmetros da query
    const url = new URL(req.url);
    const followUpId = url.searchParams.get('followUpId');
    
    // Validação
    if (!followUpId) {
      return NextResponse.json(
        { success: false, error: 'followUpId é obrigatório' },
        { status: 400 }
      );
    }
    
    // Buscar todas as mensagens deste follow-up
    const messages = await prisma.followUpMessage.findMany({
      where: {
        follow_up_id: followUpId
      },
      orderBy: {
        sent_at: 'asc'
      }
    });
    
    // Retornar as mensagens
    return NextResponse.json({
      success: true,
      data: messages
    });
  } catch (error: any) {
    console.error("Erro ao buscar mensagens:", error);
    
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao buscar mensagens' },
      { status: 500 }
    );
  }
}