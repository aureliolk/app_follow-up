// app/api/follow-up/funnel-stages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Endpoint para listar os estágios do funil
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const campaignId = searchParams.get('campaignId');
    
    // Se tiver um campaignId, buscar estágios associados à campanha específica
    if (campaignId) {
      const campaign = await prisma.followUpCampaign.findUnique({
        where: { id: campaignId },
        include: {
          stages: {
            orderBy: { order: 'asc' }
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
      
      return NextResponse.json({
        success: true,
        data: campaign.stages
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
    const { name, description, order } = body;
    
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
      const lastStage = await prisma.followUpFunnelStage.findFirst({
        orderBy: { order: 'desc' }
      });
      
      stageOrder = lastStage ? lastStage.order + 1 : 1;
    }
    
    // Criar o estágio
    const stage = await prisma.followUpFunnelStage.create({
      data: {
        name,
        description,
        order: stageOrder
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
    const { id, name, description, order } = body;
    
    if (!id || !name) {
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
    
    // Atualizar o estágio
    const updatedStage = await prisma.followUpFunnelStage.update({
      where: { id },
      data: {
        name,
        description,
        order: order !== undefined ? order : existingStage.order
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
    
    // Excluir o estágio
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