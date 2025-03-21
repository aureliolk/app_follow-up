// app/api/follow-up/[id]/move-stage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { stageId } = body;
    
    if (!stageId) {
      return NextResponse.json(
        { 
          success: false, 
          error: "ID do estágio é obrigatório" 
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o follow-up existe
    const followUp = await prisma.followUp.findUnique({
      where: { id }
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
    
    // Verificar se o estágio existe (a menos que seja 'unassigned')
    if (stageId !== 'unassigned') {
      const stage = await prisma.followUpFunnelStage.findUnique({
        where: { id: stageId }
      });
      
      if (!stage) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Estágio do funil não encontrado" 
          }, 
          { status: 404 }
        );
      }
    }
    
    // Atualizar o follow-up com o novo estágio
    const updatedFollowUp = await prisma.followUp.update({
      where: { id },
      data: {
        current_stage_id: stageId === 'unassigned' ? null : stageId,
        updated_at: new Date()
      },
      include: {
        campaign: {
          select: {
            name: true
          }
        }
      }
    });
    
    return NextResponse.json({
      success: true,
      message: "Cliente movido para novo estágio com sucesso",
      data: updatedFollowUp
    });
    
  } catch (error) {
    console.error("Erro ao mover cliente para novo estágio:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor" 
      }, 
      { status: 500 }
    );
  }
}