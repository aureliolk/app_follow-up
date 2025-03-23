// app/api/follow-up/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') === 'true';
    const workspaceId = searchParams.get('workspaceId');
    
    // Construir where com base nos parâmetros
    const where: any = activeOnly ? { active: true } : {};
    
    // Se workspaceId estiver presente, filtrar campanhas por workspace
    if (workspaceId) {
      // Buscar IDs de campanhas associadas ao workspace
      const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
        where: { workspace_id: workspaceId },
        select: { campaign_id: true }
      });
      
      const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);
      
      // Se não houver campanhas associadas a este workspace, retornar array vazio
      if (campaignIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: []
        });
      }
      
      // Adicionar filtro de IDs ao where
      where.id = { in: campaignIds };
    }
    
    // Buscar campanhas
    const campaigns = await prisma.followUpCampaign.findMany({
      where: where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        created_at: true,
      }
    });
    
    console.log(campaigns)

    // Adicionar contagem de etapas e follow-ups ativos para cada campanha
    const campaignsWithCounts = await Promise.all(campaigns.map(async (campaign) => {
      // Obter os steps da campanha usando o relacionamento campaign_steps
      const campaignSteps = await prisma.followUpStep.count({
        where: {
          campaign_id: campaign.id
        }
      });
      
      // Contar o número de etapas
      let stepsCount = campaignSteps;
      
      // Contar follow-ups ativos da campanha
      const activeFollowUps = await prisma.followUp.count({
        where: {
          campaign_id: campaign.id,
          status: 'active'
        }
      });
      
      return {
        ...campaign,
        stepsCount,
        activeFollowUps
      };
    }));
    
    return NextResponse.json({
      success: true,
      data: campaignsWithCounts
    });
    
  } catch (error) {
    console.error("Erro ao listar campanhas:", error);
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

// Endpoint para criar uma nova campanha
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, steps, workspaceId } = body;
    
    if (!name) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Nome da campanha é obrigatório"
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o workspaceId foi fornecido
    if (!workspaceId) {
      return NextResponse.json(
        { 
          success: false, 
          error: "ID do workspace é obrigatório"
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o workspace existe
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });
    
    if (!workspace) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Workspace não encontrado"
        }, 
        { status: 404 }
      );
    }
    
    // Usar transação para garantir que a campanha e a associação com workspace são criadas juntas
    const campaign = await prisma.$transaction(async (tx) => {
      // 1. Criar a campanha
      const newCampaign = await tx.followUpCampaign.create({
        data: {
          name,
          description,
          active: true
        }
      });
      
      // 2. Criar associação com o workspace
      await tx.workspaceFollowUpCampaign.create({
        data: {
          workspace_id: workspaceId,
          campaign_id: newCampaign.id
        }
      });
      
      return newCampaign;
    });
    
    // Se houver steps, criar separadamente usando o relacionamento campaign_steps
    if (steps && Array.isArray(steps) && steps.length > 0) {
      for (const step of steps) {
        try {
          // Calcular o tempo de espera em milissegundos
          const waitTimeMs = calculateWaitTimeMs(step.wait_time || '30m');
          
          await prisma.followUpStep.create({
            data: {
              campaign_id: campaign.id,
              funnel_stage_id: step.stage_id,
              name: step.template_name || 'Step',
              template_name: step.template_name || 'Template',
              wait_time: step.wait_time || '30m',
              wait_time_ms: waitTimeMs,
              message_content: step.message || '',
              message_category: step.category || 'Utility',
              auto_respond: step.auto_respond !== undefined ? step.auto_respond : true
            }
          });
        } catch (err) {
          console.error("Erro ao criar step para nova campanha:", err);
        }
      }
    }
    
    return NextResponse.json(
      { 
        success: true, 
        message: "Campanha criada com sucesso", 
        data: campaign 
      }, 
      { status: 201 }
    );
    
  } catch (error) {
    console.error("Erro ao criar campanha:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}