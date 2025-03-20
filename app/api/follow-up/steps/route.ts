// app/api/follow-up/steps/route.ts
// Arquivo criado como rota alternativa para solucionar o problema de 404 na rota funnel-steps

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { parseTimeString } from '../_lib/manager';

// Redireciona para a implementação principal
export async function GET(req: NextRequest) {
  return NextResponse.redirect('/api/follow-up/funnel-steps' + req.nextUrl.search);
}

// Redireciona para a implementação principal
export async function POST(req: NextRequest) {
  return NextResponse.redirect('/api/follow-up/funnel-steps');
}

// Implementação específica para atualização de passos
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[API STEPS] Recebendo requisição PUT para atualizar passo:", body);
    
    const { 
      id, 
      stage_id,         // Campo do frontend
      funnel_stage_id,  // Campo alternativo para o backend
      name,
      stage_name,       // Campo do frontend
      template_name, 
      wait_time, 
      message,          // Campo do frontend
      message_content,  // Campo do backend
      category,         // Campo do frontend
      message_category, // Campo do backend
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
    
    // Mapear campos do frontend para campos do backend
    const updateData = {
      funnel_stage_id: funnel_stage_id || stage_id || existingStep.funnel_stage_id,
      name: name || stage_name || existingStep.name,
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
    console.log('[API STEPS] Dados para atualização do passo:', {
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