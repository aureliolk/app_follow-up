// app/api/follow-up/resume/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { processFollowUpSteps } from '../_lib/manager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { followUpId } = body;
    
    if (!followUpId) {
      return NextResponse.json(
        { 
          success: false, 
          error: "ID do follow-up é obrigatório" 
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o follow-up existe e está pausado
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId }
    });
    
    if (!followUp) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Follow-up não encontrado" 
        }, 
        { status: 404 }
      );
    }
    
    if (followUp.status !== 'paused') {
      return NextResponse.json(
        { 
          success: false, 
          error: "Este follow-up não está pausado", 
          status: followUp.status 
        }, 
        { status: 400 }
      );
    }
    
    // Atualizar o follow-up para ativo
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status: 'active',
        is_responsive: false,
        next_message_at: new Date() // Definir próxima mensagem para agora
      }
    });
    
    // Processar a próxima etapa
    await processFollowUpSteps(followUpId);
    
    return NextResponse.json({
      success: true,
      message: "Follow-up retomado com sucesso"
    });
    
  } catch (error) {
    console.error("Erro ao retomar follow-up:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor", 
        details: error instanceof Error ? error.message : "Erro desconhecido" 
      }, 
      { status: 500 }
    );
  }
}