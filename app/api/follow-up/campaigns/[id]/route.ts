// app/api/follow-up/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
// --- CORREÇÃO AQUI ---
import {getCampaignDetails } from '../../_lib/initializer'; // Importar a função específica
// --- FIM DA CORREÇÃO ---

// Função auxiliar para extrair ID (mantida)
function extractIdFromUrl(url: string): string {
  // ... (código mantido)
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const parts = pathname.split('/');
  return parts[parts.length - 1];
}

// Função GET (restante do código mantido, mas a chamada agora deve funcionar)
export async function GET(request: NextRequest) {
  const id = extractIdFromUrl(request.url);
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId');

  try {
    if (workspaceId) {
      const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findFirst({
         where: { workspace_id: workspaceId, campaign_id: id }
      });
      if (!campaignBelongsToWorkspace) {
         return NextResponse.json({ success: false, error: "Campanha não encontrada neste workspace" }, { status: 404 });
      }
    }

    // A importação corrigida deve fazer esta chamada funcionar
    const campaignDetails = await getCampaignDetails(id);

    // Verificar se campaignDetails e campaignDetails.steps existem antes de acessar length
    const stepsLength = campaignDetails?.steps?.length ?? 0;
    console.log(`Campanha ${id}: ${stepsLength} passos ordenados`);


    return NextResponse.json({
      success: true,
      data: campaignDetails
    });

  } catch (error) {
    // Capturar especificamente o erro de "Campanha não encontrada"
     if (error instanceof Error && error.message === "Campanha não encontrada") {
         console.error(`Campanha ${id} não encontrada no banco.`);
         return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
     }
    // Outros erros
    console.error("Erro ao processar solicitação GET da campanha:", error);
    return NextResponse.json({ success: false, error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const id = extractIdFromUrl(request.url);

  try {
    const body = await request.json();
    const { name, description, steps, active, workspaceId, idLumibot, tokenAgentLumibot } = body;
    
    // Log para depuração
    console.log("Dados recebidos para atualização da campanha:", {
      id,
      name,
      description,
      steps: steps?.length || 0,
      active,
      idLumibot,
      tokenAgentLumibot
    });

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
      // Log para depuração antes da atualização
      console.log("Atualizando campanha com dados:", {
        id,
        name,
        description,
        idLumibot,
        tokenAgentLumibot,
        active: active !== undefined ? active : existingCampaign.active
      });
      
      // Atualizar a campanha
      const updatedCampaign = await tx.followUpCampaign.update({
        where: { id },
        data: {
          name,
          description,
          idLumibot,
          tokenAgentLumibot,
          active: active !== undefined ? active : existingCampaign.active
        }
      });
      
      console.log("Campanha atualizada com sucesso:", updatedCampaign.id);

      // 2. Se passos forem fornecidos, atualizar os passos
      if (steps && Array.isArray(steps)) {
        // Obter IDs dos passos existentes
        const existingStepIds = steps
          .filter(step => step.id)
          .map(step => step.id);

        // Buscar os estágios da campanha
        const stages = await tx.followUpFunnelStage.findMany({
          where: { campaign_id: id },
          select: { id: true }
        });
        
        const stageIds = stages.map(stage => stage.id);
        
        // Excluir passos que não estão mais na lista - usando funnel_stage_id em vez de campaign_id
        if (stageIds.length > 0) {
          await tx.followUpStep.deleteMany({
            where: {
              funnel_stage_id: { in: stageIds },
              id: {
                notIn: existingStepIds.length > 0 ? existingStepIds : ['dummy-id-to-prevent-deleting-all']
              }
            }
          });
        }

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

          // Criar dados do passo com todos os campos do modelo atualizado
          const stepData = {
            funnel_stage_id: step.stage_id,
            name: step.template_name,
            template_name: step.template_name,
            category: step.category || 'Utility',
            wait_time: step.wait_time,
            wait_time_ms: calculateWaitTimeMs(step.wait_time),
            message_content: step.message,
            order: 0, // Valor padrão para ordem
            status: "created" // Status padrão
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
              order: true
            },
            orderBy: {
              order: 'asc'
            }
          }
        }
      });
    });

    // Buscar as etapas do funil para esta campanha
    const funnelStages = await prisma.followUpFunnelStage.findMany({
      where: { campaign_id: id }
    });
    
    // Buscar os passos da campanha
    const campaignSteps = await prisma.followUpStep.findMany({
      where: { 
        funnel_stage_id: { 
          in: funnelStages.map(stage => stage.id) 
        } 
      },
      include: { funnel_stage: true },
      orderBy: { wait_time_ms: 'asc' }
    });
    
    // Formatar passos para o formato esperado pelo frontend
    const formattedSteps = campaignSteps.map((step: any) => ({
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

    // Estruturar resposta - incluir os novos campos
    const responseData = {
      id: result.id,
      name: result.name,
      description: result.description,
      active: result.active,
      idLumibot: result.idLumibot,
      tokenAgentLumibot: result.tokenAgentLumibot,
      steps: formattedSteps,
      stages: result.stages
    };

    const response = {
      success: true,
      message: "Campanha atualizada com sucesso",
      data: responseData
    };
    
    console.log("Resposta final:", response);
    
    return NextResponse.json(response);

  } catch (error) {
    console.error("Erro ao atualizar campanha:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
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