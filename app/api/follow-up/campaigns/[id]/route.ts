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

// app/api/follow-up/campaigns/[id]/route.ts - Função GET
export async function GET(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url);
  
  // Verificar workspace ID nos parâmetros da solicitação
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId');
  
  try {
    // Verificar se a campanha pertence ao workspace (se workspaceId fornecido)
    if (workspaceId) {
      const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findFirst({
        where: { 
          workspace_id: workspaceId,
          campaign_id: id
        }
      });
      
      // Se não encontrar relação e o workspace for fornecido, retornar erro
      if (!campaignBelongsToWorkspace) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Campanha não encontrada neste workspace"
          }, 
          { status: 404 }
        );
      }
    }
    
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
          }
          // Removemos a ordenação aqui para ordenar manualmente depois
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
    
    // Mapear os passos e incluir informações da etapa
    const mappedSteps = campaign.campaign_steps.map(step => ({
      id: step.id,
      stage_id: step.funnel_stage_id,
      stage_name: step.funnel_stage.name,
      template_name: step.template_name,
      wait_time: step.wait_time,
      message: step.message_content,
      category: step.message_category || 'Utility',
      auto_respond: step.auto_respond,
      stage_order: step.funnel_stage.order,
      wait_time_ms: step.wait_time_ms
    }));
    
    // Ordenar os passos primeiro pela ordem da etapa (stage_order) e depois pelo tempo de espera (wait_time_ms)
    const formattedSteps = mappedSteps.sort((a, b) => {
      // Primeiro, ordenar por stage_order
      if (a.stage_order !== b.stage_order) {
        return a.stage_order - b.stage_order;
      }
      
      // Se estiverem na mesma etapa, ordenar pelo tempo de espera
      return a.wait_time_ms - b.wait_time_ms;
    });
    
    // Log para depuração
    console.log(`Campanha ${id}: ${formattedSteps.length} estágios ordenados`);
    
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
// app/api/follow-up/campaigns/[id]/route.ts - Função PUT
export async function PUT(request: NextRequest) {
  const id = extractIdFromUrl(request.url);

  try {
    const body = await request.json();
    const { name, description, steps, active, workspaceId } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Nome da campanha é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se a campanha existe
    const existingCampaign = await prisma.followUpCampaign.findUnique({
      where: { id }
    });

    if (!existingCampaign) {
      return NextResponse.json(
        { success: false, error: "Campanha não encontrada" },
        { status: 404 }
      );
    }
    
    // Se workspaceId for fornecido, verificar se a campanha pertence ao workspace
    if (workspaceId) {
      const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findFirst({
        where: { 
          workspace_id: workspaceId,
          campaign_id: id
        }
      });
      
      if (!campaignBelongsToWorkspace) {
        // Se não existir relação, criar uma
        await prisma.workspaceFollowUpCampaign.create({
          data: {
            workspace_id: workspaceId,
            campaign_id: id
          }
        });
      }
    }

    // Usar transação para garantir integridade dos dados
    const result: any = await prisma.$transaction(async (tx) => {
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
        // Obter IDs dos passos existentes
        const existingStepIds = steps
          .filter(step => step.id)
          .map(step => step.id);

        // Excluir passos que não estão mais na lista
        await tx.followUpStep.deleteMany({
          where: {
            campaign_id: id,
            id: {
              notIn: existingStepIds.length > 0 ? existingStepIds : ['dummy-id-to-prevent-deleting-all']
            }
          }
        });

        // Atualizar ou criar passos
        for (const step of steps) {
          // Função para calcular wait_time_ms
          const calculateWaitTimeMs = (timeStr: string): number => {
            // Extrair números do texto
            const extractNumbers = (text: string): number => {
              const match = text.match(/(\d+)/);
              return match ? parseInt(match[1]) : 30; // Default 30 se não encontrar
            };

            if (timeStr.toLowerCase().includes("minuto")) {
              return extractNumbers(timeStr) * 60 * 1000;
            } else if (timeStr.toLowerCase().includes("hora")) {
              return extractNumbers(timeStr) * 60 * 60 * 1000;
            } else if (timeStr.toLowerCase().includes("dia")) {
              return extractNumbers(timeStr) * 24 * 60 * 60 * 1000;
            }

            // Formato abreviado: "30m", "2h", "1d"
            const match = timeStr.match(/^(\d+)([mhd])$/i);
            if (match) {
              const value = parseInt(match[1]);
              const unit = match[2].toLowerCase();

              if (unit === 'm') return value * 60 * 1000;
              if (unit === 'h') return value * 60 * 60 * 1000;
              if (unit === 'd') return value * 24 * 60 * 60 * 1000;
            }

            // Se só tiver números, assume minutos
            if (/^\d+$/.test(timeStr.trim())) {
              return parseInt(timeStr.trim()) * 60 * 1000;
            }

            return 30 * 60 * 1000; // Default 30 minutos
          };

          const stepData = {
            campaign_id: id,
            funnel_stage_id: step.stage_id,
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
            },
            orderBy: {
              wait_time_ms: 'asc'
            }
          }
        }
      });
    });

    // Formatar passos para o formato esperado pelo frontend
    const formattedSteps = result.campaign_steps.map((step: any) => ({
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
      { success: false, error: "Erro interno do servidor" },
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
  
  // Obter o workspaceId dos parâmetros de consulta
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId');

  try {
    // Se o workspaceId for fornecido, verificar se a campanha pertence ao workspace
    if (workspaceId) {
      const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findFirst({
        where: { 
          workspace_id: workspaceId,
          campaign_id: id
        }
      });
      
      if (!campaignBelongsToWorkspace) {
        return NextResponse.json(
          {
            success: false,
            error: "Campanha não encontrada neste workspace"
          },
          { status: 404 }
        );
      }
    }
  
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

    // Usar transação para excluir a campanha e suas associações
    await prisma.$transaction(async (tx) => {
      // 1. Excluir associações de workspace
      await tx.workspaceFollowUpCampaign.deleteMany({
        where: { campaign_id: id }
      });
      
      // 2. Excluir a campanha
      await tx.followUpCampaign.delete({
        where: { id }
      });
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