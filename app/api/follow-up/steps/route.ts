// app/api/follow-up/steps/route.ts
// Rota de compatibilidade temporária - todas as outras operações usam funnel-steps

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseTimeString } from '../_lib/manager';

// Redireciona para a implementação principal
export async function GET(req: NextRequest) {
  return NextResponse.redirect('/api/follow-up/funnel-steps' + req.nextUrl.search);
}

// Redireciona para a implementação principal
export async function POST(req: NextRequest) {
  return NextResponse.redirect('/api/follow-up/funnel-steps');
}

// Implementação de compatibilidade para atualização de passos
// Converte os campos do frontend para o padrão do schema.prisma
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[API STEPS] Recebendo requisição PUT para atualizar passo:", body);
    
    // Padronizar os nomes dos campos para seguir o schema.prisma
    const { 
      id,
      // Aceitar ambos os formatos mas padronizar para funnel_stage_id
      stage_id,
      funnel_stage_id,
      // Nome do passo
      name,
      // Template
      template_name,
      // Tempo de espera
      wait_time,
      // Conteúdo da mensagem
      message,
      message_content,
      // Categoria
      category,
      message_category,
      // Resposta automática
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
    
    // Padronizar os dados de acordo com o schema.prisma
    const updateData = {
      // Manter campos do schema.prisma
      funnel_stage_id: funnel_stage_id || stage_id || existingStep.funnel_stage_id,
      name: name || existingStep.name,
      template_name: template_name || existingStep.template_name,
      message_content: message_content || message || existingStep.message_content,
      message_category: message_category || category || existingStep.message_category
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
    console.log('[API STEPS] Dados padronizados para atualização:', {
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
    console.error("[API STEPS] Erro ao atualizar passo:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro interno do servidor" 
      }, 
      { status: 500 }
    );
  }
}

// Redireciona para a implementação principal
export async function DELETE(req: NextRequest) {
  return NextResponse.redirect('/api/follow-up/funnel-steps' + req.nextUrl.search);
}