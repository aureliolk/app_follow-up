// app/api/follow-up/campaigns/funnel-steps/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Endpoint para obter todos os passos de todos os estágios do funil
export async function GET(request: NextRequest) {
  try {
    console.log('Obtendo todos os passos dos estágios do funil');
    
    // Buscar todas as etapas do funil
    const stages = await prisma.followUpFunnelStage.findMany({
      orderBy: { order: 'asc' }
    });
    
    // Para cada etapa, buscar os passos
    const result = [];
    
    for (const stage of stages) {
      const steps = await prisma.followUpStep.findMany({
        where: { funnel_stage_id: stage.id }
      });
      
      // Adicionar os passos ao resultado com metadados da etapa
      steps.forEach(step => {
        result.push({
          ...step,
          stage_name: stage.name,
          stage_order: stage.order
        });
      });
    }
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erro ao buscar passos do funil:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}