// app/api/follow-up/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';
import { getToken } from 'next-auth/jwt'; // Certifique-se que getToken está importado se usado

// Função GET (como definida anteriormente, incluindo a seleção dos campos ai_prompt_*)
export async function GET(req: NextRequest) {
  return withApiTokenAuth(req, async (req, tokenWorkspaceId) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const activeOnly = searchParams.get('active') === 'true';

      const queryWorkspaceId = searchParams.get('workspaceId');
      const workspaceId = queryWorkspaceId || tokenWorkspaceId;

      const where: any = activeOnly ? { active: true } : {};

      if (workspaceId) {
        console.log(`Filtrando campanhas para o workspace: ${workspaceId}`);
        const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
          where: { workspace_id: workspaceId },
          select: { campaign_id: true }
        });
        const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);
        if (campaignIds.length === 0) {
          return NextResponse.json({ success: true, data: [] });
        }
        where.id = { in: campaignIds };
      } else {
        const token = await getToken({ req });
        if (!token?.isSuperAdmin) {
          console.warn("Tentativa de acesso a todas as campanhas sem workspaceId e sem ser super admin");
          return NextResponse.json({
            success: false,
            error: "Workspace ID é obrigatório para esta operação"
          }, { status: 400 });
        }
      }

      // Buscar campanhas, incluindo os novos campos de prompt da IA
      const campaigns = await prisma.followUpCampaign.findMany({
        where: where,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          active: true,
          created_at: true,
          // <<< --- ADICIONAR NOVOS CAMPOS AQUI --- >>>
          ai_prompt_product_name: true,
          ai_prompt_target_audience: true,
          ai_prompt_pain_point: true,
          ai_prompt_main_benefit: true,
          ai_prompt_tone_of_voice: true,
          ai_prompt_extra_instructions: true,
          ai_prompt_cta_link: true,
          ai_prompt_cta_text: true,
          // <<< --- FIM DOS NOVOS CAMPOS --- >>>
        }
      });

      console.log(`Campanhas encontradas (${campaigns.length}):`, campaigns.map(c => c.name));

      // Adicionar contagem de etapas e follow-ups ativos para cada campanha
      const campaignsWithCounts = await Promise.all(campaigns.map(async (campaign) => {
        const campaignSteps = await prisma.followUpStep.count({
          where: {
            funnel_stage: {
              campaign_id: campaign.id
            }
          }
        });
        const activeFollowUps = await prisma.followUp.count({
          where: {
            campaign_id: campaign.id,
            status: 'active'
          }
        });

        // O spread operator (...) já inclui os novos campos buscados
        return {
          ...campaign,
          stepsCount: campaignSteps,
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
  });
}


// --- FUNÇÃO POST ATUALIZADA ---
export async function POST(req: NextRequest) {
  return withApiTokenAuth(req, async (req, tokenWorkspaceId) => {
    try {
      const body = await req.json();
      // Extrair todos os campos possíveis do corpo, incluindo os novos de IA
      const {
        name,
        description,
        steps, // Manter se a criação de steps ainda for feita aqui (verificar se é o caso)
        workspaceId,
        // Novos campos de prompt AI
        ai_prompt_product_name,
        ai_prompt_target_audience,
        ai_prompt_pain_point,
        ai_prompt_main_benefit,
        ai_prompt_tone_of_voice,
        ai_prompt_extra_instructions,
        ai_prompt_cta_link,
        ai_prompt_cta_text
      } = body;

      console.log("Dados recebidos para criar campanha:", body); // Log dos dados recebidos

      if (!name) {
        return NextResponse.json(
          { success: false, error: "Nome da campanha é obrigatório" },
          { status: 400 }
        );
      }

      const effectiveWorkspaceId = tokenWorkspaceId || workspaceId;

      if (!effectiveWorkspaceId) {
        return NextResponse.json(
          { success: false, error: "ID do workspace é obrigatório" },
          { status: 400 }
        );
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: effectiveWorkspaceId }
      });

      if (!workspace) {
        return NextResponse.json(
          { success: false, error: "Workspace não encontrado" },
          { status: 404 }
        );
      }

      // Usar transação para criar campanha e associação
      const campaign = await prisma.$transaction(async (tx) => {
        // 1. Criar a campanha com os novos campos de IA
        const newCampaign = await tx.followUpCampaign.create({
          data: {
            name,
            description: description ?? null, // Usar ?? null para garantir que seja null se não fornecido
            active: true, // Definir como ativa por padrão
            // Adicionar os novos campos de prompt AI
            ai_prompt_product_name: ai_prompt_product_name ?? null,
            ai_prompt_target_audience: ai_prompt_target_audience ?? null,
            ai_prompt_pain_point: ai_prompt_pain_point ?? null,
            ai_prompt_main_benefit: ai_prompt_main_benefit ?? null,
            ai_prompt_tone_of_voice: ai_prompt_tone_of_voice ?? null,
            ai_prompt_extra_instructions: ai_prompt_extra_instructions ?? null,
            ai_prompt_cta_link: ai_prompt_cta_link ?? null,
            ai_prompt_cta_text: ai_prompt_cta_text ?? null,
          }
        });

        console.log(`Campanha criada no DB com ID: ${newCampaign.id}`); // Log de sucesso interno

        // 2. Criar associação com o workspace
        await tx.workspaceFollowUpCampaign.create({
          data: {
            workspace_id: effectiveWorkspaceId,
            campaign_id: newCampaign.id
          }
        });
        console.log(`Associação com Workspace ${effectiveWorkspaceId} criada.`);

        return newCampaign; // Retorna a campanha criada (incluirá os novos campos)
      });


      return NextResponse.json(
        {
          success: true,
          message: "Campanha criada com sucesso",
          data: campaign // Retorna o objeto completo da campanha criada
        },
        { status: 201 }
      );

    } catch (error) {
      console.error("Erro ao criar campanha:", error);
      // Adicionar mais detalhes ao erro, se possível
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("Detalhes do erro:", errorMessage, errorStack);

      return NextResponse.json(
        {
          success: false,
          error: "Erro interno do servidor ao criar campanha",
          details: errorMessage // Incluir a mensagem de erro real pode ajudar no debug
        },
        { status: 500 }
      );
    }
  });
}