// app/api/follow-up/ai-chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '../_lib/ai/functionIa';
import { prisma } from '@/lib/db';

/**
 * Endpoint para obter uma resposta de IA para um cliente
 * Permite interação direta da IA com o cliente durante o follow-up
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      clientId, 
      message, 
      followUpId,
      saveToHistory = true, // Se verdadeiro, salva a conversa no histórico
      recordClientMessage = false // Se verdadeiro, registra a mensagem do cliente no histórico
    } = body;

    if (!clientId || !message) {
      return NextResponse.json({
        success: false,
        error: 'Os parâmetros clientId e message são obrigatórios'
      }, { status: 400 });
    }

    // Buscar follow-up ativo para este cliente
    let activeFollowUp = null;
    
    if (followUpId) {
      // Se temos um ID específico, buscar por ele
      activeFollowUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: {
          campaign: {
            include: {
              stages: true
            }
          }
        }
      });
    } else {
      // Caso contrário, buscar por cliente ID
      activeFollowUp = await prisma.followUp.findFirst({
        where: {
          client_id: clientId,
          status: { in: ['active', 'paused'] }
        },
        include: {
          campaign: {
            include: {
              stages: true
            }
          }
        },
        orderBy: {
          updated_at: 'desc'
        }
      });
    }

    if (!activeFollowUp) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum follow-up ativo encontrado para este cliente'
      }, { status: 404 });
    }

    // Se a opção recordClientMessage estiver habilitada, registrar a mensagem do cliente
    if (recordClientMessage) {
      await prisma.followUpMessage.create({
        data: {
          follow_up_id: activeFollowUp.id,
          content: message,
          is_from_client: true,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date()
        }
      });
    }

    // Buscar informações do estágio atual
    const currentStage = activeFollowUp.campaign.stages.find(
      s => s.id === activeFollowUp.current_stage_id
    );

    const stageInfo = {
      id: currentStage?.id,
      name: currentStage?.name,
      order: currentStage?.order,
      purpose: currentStage?.description
    };

    // Gerar resposta da IA
    console.log(`Gerando resposta para cliente ${clientId} em follow-up ${activeFollowUp.id}`);
    const aiResponse = await generateAIResponse(
      clientId,
      message,
      activeFollowUp.id,
      stageInfo
    );

    // Registrar a resposta da IA no histórico se saveToHistory estiver habilitado
    if (saveToHistory && aiResponse) {
      const aiMessage = await prisma.followUpMessage.create({
        data: {
          follow_up_id: activeFollowUp.id,
          content: aiResponse,
          is_from_client: false,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date()
        }
      });
      console.log(`Resposta da IA registrada com ID ${aiMessage.id}`);
    }

    return NextResponse.json({
      success: true,
      response: aiResponse,
      followUpId: activeFollowUp.id,
      stage: {
        id: currentStage?.id,
        name: currentStage?.name
      }
    });
  } catch (error) {
    console.error('Erro ao gerar resposta da IA:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro interno do servidor'
    }, { status: 500 });
  }
}