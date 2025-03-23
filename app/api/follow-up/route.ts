// app/api/follow-up/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processFollowUpSteps } from './_lib/manager';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/auth-utils';

// Schema de validação para o corpo da requisição
const followUpRequestSchema = z.object({
  clientId: z.string().min(1, "ID do cliente é obrigatório"),
  campaignId: z.string().optional(),
  workspaceId: z.string().optional(), // Novo campo para o workspace
  customerId: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  return withAuth(req, async (req) => {
    try {
      const body = await req.json();
    
    // Validar o corpo da requisição
    const validationResult = followUpRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Dados inválidos", 
          details: validationResult.error.format() 
        }, 
        { status: 400 }
      );
    }

    const { clientId, campaignId, workspaceId, name, email, phone, metadata } = validationResult.data;

    // Se o campaignId não for fornecido, usar a campanha padrão (ativa)
    let targetCampaignId = campaignId;
    
    if (!targetCampaignId) {
      // Buscar uma campanha ativa do workspace se fornecido
      const defaultCampaignWhere: any = { active: true };
      
      if (workspaceId) {
        defaultCampaignWhere.workspace_campaigns = {
          some: { workspace_id: workspaceId }
        };
      }
      
      const defaultCampaign = await prisma.followUpCampaign.findFirst({
        where: defaultCampaignWhere,
        orderBy: { created_at: 'desc' }
      });
      
      if (!defaultCampaign) {
        return NextResponse.json(
          { 
            success: false, 
            error: workspaceId 
              ? "Nenhuma campanha de follow-up ativa encontrada para este workspace" 
              : "Nenhuma campanha de follow-up ativa encontrada"
          }, 
          { status: 404 }
        );
      }
      
      targetCampaignId = defaultCampaign.id;
    } else if (workspaceId) {
      // Verificar se a campanha pertence ao workspace
      const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findUnique({
        where: {
          workspace_id_campaign_id: {
            workspace_id: workspaceId,
            campaign_id: targetCampaignId
          }
        }
      });
      
      if (!campaignBelongsToWorkspace) {
        return NextResponse.json(
          { 
            success: false, 
            error: "A campanha selecionada não pertence ao workspace informado"
          }, 
          { status: 403 }
        );
      }
    }

    // Verificar se o cliente já está em um follow-up ativo para essa campanha
    const existingFollowUp = await prisma.followUp.findFirst({
      where: {
        client_id: clientId,
        campaign_id: targetCampaignId,
        status: { in: ['active', 'paused'] }
      }
    });

    if (existingFollowUp) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Cliente já está em um follow-up ativo", 
          followUpId: existingFollowUp.id,
          status: existingFollowUp.status
        }, 
        { status: 409 }
      );
    }

    // Carregar a campanha para verificar se existe e obter o primeiro estágio
    const campaign = await prisma.followUpCampaign.findUnique({
      where: { id: targetCampaignId },
      include: {
        stages: {
          orderBy: {
            order: 'asc'
          },
          take: 1 // Pegar o primeiro estágio (menor ordem)
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

    // Obter o primeiro estágio do funil da campanha
    const initialStageId = campaign.stages.length > 0 ? campaign.stages[0].id : null;

    // Metadados para incluir o workspace
    let metadataWithWorkspace = metadata || {};
    if (workspaceId) {
      metadataWithWorkspace = {
        ...metadataWithWorkspace,
        workspace_id: workspaceId
      };
    }

    // Criar um novo follow-up
    const newFollowUp = await prisma.followUp.create({
      data: {
        campaign_id: targetCampaignId,
        client_id: clientId,
        status: "active",
        current_step: 0,
        current_stage_id: initialStageId,
        started_at: new Date(),
        next_message_at: new Date(), // Inicia imediatamente
        is_responsive: false,
        // Campos opcionais extras
        metadata: Object.keys(metadataWithWorkspace).length > 0 
          ? JSON.stringify(metadataWithWorkspace) 
          : null,
      }
    });

    // Iniciar o processamento das etapas de follow-up
    processFollowUpSteps(newFollowUp.id);

    return NextResponse.json(
      { 
        success: true, 
        message: "Follow-up iniciado com sucesso", 
        followUpId: newFollowUp.id 
      }, 
      { status: 201 }
    );
    
  } catch (error) {
    console.error("Erro ao iniciar follow-up:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor", 
        details: error instanceof Error ? error.message : "Erro desconhecido"
      }, 
      { status: 500 }
    );
  }
  });
}

// Endpoint GET para listar follow-ups existentes (com paginação)
export async function GET(req: NextRequest) {
  return withAuth(req, async (req) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const clientId = searchParams.get('clientId');
      const status = searchParams.get('status');
      const campaignId = searchParams.get('campaignId');
      const workspaceId = searchParams.get('workspaceId'); // Novo parâmetro
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '10');
      const skip = (page - 1) * limit;

      // Construir where com base nos parâmetros
      const where: any = {};
      
      if (clientId) where.client_id = clientId;
      if (status) where.status = status;
      if (campaignId) where.campaign_id = campaignId;
      
      // Filtrar por workspace se fornecido
      if (workspaceId) {
        // Buscar campanhas associadas ao workspace
        const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
          where: { workspace_id: workspaceId },
          select: { campaign_id: true }
        });
        
        const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);
        
        // Se não houver campanhas associadas ao workspace, retornar lista vazia
        if (campaignIds.length === 0) {
          return NextResponse.json({
            success: true,
            data: [],
            pagination: {
              total: 0,
              page,
              limit,
              pages: 0
            }
          });
        }
        
        // Filtrar follow-ups das campanhas do workspace
        where.campaign_id = { in: campaignIds };
      }

      // Obter total de registros para paginação
      const total = await prisma.followUp.count({ where });

      // Buscar registros com paginação
      const followUps = await prisma.followUp.findMany({
        where,
        include: {
          campaign: {
            select: {
              id: true,
              name: true
            }
          },
          messages: {
            orderBy: { sent_at: 'desc' },
            take: 5
          }
        },
        orderBy: { updated_at: 'desc' },
        skip,
        take: limit
      });

      // Expandir os dados com o nome do estágio atual
      const followUpsWithStageNames = await Promise.all(followUps.map(async (followUp) => {
        // Se temos um current_stage_id, buscar o nome do estágio
        let current_stage_name = null;
        if (followUp.current_stage_id) {
          const stage = await prisma.followUpFunnelStage.findUnique({
            where: { id: followUp.current_stage_id }
          });
          if (stage) {
            current_stage_name = stage.name;
          }
        } else {
          // Se não temos um current_stage_id mas temos mensagens, usar o último estágio conhecido
          const lastMessage = followUp.messages
            .filter(m => m.funnel_stage)
            .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
          
          if (lastMessage?.funnel_stage) {
            current_stage_name = lastMessage.funnel_stage;
          }
        }
        
        // Extrair workspace_id dos metadados
        let workspace_id = null;
        if (followUp.metadata) {
          try {
            const metadata = JSON.parse(followUp.metadata);
            workspace_id = metadata.workspace_id;
          } catch (e) {
            // Ignorar erros de parsing
          }
        }
        
        return {
          ...followUp,
          current_stage_name,
          workspace_id
        };
      }));

      return NextResponse.json({
        success: true,
        data: followUpsWithStageNames,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      console.error("Erro ao listar follow-ups:", error);
      return NextResponse.json(
        { 
          success: false, 
          error: "Erro interno do servidor"
        }, 
        { status: 500 }
      );
    }
  });
}