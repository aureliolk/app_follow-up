// app/api/follow-up/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processFollowUpSteps } from './_lib/manager';
import { z } from 'zod';
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';
import { 
  findActiveCampaignForWorkspace,
  isCampaignInWorkspace,
  findActiveFollowUp,
  initializeNewFollowUp
} from './_lib/initializer';

// Schema de validação para o corpo da requisição
const followUpRequestSchema = z.object({
  clientId: z.string().min(1, "ID do cliente é obrigatório"),
  campaignId: z.string().optional(),
  workspaceId: z.string().optional(),
  customerId: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  return withApiTokenAuth(req, async (req, tokenWorkspaceId) => {
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

      const { clientId, campaignId, workspaceId, metadata } = validationResult.data;
      
      // Use o workspaceId do token se fornecido, caso contrário use o do body
      const effectiveWorkspaceId = tokenWorkspaceId || workspaceId;

      // Determinar a campanha a ser usada
      let targetCampaignId : any = campaignId;
      
      if (!targetCampaignId && effectiveWorkspaceId) {
        // Buscar uma campanha ativa para o workspace
        targetCampaignId = await findActiveCampaignForWorkspace(effectiveWorkspaceId);
        
        if (!targetCampaignId) {
          return NextResponse.json(
            { 
              success: false, 
              error: "Nenhuma campanha de follow-up ativa encontrada para este workspace"
            }, 
            { status: 404 }
          );
        }
      } else if (!targetCampaignId) {
        // Se não temos workspace nem campanha específica, buscar qualquer campanha ativa
        const defaultCampaign = await prisma.followUpCampaign.findFirst({
          where: { active: true },
          orderBy: { created_at: 'desc' }
        });
        
        if (!defaultCampaign) {
          return NextResponse.json(
            { 
              success: false, 
              error: "Nenhuma campanha de follow-up ativa encontrada"
            }, 
            { status: 404 }
          );
        }
        
        targetCampaignId = defaultCampaign.id;
      } else if (effectiveWorkspaceId) {
        // Se temos campanha específica e workspace, verificar se a campanha pertence ao workspace
        const belongsToWorkspace = await isCampaignInWorkspace(targetCampaignId, effectiveWorkspaceId);
        
        if (!belongsToWorkspace) {
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
      const existingFollowUp = await findActiveFollowUp(clientId, targetCampaignId);
      
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

      // Criar um novo follow-up utilizando a função de domínio
      const newFollowUp = await initializeNewFollowUp(
        clientId, 
        targetCampaignId, 
        effectiveWorkspaceId,
      );

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
  return withApiTokenAuth(req, async (req, tokenWorkspaceId) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const clientId = searchParams.get('clientId');
      const status = searchParams.get('status');
      const campaignId = searchParams.get('campaignId');
      const queryWorkspaceId = searchParams.get('workspaceId');
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '10');
      const skip = (page - 1) * limit;
      
      // Priorizar o workspaceId do token, caso contrário usar o do query param
      const effectiveWorkspaceId = tokenWorkspaceId || queryWorkspaceId;

      // Construir where com base nos parâmetros
      const where: any = {};
      
      if (clientId) where.client_id = clientId;
      if (status) where.status = status;
      if (campaignId) where.campaign_id = campaignId;
      
      // Filtrar por workspace se fornecido
      if (effectiveWorkspaceId) {
        // Buscar campanhas associadas ao workspace
        const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
          where: { workspace_id: effectiveWorkspaceId },
          select: { campaign_id: true }
        });
        
        if (workspaceCampaigns.length === 0) {
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
        
        const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);
        where.campaign_id = { in: campaignIds };
      }

      // Usar transação para garantir consistência nos dados paginados
      const result = await prisma.$transaction(async (tx) => {
        // 1. Obter total de registros para paginação
        const total = await tx.followUp.count({ where });

        // 2. Buscar registros com paginação e incluir dados relacionados
        const followUps = await tx.followUp.findMany({
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

        // 3. Buscar todos os estágios relevantes numa única consulta
        const stageIds = followUps
          .map(f => f.current_stage_id)
          .filter(id => id) as string[];
          
        const stages = stageIds.length > 0 
          ? await tx.followUpFunnelStage.findMany({
              where: { id: { in: stageIds } }
            })
          : [];
          
        // Criar um mapa de ID para nome do estágio para facilitar a busca
        const stageMap = new Map<string, string>();
        stages.forEach(stage => {
          stageMap.set(stage.id, stage.name);
        });

        // 4. Expandir os dados com o nome do estágio atual
        const followUpsWithStageNames = followUps.map(followUp => {
          // Obter o nome do estágio do mapa criado acima
          let current_stage_name = followUp.current_stage_id 
            ? stageMap.get(followUp.current_stage_id) || null
            : null;
            
          // Se não temos o nome do estágio mas temos mensagens, usar o último estágio conhecido
          if (!current_stage_name && followUp.messages.length > 0) {
            const lastMessage = followUp.messages
              .filter(m => m.funnel_stage)
              .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
            
            if (lastMessage?.funnel_stage) {
              current_stage_name = lastMessage.funnel_stage;
            }
          }
          
          // Extrair workspace_id dos metadados de forma segura
          let workspace_id = null;
         
          
          return {
            ...followUp,
            current_stage_name,
            workspace_id
          };
        });

        return {
          total,
          followUps: followUpsWithStageNames
        };
      });

      return NextResponse.json({
        success: true,
        data: result.followUps,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
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