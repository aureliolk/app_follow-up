// app/api/follow-up/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  // Obter o ID da URL diretamente
  const url = request.url;
  const parts = url.split('/');
  const id = parts[parts.length - 1]; // Pegar o último segmento da URL
  
  try {
    const campaign = await prisma.followUpCampaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        steps: true,
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
      data: campaign
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
export async function PUT(request: NextRequest) {
  // Obter o ID da URL diretamente
  const url = request.url;
  const parts = url.split('/');
  const id = parts[parts.length - 1]; // Pegar o último segmento da URL
  
  try {
    const body = await request.json();
    const { name, description, steps, active } = body;
    
    if (!name) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Nome da campanha é obrigatório" 
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se a campanha existe
    const existingCampaign = await prisma.followUpCampaign.findUnique({
      where: { id }
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
    
    // Preparar os dados para atualização
    const updateData: any = {
      name,
      description
    };
    
    // Se steps for fornecido, serializá-lo
    if (steps) {
      updateData.steps = Array.isArray(steps) || typeof steps === 'object' 
        ? JSON.stringify(steps) 
        : steps;
    }
    
    // Se active for fornecido, atualizá-lo
    if (active !== undefined) {
      updateData.active = active;
    }
    
    // Atualizar a campanha
    const updatedCampaign = await prisma.followUpCampaign.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        steps: true
      }
    });
    
    return NextResponse.json({
      success: true,
      message: "Campanha atualizada com sucesso",
      data: updatedCampaign
    });
    
  } catch (error) {
    console.error("Erro ao atualizar campanha:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor" 
      }, 
      { status: 500 }
    );
  }
}