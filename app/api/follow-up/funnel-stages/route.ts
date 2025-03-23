// app/api/follow-up/funnel-stages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Endpoint para listar os estágios do funil
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const campaignId = searchParams.get('campaignId');
    const workspaceId = searchParams.get('workspaceId');
    const timestamp = searchParams.get('t'); // Ignore, apenas para cache busting
    
    console.log(`🔍 GET /api/follow-up/funnel-stages - campaignId: ${campaignId || 'nenhum'}, workspaceId: ${workspaceId || 'nenhum'}`);
    
    // Filtrar por campanha específica
    if (campaignId) {
      // Verificar se a campanha existe
      const campaignExists = await prisma.followUpCampaign.findUnique({
        where: { id: campaignId }
      });
      
      if (!campaignExists) {
        console.error(`❌ Campanha não encontrada: ${campaignId}`);
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
        orderBy: { order: 'asc' },
        include: {
          campaigns: true,
          _count: {
            select: {
              steps: true
            }
          }
        }
      });
      
      // Mapear para o formato esperado pelo frontend
      const formattedStages = stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        description: stage.description,
        order: stage.order,
        created_at: stage.created_at,
        stepsCount: stage._count.steps,
        campaignId // Adicionar o campaignId para facilitar operações no frontend
      }));
      
      console.log(`✅ Encontrados ${stages.length} estágios para a campanha ${campaignId}`);
      
      return NextResponse.json({
        success: true,
        data: formattedStages
      });
    }
    
    // Filtrar por workspace específico
    else if (workspaceId) {
      console.log(`🔍 Buscando estágios para o workspace ${workspaceId}`);
      
      // Buscar campanhas do workspace
      const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
        where: { workspace_id: workspaceId },
        select: { campaign_id: true }
      });
      
      const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);
      
      // Se não houver campanhas neste workspace, retornar lista vazia
      if (campaignIds.length === 0) {
        console.log('⚠️ Nenhuma campanha encontrada para este workspace');
        return NextResponse.json({
          success: true,
          data: []
        });
      }
      
      // Buscar estágios associados a qualquer uma dessas campanhas
      const stages = await prisma.followUpFunnelStage.findMany({
        where: {
          campaigns: {
            some: {
              id: { in: campaignIds }
            }
          }
        },
        orderBy: { order: 'asc' },
        include: {
          campaigns: true,
          _count: {
            select: {
              steps: true
            }
          }
        }
      });
      
      // Mapear para o formato esperado pelo frontend
      const formattedStages = stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        description: stage.description,
        order: stage.order,
        created_at: stage.created_at,
        stepsCount: stage._count.steps,
        campaigns: stage.campaigns.map(c => c.id),
        workspaceId // Adicionar o workspaceId para facilitar operações no frontend
      }));
      
      console.log(`✅ Encontrados ${stages.length} estágios para o workspace ${workspaceId}`);
      
      return NextResponse.json({
        success: true,
        data: formattedStages
      });
    }
    
    // Caso não tenha filtros, buscar todos os estágios
    const stages = await prisma.followUpFunnelStage.findMany({
      orderBy: { order: 'asc' },
      include: {
        campaigns: true,
        _count: {
          select: {
            steps: true
          }
        }
      }
    });
    
    // Mapear para o formato esperado pelo frontend
    const formattedStages = stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      description: stage.description,
      order: stage.order,
      created_at: stage.created_at,
      stepsCount: stage._count.steps,
      campaigns: stage.campaigns.map(c => c.id)
    }));
    
    console.log(`✅ Encontrados ${stages.length} estágios no total`);
    
    return NextResponse.json({
      success: true,
      data: formattedStages
    });
    
  } catch (error) {
    console.error("❌ Erro ao listar estágios do funil:", error);
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
    const { name, description, order, campaignId, workspaceId } = body;
    
    console.log(`🔍 POST /api/follow-up/funnel-stages - dados:`, JSON.stringify(body, null, 2));
    
    if (!name) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Nome do estágio é obrigatório"
        }, 
        { status: 400 }
      );
    }
    
    // Se não for fornecida uma ordem, buscar a última ordem e incrementar
    let stageOrder = order;
    if (stageOrder === undefined) {
      // Buscar o último estágio existente
      const lastStage = await prisma.followUpFunnelStage.findFirst({
        orderBy: { order: 'desc' }
      });
      
      stageOrder = lastStage ? lastStage.order + 1 : 1;
      console.log(`🔢 Ordem não fornecida, usando: ${stageOrder}`);
    }
    
    // Lógica para lidar com campaignId e workspaceId
    let targetCampaignId = campaignId;
    
    // Se tiver workspaceId mas não tiver campaignId, podemos criar o estágio
    // e depois associá-lo a uma campanha específica mais tarde
    if (workspaceId && !campaignId) {
      console.log(`ℹ️ Criando estágio para o workspace ${workspaceId} sem campanha específica`);
      
      // Opcionalmente, podemos buscar a primeira campanha do workspace
      // para associar o estágio a ela
      const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
        where: { workspace_id: workspaceId },
        select: { campaign_id: true },
        take: 1
      });
      
      if (workspaceCampaigns.length > 0) {
        targetCampaignId = workspaceCampaigns[0].campaign_id;
        console.log(`ℹ️ Usando campanha ${targetCampaignId} do workspace`);
      }
    }
    
    // Se tiver campaignId, verificar se a campanha existe
    if (targetCampaignId) {
      const campaign = await prisma.followUpCampaign.findUnique({
        where: { id: targetCampaignId }
      });
      
      if (!campaign) {
        console.error(`❌ Campanha não encontrada: ${targetCampaignId}`);
        return NextResponse.json(
          { 
            success: false, 
            error: "Campanha não encontrada"
          }, 
          { status: 404 }
        );
      }
      
      // Se tiver workspaceId, verificar se a campanha pertence a este workspace
      if (workspaceId) {
        const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findFirst({
          where: {
            workspace_id: workspaceId,
            campaign_id: targetCampaignId
          }
        });
        
        if (!campaignBelongsToWorkspace) {
          console.error(`❌ Campanha ${targetCampaignId} não pertence ao workspace ${workspaceId}`);
          return NextResponse.json(
            { 
              success: false, 
              error: "Campanha não pertence a este workspace"
            }, 
            { status: 403 }
          );
        }
      }
    }
    
    console.log(`🔧 Criando estágio: ${name}, ordem: ${stageOrder}, campaignId: ${campaignId || 'nenhum'}`);
    
    // Criar o estágio com relacionamento correctly definido
    const stage = await prisma.followUpFunnelStage.create({
      data: {
        name,
        description,
        order: stageOrder,
        // Se houver campaignId, conectar à campanha
        ...(campaignId ? {
          campaigns: {
            connect: {
              id: campaignId
            }
          }
        } : {})
      },
      include: {
        campaigns: true
      }
    });
    
    console.log(`✅ Estágio criado com sucesso: ${stage.id}`);
    
    // Formatar o resultado para incluir meta-dados úteis
    const formattedStage = {
      ...stage,
      stepsCount: 0,
      campaignId
    };
    
    return NextResponse.json(
      { 
        success: true, 
        message: "Estágio criado com sucesso", 
        data: formattedStage
      }, 
      { status: 201 }
    );
    
  } catch (error) {
    console.error("❌ Erro ao criar estágio do funil:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Endpoint para atualizar um estágio existente (COMPLETAMENTE REESCRITO)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('🔎 PUT /api/follow-up/funnel-stages - dados:', JSON.stringify(body, null, 2));
    
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
    
    // ABORDAGEM DE DUAS PARTES:
    // 1. Atualizar os metadados diretamente com SQL
    console.log(`🔧 PARTE 1: Atualizando campos básicos do estágio ${id} via SQL`);
    try {
      await prisma.$executeRaw`
        UPDATE "follow_up_schema"."follow_up_funnel_stages" 
        SET name = ${name}, 
            description = ${description || null},
            order = ${order !== undefined ? order : 999}
        WHERE id = ${id};
      `;
      console.log('✅ Atualização SQL concluída com sucesso');
    } catch (sqlError) {
      console.error('❌ Erro na atualização SQL:', sqlError);
    }
    
    // 2. Atualizar o relacionamento com a campanha
    if (campaignId) {
      console.log(`🔧 PARTE 2: Verificando relacionamento com a campanha ${campaignId}`);
      
      // Verificar se o estágio já está associado à campanha
      const existingRelation = await prisma.followUpCampaign.findFirst({
        where: {
          id: campaignId,
          stages: {
            some: {
              id
            }
          }
        }
      });
      
      if (!existingRelation) {
        console.log(`➕ Adicionando relação entre estágio ${id} e campanha ${campaignId}`);
        try {
          // Adicionar relação usando abordagem direta
          await prisma.$executeRaw`
            INSERT INTO "follow_up_schema"."_FollowUpCampaignToFollowUpFunnelStage" ("A", "B")
            VALUES (${campaignId}, ${id})
            ON CONFLICT DO NOTHING;
          `;
          console.log('✅ Relação adicionada com sucesso');
        } catch (relationError) {
          console.error('❌ Erro ao adicionar relação:', relationError);
        }
      } else {
        console.log('ℹ️ Relação já existe, pulando etapa');
      }
    }
    
    // 3. Buscar o estágio atualizado para retornar
    console.log(`🔍 Buscando estágio atualizado ${id}`);
    const updatedStage = await prisma.followUpFunnelStage.findUnique({
      where: { id },
      include: {
        campaigns: true,
        _count: {
          select: {
            steps: true
          }
        }
      }
    });
    
    if (!updatedStage) {
      console.error(`❌ Estágio não encontrado após atualização: ${id}`);
      return NextResponse.json(
        { 
          success: false, 
          error: "Estágio não encontrado após atualização"
        }, 
        { status: 404 }
      );
    }
    
    console.log(`✅ Estágio ${id} atualizado com sucesso`);
    
    // Formatar o resultado para o frontend
    const formattedStage = {
      ...updatedStage,
      stepsCount: updatedStage._count.steps,
      campaignId: campaignId || (updatedStage.campaigns[0]?.id || null)
    };
    
    return NextResponse.json({
      success: true,
      message: "Estágio atualizado com sucesso",
      data: formattedStage
    });
    
  } catch (error) {
    console.error("❌ Erro ao atualizar estágio do funil:", error);
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
    
    console.log(`🔍 DELETE /api/follow-up/funnel-stages - id: ${id}`);
    
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
      where: { id },
      include: {
        steps: true,
        campaigns: true
      }
    });
    
    if (!existingStage) {
      console.error(`❌ Estágio não encontrado: ${id}`);
      return NextResponse.json(
        { 
          success: false, 
          error: "Estágio não encontrado"
        }, 
        { status: 404 }
      );
    }
    
    console.log(`🔍 Estágio ${id} encontrado, passos: ${existingStage.steps.length}, campanhas: ${existingStage.campaigns.length}`);
    
    // ESTRATÉGIA: Remover em várias etapas para evitar erros de integridade referencial
    
    // 1. Primeiro, remover todos os passos vinculados ao estágio
    if (existingStage.steps.length > 0) {
      console.log(`🧹 Removendo ${existingStage.steps.length} passos do estágio ${id}`);
      await prisma.followUpStep.deleteMany({
        where: { funnel_stage_id: id }
      });
    }
    
    // 2. Remover as relações com campanhas (many-to-many)
    if (existingStage.campaigns.length > 0) {
      console.log(`🧹 Removendo relações com ${existingStage.campaigns.length} campanhas`);
      // Criamos um desconectador para cada campanha
      const disconnects = existingStage.campaigns.map(campaign => ({ id: campaign.id }));
      
      await prisma.followUpFunnelStage.update({
        where: { id },
        data: {
          campaigns: {
            disconnect: disconnects
          }
        }
      });
    }
    
    // 3. Finalmente, excluir o estágio
    console.log(`🗑️ Excluindo o estágio ${id}`);
    await prisma.followUpFunnelStage.delete({
      where: { id }
    });
    
    console.log(`✅ Estágio ${id} excluído com sucesso`);
    
    return NextResponse.json({
      success: true,
      message: "Estágio excluído com sucesso"
    });
    
  } catch (error) {
    console.error("❌ Erro ao excluir estágio do funil:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor: " + (error instanceof Error ? error.message : String(error))
      }, 
      { status: 500 }
    );
  }
}