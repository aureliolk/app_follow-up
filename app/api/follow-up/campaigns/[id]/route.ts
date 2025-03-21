// app/api/follow-up/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Função auxiliar para extrair ID do URL
function extractIdFromUrl(url: string): string {
  // Criar um objeto URL para facilitar a manipulação
  const urlObj = new URL(url);
  // Obter o caminho sem query parameters
  const pathname = urlObj.pathname;
  // Dividir o caminho e pegar o último segmento
  const parts = pathname.split('/');
  return parts[parts.length - 1]; // Pegar o último segmento da URL
}

export async function GET(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url);
  
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
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url);
  
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
    
    // Se steps for fornecido, serializá-lo com validação
    if (steps !== undefined) {
      try {
        if (Array.isArray(steps) || (typeof steps === 'object' && steps !== null)) {
          // Registrar o que estamos processando para debug
          console.log(`Processando steps da campanha ${id}, tipo:`, typeof steps);
          
          // Converter objeto/array para string JSON
          updateData.steps = JSON.stringify(steps);
          
          // Log após a serialização
          console.log(`Steps serializados para campanha ${id}:`, updateData.steps.substring(0, 100) + (updateData.steps.length > 100 ? '...' : ''));
        } else if (typeof steps === 'string') {
          // Verificar se a string é um JSON válido
          if (steps.trim() === '' || steps === '[]') {
            // String vazia ou array vazio em string, usar array vazio
            updateData.steps = '[]';
          } else {
            // Validar se é JSON válido
            JSON.parse(steps); // Isso vai lançar erro se não for válido
            updateData.steps = steps;
          }
        } else {
          // Valor inválido, usar array vazio
          console.warn(`Valor de steps inválido para campanha ${id}, tipo: ${typeof steps}, usando array vazio`);
          updateData.steps = '[]';
        }
      } catch (err) {
        console.error(`Erro ao processar steps para campanha ${id}:`, err);
        console.error(`Conteúdo de steps: ${typeof steps === 'string' ? steps.substring(0, 100) : JSON.stringify(steps).substring(0, 100)}`);
        // Em caso de erro, definir como array vazio
        updateData.steps = '[]';
      }
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

// Endpoint para excluir uma campanha
export async function DELETE(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url);
  
  try {
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
    
    // Excluir a campanha
    await prisma.followUpCampaign.delete({
      where: { id }
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