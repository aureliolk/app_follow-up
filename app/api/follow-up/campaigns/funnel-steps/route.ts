// app/api/follow-up/campaigns/funnel-steps/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Endpoint para obter todos os passos de todos os estágios do funil
export async function GET(request: NextRequest) {
  try {
    console.log('Obtendo todos os passos dos estágios do funil');
    
    // Otimização: buscar todos os passos em uma única consulta com include para os estágios
    const steps = await prisma.followUpStep.findMany({
      include: {
        funnel_stage: true, // Incluir o estágio relacionado
      },
      orderBy: {
        funnel_stage: {
          order: 'asc' // Ordenar pelo order do estágio
        }
      }
    });
    
    // Mapear os resultados para incluir os dados do estágio diretamente
    const result = steps.map(step => ({
      ...step,
      stage_name: step.funnel_stage.name,
      stage_order: step.funnel_stage.order
    }));
    
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