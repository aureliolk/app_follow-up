// app/api/follow-up/[id]/move-stage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    
    // Usar transação para garantir integridade dos dados
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verificar se o follow-up existe
      const followUp = await tx.followUp.findUnique({
        where: { id },
        include: {
          campaign: true
        }
      });
      
      if (!followUp) {
        throw new Error("Follow-up não encontrado");
      }
      
      // 2. Verificar se o estágio existe (a menos que seja 'unassigned')
      let stageName = "Não atribuído";
      
      if (stageId !== 'unassigned') {
        const stage = await tx.followUpFunnelStage.findUnique({
          where: { id: stageId }
        });
        
        if (!stage) {
          throw new Error("Estágio do funil não encontrado");
        }
        
        stageName = stage.name;
      }
      
      // 3. Atualizar o follow-up com o novo estágio
      const updatedFollowUp = await tx.followUp.update({
        where: { id },
        data: {
          current_stage_id: stageId === 'unassigned' ? null : stageId,
          updated_at: new Date()
        }
      });
      
      // 4. Registrar mudança de estágio no histórico de mensagens
      await tx.followUpMessage.create({
        data: {
          follow_up_id: id,
          step: -1, // Indicar que é uma mudança de estágio, não um passo normal
          content: `Cliente movido para estágio: ${stageName}`,
          category: 'System',
          funnel_stage: stageId === 'unassigned' ? null : stageId,
          template_name: 'stage_change'
        }
      });
      
      return {
        followUp: updatedFollowUp,
        campaignId: followUp.campaign_id,
        stageName
      };
    });
    
    return NextResponse.json({
      success: true,
      message: `Cliente movido para ${result.stageName} com sucesso`,
      data: result.followUp
    });
    
  } catch (error: any) {
    console.error("Erro ao mover cliente para novo estágio:", error);
    
    // Verificar se é um erro conhecido
    if (error.message === "Follow-up não encontrado") {
      return NextResponse.json(
        { 
          success: false, 
          error: "Follow-up não encontrado" 
        }, 
        { status: 404 }
      );
    } else if (error.message === "Estágio do funil não encontrado") {
      return NextResponse.json(
        { 
          success: false, 
          error: "Estágio do funil não encontrado" 
        }, 
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor" 
      }, 
      { status: 500 }
    );
  }
}