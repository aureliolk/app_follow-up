// app/api/follow-up/funnel-steps/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseTimeString } from '../_lib/manager';

// Endpoint para listar os passos de um estágio do funil
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const stageId = searchParams.get('stageId');
    
    if (!stageId) {
      return NextResponse.json(
        { 
          success: false, 
          error: "ID do estágio é obrigatório "
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o estágio existe
    const stage = await prisma.followUpFunnelStage.findUnique({
      where: { id: stageId }
    });
    
    if (!stage) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Estágio não encontrado"
        }, 
        { status: 404 }
      );
    }
    
    // Buscar os passos do estágio
    const steps = await prisma.followUpStep.findMany({
      where: { funnel_stage_id: stageId },
      orderBy: { created_at: 'asc' }
    });
    
    return NextResponse.json({
      success: true,
      data: steps
    });
    
  } catch (error) {
    console.error("Erro ao listar passos do estágio:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Endpoint para criar um novo passo para um estágio
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Recebendo requisição POST para criar passo:", body);
    
    const { 
      funnel_stage_id, 
      name, 
      template_name, 
      wait_time, 
      message_content, 
      message_category,
      auto_respond
    } = body;
    
    if (!funnel_stage_id || !template_name || !wait_time || !message_content) {
      console.error('Dados inválidos para criação de passo:', {
        funnel_stage_id,
        name,
        template_name,
        wait_time,
        message_content
      });
      
      const missingFields = [];
      if (!funnel_stage_id) missingFields.push('funnel_stage_id');
      if (!template_name) missingFields.push('template_name');
      if (!wait_time) missingFields.push('wait_time');
      if (!message_content) missingFields.push('message_content');
      
      return NextResponse.json(
        { 
          success: false, 
          error: `Campos obrigatórios não preenchidos: ${missingFields.join(', ')}` 
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o estágio existe
    const stage = await prisma.followUpFunnelStage.findUnique({
      where: { id: funnel_stage_id }
    });
    
    if (!stage) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Estágio não encontrado"
        }, 
        { status: 404 }
      );
    }
    
    // Converter tempo de espera em milissegundos
    const wait_time_ms = parseTimeString(wait_time);
    
    // Criar o passo com campos padronizados conforme schema.prisma
    const stepData = {
      funnel_stage_id,
      name: name || template_name,
      template_name,
      wait_time,
      wait_time_ms,
      message_content,
      message_category: message_category || "Utility" // Remover espaço extra no início
    };
    
    // Adicionar auto_respond se estiver presente
    if (auto_respond !== undefined) {
      stepData.auto_respond = auto_respond;
    }
    
    const step = await prisma.followUpStep.create({
      data: stepData
    });
    
    return NextResponse.json(
      { 
        success: true, 
        message: "Passo criado com sucesso", 
        data: step 
      }, 
      { status: 201 }
    );
    
  } catch (error) {
    console.error("Erro ao criar passo para o estágio:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Para atualizar um passo específico
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Recebendo requisição PUT para atualizar passo:", body);
    
    // Obter os campos necessários para atualização
    const { 
      id, 
      funnel_stage_id, 
      name, 
      template_name, 
      wait_time, 
      message_content, 
      message_category,
      auto_respond
    } = body;
    
    if (!id) {
      return NextResponse.json(
        { 
          success: false, 
          error: "ID do passo é obrigatório"
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o passo existe
    const existingStep = await prisma.followUpStep.findUnique({
      where: { id }
    });
    
    if (!existingStep) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Passo não encontrado"
        }, 
        { status: 404 }
      );
    }
    
    // Preparar dados para atualização com fallback para valores existentes
    const updateData = {
      funnel_stage_id: funnel_stage_id || existingStep.funnel_stage_id,
      name: name || existingStep.name,
      template_name: template_name || existingStep.template_name,
      message_content: message_content || existingStep.message_content,
      message_category: message_category || existingStep.message_category
    };
    
    // Atualizar wait_time se fornecido, e recalcular wait_time_ms
    if (wait_time) {
      updateData.wait_time = wait_time;
      updateData.wait_time_ms = parseTimeString(wait_time);
    }
    
    // Adicionar auto_respond se definido
    if (auto_respond !== undefined) {
      updateData.auto_respond = auto_respond;
    }
    
    // Log para ajudar na depuração
    console.log('Dados para atualização do passo:', {
      id,
      ...updateData
    });
    
    // Atualizar o passo
    const updatedStep = await prisma.followUpStep.update({
      where: { id },
      data: updateData
    });
    
    return NextResponse.json({
      success: true,
      message: "Passo atualizado com sucesso",
      data: updatedStep
    });
    
  } catch (error) {
    console.error("Erro ao atualizar passo:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}

// Para excluir um passo específico
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { 
          success: false, 
          error: "ID do passo é obrigatório"
        }, 
        { status: 400 }
      );
    }
    
    // Verificar se o passo existe
    const existingStep = await prisma.followUpStep.findUnique({
      where: { id }
    });
    
    if (!existingStep) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Passo não encontrado"
        }, 
        { status: 404 }
      );
    }
    
    // Excluir o passo
    await prisma.followUpStep.delete({
      where: { id }
    });
    
    return NextResponse.json({
      success: true,
      message: "Passo excluído com sucesso"
    });
    
  } catch (error) {
    console.error("Erro ao excluir passo:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor"
      }, 
      { status: 500 }
    );
  }
}