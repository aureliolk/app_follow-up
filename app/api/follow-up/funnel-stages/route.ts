// app/api/follow-up/funnel-stages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Endpoint para listar os estágios do funil
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const campaignId = searchParams.get('campaignId');
    
    // Se tiver um campaignId, buscar estágios associados à campanha específica
    if (campaignId) {
      // Verificar se a campanha existe
      const campaignExists = await prisma.followUpCampaign.findUnique({
        where: { id: campaignId }
      });
      
      if (!campaignExists) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Campanha não encontrada"
          }, 
          { status: 404 }
        );
      }
      
      // Buscar estágios diretamente pela relação com a campanha
      const stages = await prisma.followUpFunnelStage.findMany({
        where: {
          campaigns: {
            some: {
              id: campaignId
            }
          }
        },
        orderBy: { order: 'asc' }
      });
      
      // Para cada estágio, buscar contagens adicionais se necessário
      const stagesWithCounts = await Promise.all(stages.map(async (stage) => {
        // Contar o número de passos por estágio
        const stepsCount = await prisma.followUpStep.count({
          where: { funnel_stage_id: stage.id }
        });
        
        return {
          ...stage,
          stepsCount
        };
      }));
      
      console.log(`Encontrados ${stages.length} estágios para a campanha ${campaignId}`);
      
      return NextResponse.json({
        success: true,
        data: stagesWithCounts
      });
    }
    
    // Caso contrário, buscar todos os estágios
    const stages = await prisma.followUpFunnelStage.findMany({
      orderBy: { order: 'asc' }
    });
    
    // Para cada estágio, buscar o número de steps e clientes ativos
    const stagesWithCounts = await Promise.all(stages.map(async (stage) => {
      // Contar o número de passos por estágio
      const stepsCount = await prisma.followUpStep.count({
        where: { funnel_stage_id: stage.id }
      });
      
      // Contar o número de clientes ativos neste estágio
      const activeClientsCount = await prisma.followUp.count({
        where: { 
          current_stage_id: stage.id,
          status: 'active'
        }
      });
      
      return {
        ...stage,
        stepsCount,
        activeClientsCount
      };
    }));
    
    return NextResponse.json({
      success: true,
      data: stagesWithCounts
    });
    
  } catch (error) {
    console.error("Erro ao listar estágios do funil:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Endpoint para criar um novo estágio de funil
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, order, campaignId } = body;
    
    if (!name) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Nome do estágio é obrigatório"
        }, 
        { status: 400 }
      );
    }
    
    // Se não for fornecida uma ordem, colocar no final
    let stageOrder = order;
    if (stageOrder === undefined) {
      // Buscar o último estágio da campanha específica se um ID de campanha for fornecido
      const whereClause = campaignId 
        ? { campaign_id: campaignId }
        : undefined;
      
      const lastStage = await prisma.followUpFunnelStage.findFirst({
        where: whereClause,
        orderBy: { order: 'desc' }
      });
      
      stageOrder = lastStage ? lastStage.order + 1 : 1;
    }
    
    // Verificar se a campanha existe quando fornecido um ID
    if (campaignId) {
      const campaign = await prisma.followUpCampaign.findUnique({
        where: { id: campaignId }
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
    }
    
    // Criar o estágio - usando a relação correta conforme definido no schema
    const stage = await prisma.followUpFunnelStage.create({
      data: {
        name,
        description,
        order: stageOrder,
        // Usar a relação correta no Prisma para many-to-many
        ...(campaignId ? {
          campaigns: {
            connect: {
              id: campaignId
            }
          }
        } : {})
      }
    });
    
    return NextResponse.json(
      { 
        success: true, 
        message: "Estágio criado com sucesso", 
        data: stage 
      }, 
      { status: 201 }
    );
    
  } catch (error) {
    console.error("Erro ao criar estágio do funil:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Endpoint para atualizar um estágio existente
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('🔎 Recebendo requisição PUT para atualizar estágio:', JSON.stringify(body, null, 2));
    
    const { id, name, description, order, campaignId } = body;
    
    if (!id || !name) {
      console.error('❌ Campos obrigatórios ausentes:', { id, name });
      return NextResponse.json(
        { 
          success: false, 
          error: "ID e nome do estágio são obrigatórios"
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o estágio existe
    const existingStage = await prisma.followUpFunnelStage.findUnique({
      where: { id },
      include: {
        campaigns: true
      }
    });
    
    if (!existingStage) {
      console.error(`❌ Estágio não encontrado com ID: ${id}`);
      return NextResponse.json(
        { 
          success: false, 
          error: "Estágio não encontrado"
        }, 
        { status: 404 }
      );
    }
    
    console.log(`✅ Estágio encontrado: ${existingStage.name}, campanhas associadas: ${existingStage.campaigns.length}`);
    
    // Preparar dados para atualização
    const updateData: any = {
      name,
      description,
      order: order !== undefined ? order : existingStage.order
    };
    
    // Se tiver campaignId, adicionar à relação (se ainda não existir)
    if (campaignId) {
      console.log(`🔄 Verificando se o estágio já está associado à campanha: ${campaignId}`);
      const alreadyConnected = existingStage.campaigns.some(campaign => campaign.id === campaignId);
      
      if (!alreadyConnected) {
        console.log(`➕ Adicionando estágio à campanha: ${campaignId}`);
        updateData.campaigns = {
          connect: {
            id: campaignId
          }
        };
      } else {
        console.log(`ℹ️ Estágio já associado à campanha: ${campaignId}`);
      }
    }
    
    console.log(`📝 Atualizando estágio ${id} com dados:`, JSON.stringify(updateData, null, 2));
    
    // Atualizar o estágio
    const updatedStage = await prisma.followUpFunnelStage.update({
      where: { id },
      data: updateData,
      include: {
        // Incluir o número de campanhas associadas para informação
        _count: {
          select: {
            campaigns: true
          }
        }
      }
    });
    
    return NextResponse.json({
      success: true,
      message: "Estágio atualizado com sucesso",
      data: updatedStage
    });
    
  } catch (error) {
    console.error("Erro ao atualizar estágio do funil:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Endpoint para excluir um estágio do funil
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { 
          success: false, 
          error: "ID do estágio é obrigatório"
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o estágio existe
    const existingStage = await prisma.followUpFunnelStage.findUnique({
      where: { id }
    });
    
    if (!existingStage) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Estágio não encontrado"
        }, 
        { status: 404 }
      );
    }
    
    // IMPORTANTE: Verificar se há passos vinculados a este estágio
    const stepsCount = await prisma.followUpStep.count({
      where: { funnel_stage_id: id }
    });
    
    console.log(`Estágio ${id} tem ${stepsCount} passos vinculados`);
    
    if (stepsCount > 0) {
      // Primeiro, remover todos os passos vinculados ao estágio
      console.log(`Removendo ${stepsCount} passos do estágio ${id} antes de excluí-lo`);
      
      await prisma.followUpStep.deleteMany({
        where: { funnel_stage_id: id }
      });
      
      console.log(`Passos removidos com sucesso do estágio ${id}`);
    }
    
    // Agora é seguro excluir o estágio
    await prisma.followUpFunnelStage.delete({
      where: { id }
    });
    
    return NextResponse.json({
      success: true,
      message: "Estágio excluído com sucesso"
    });
    
  } catch (error) {
    console.error("Erro ao excluir estágio do funil:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}