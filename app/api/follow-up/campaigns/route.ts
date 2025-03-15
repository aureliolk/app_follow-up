// app/api/follow-up/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') === 'true';
    
    // Construir where com base nos parâmetros
    const where = activeOnly ? { active: true } : {};
    
    // Buscar campanhas
    const campaigns = await prisma.followUpCampaign.findMany({
      where: where as any,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        created_at: true,
      }
    });
    
    // Adicionar contagem de etapas e follow-ups ativos para cada campanha
    const campaignsWithCounts = await Promise.all(campaigns.map(async (campaign) => {
      // Obter os steps da campanha
      const campaignData = await prisma.followUpCampaign.findUnique({
        where: { id: campaign.id },
        select: { steps: true }
      });
      
      // Contar o número de etapas
      const stepsCount = campaignData?.steps 
        ? JSON.parse(campaignData.steps as string).length 
        : 0;
      
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
    const { name, description, steps } = body;
    
    if (!name) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Nome da campanha é obrigatório" 
        }, 
        { status: 400 }
      );
    }
    
    // Criar a campanha no banco de dados
    const campaign = await prisma.followUpCampaign.create({
      data: {
        name,
        description,
        steps: steps || '[]',
        active: true
      }
    });
    
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