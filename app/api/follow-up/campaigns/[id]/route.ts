// app/api/follow-up/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Função auxiliar para extrair ID do URL
function extractIdFromUrl(url: string): string {
  // Criar um objeto URL para facilitar a manipulação
  const urlObj = new URL(url);
  // Obter o caminho sem query parameters
  const pathname = urlObj.pathname;
  // Dividir o caminho e pegar o último segmento
  const parts = pathname.split('/');
  return parts[parts.length - 1]; // Pegar o último segmento da URL
}

export async function GET(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url);
  
  try {
    // Buscar a campanha incluindo os estágios e os passos relacionados
    const campaign = await prisma.followUpCampaign.findUnique({
      where: { id },
      include: {
        stages: {
          select: {
            id: true,
            name: true,
            order: true,
            description: true
          },
          orderBy: {
            order: 'asc'
          }
        },
        campaign_steps: {
          include: {
            funnel_stage: true
          },
          orderBy: {
            wait_time_ms: 'asc'
          }
        }
      }
    });
    
    if (!campaign) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Campanha não encontrada"
        }, 
        { status: 404 }
      );
    }

    // Formatar os passos para manter compatibilidade com o formato anterior
    const formattedSteps = campaign.campaign_steps.map(step => ({
      id: step.id,
      stage_id: step.funnel_stage_id,
      stage_name: step.funnel_stage.name,
      template_name: step.template_name,
      wait_time: step.wait_time,
      message: step.message_content,
      category: step.message_category || 'Utility',
      auto_respond: step.auto_respond,
      stage_order: step.funnel_stage.order // Incluir a ordem da etapa do funil
    }));

    // Estruturar a resposta no formato esperado pelo frontend
    const responseData = {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      active: campaign.active,
      steps: formattedSteps,
      stages: campaign.stages
    };
    
    return NextResponse.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error("Erro ao buscar detalhes da campanha:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Endpoint para atualizar uma campanha
export async function PUT(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url);
  
  try {
    const body = await request.json();
    const { name, description, steps, active } = body;
    
    if (!name) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Nome da campanha é obrigatório"
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se a campanha existe
    const existingCampaign = await prisma.followUpCampaign.findUnique({
      where: { id }
    });
    
    if (!existingCampaign) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Campanha não encontrada"
        }, 
        { status: 404 }
      );
    }

    // Usar transação para garantir integridade dos dados
    const result = await prisma.$transaction(async (tx) => {
      // 1. Atualizar dados básicos da campanha
      const updatedCampaign = await tx.followUpCampaign.update({
        where: { id },
        data: {
          name,
          description,
          active: active !== undefined ? active : existingCampaign.active
        }
      });
      
      // 2. Se passos forem fornecidos, atualizar os passos
      if (steps && Array.isArray(steps)) {
        // Identificar IDs dos passos existentes 
        const existingStepIds = steps.filter(step => step.id).map(step => step.id);
        
        // Remover passos que não estão mais na lista
        await tx.followUpStep.deleteMany({
          where: {
            campaign_id: id,
            id: {
              notIn: existingStepIds
            }
          }
        });
        
        // Atualizar ou criar passos
        for (const step of steps) {
          const stepData = {
            funnel_stage_id: step.stage_id,
            campaign_id: id,
            name: step.template_name,
            template_name: step.template_name,
            wait_time: step.wait_time,
            wait_time_ms: calculateWaitTimeMs(step.wait_time),
            message_content: step.message,
            message_category: step.category || 'Utility',
            auto_respond: step.auto_respond !== undefined ? step.auto_respond : true
          };
          
          if (step.id) {
            // Atualizar passo existente
            await tx.followUpStep.update({
              where: { id: step.id },
              data: stepData
            });
          } else {
            // Criar novo passo
            await tx.followUpStep.create({
              data: stepData
            });
          }
        }
      }
      
      // Buscar a campanha atualizada com todos os relacionamentos
      return await tx.followUpCampaign.findUnique({
        where: { id },
        include: {
          stages: {
            select: {
              id: true,
              name: true,
              order: true,
              description: true
            },
            orderBy: {
              order: 'asc'
            }
          },
          campaign_steps: {
            include: {
              funnel_stage: true
            }
          }
        }
      });
    });
    
    // Formatar passos para o formato esperado pelo frontend
    const formattedSteps = result.campaign_steps.map(step => ({
      id: step.id,
      stage_id: step.funnel_stage_id,
      stage_name: step.funnel_stage.name,
      template_name: step.template_name,
      wait_time: step.wait_time,
      message: step.message_content,
      category: step.message_category || 'Utility',
      auto_respond: step.auto_respond,
      stage_order: step.funnel_stage.order // Incluir a ordem da etapa do funil
    }));
    
    // Estruturar resposta
    const responseData = {
      id: result.id,
      name: result.name,
      description: result.description,
      active: result.active,
      steps: formattedSteps,
      stages: result.stages
    };
    
    return NextResponse.json({
      success: true,
      message: "Campanha atualizada com sucesso",
      data: responseData
    });
    
  } catch (error) {
    console.error("Erro ao atualizar campanha:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Função auxiliar para calcular tempo de espera em ms
function calculateWaitTimeMs(waitTime: string): number {
  if (!waitTime) return 30 * 60 * 1000; // Padrão: 30 minutos
  
  // Regex para extrair números e unidades
  const regex = /(\d+)\s*(min|minutos?|h|horas?|dias?)/i;
  const match = waitTime.match(regex);
  
  if (!match) return 30 * 60 * 1000;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit.startsWith('min')) {
    return value * 60 * 1000;
  } else if (unit.startsWith('h')) {
    return value * 60 * 60 * 1000;
  } else if (unit.startsWith('d')) {
    return value * 24 * 60 * 60 * 1000;
  }
  
  return 30 * 60 * 1000;
}

// Endpoint para excluir uma campanha
export async function DELETE(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url);
  
  try {
    // Verificar se a campanha existe
    const existingCampaign = await prisma.followUpCampaign.findUnique({
      where: { id },
      include: {
        follow_ups: {
          where: {
            status: { in: ['active', 'paused'] }
          }
        }
      }
    });
    
    if (!existingCampaign) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Campanha não encontrada"
        }, 
        { status: 404 }
      );
    }

    // Opcionalmente, você pode desativar follow-ups ativos antes de excluir
    if (existingCampaign.follow_ups.length > 0) {
      await prisma.followUp.updateMany({
        where: {
          campaign_id: id,
          status: { in: ['active', 'paused'] }
        },
        data: {
          status: 'cancelled',
          completed_at: new Date()
        }
      });
    }
    
    // Excluir a campanha
    await prisma.followUpCampaign.delete({
      where: { id }
    });
    
    return NextResponse.json({
      success: true,
      message: "Campanha excluída com sucesso"
    });
    
  } catch (error) {
    console.error("Erro ao excluir campanha:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}