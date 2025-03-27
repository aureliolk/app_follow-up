// app/api/follow-up/client-response/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { handleClientResponse } from '../_lib/manager';
import { generateAIResponse } from '../_lib/ai/functionIa';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { followUpId, clientId, message, aiResponse = true } = body;
    console.log('=== DADOS DA RESPOSTA DO CLIENTE ===');
    console.log('followUpId:', followUpId);
    console.log('clientId:', clientId);
    console.log('message:', message);
    console.log('aiResponse:', aiResponse);
    console.log('=== FIM DADOS DA RESPOSTA DO CLIENTE ===');

    if (!clientId) {
      return NextResponse.json({ 
        success: false, 
        error: 'ClientId é obrigatório' 
      }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ 
        success: false, 
        error: 'Mensagem é obrigatória' 
      }, { status: 400 });
    }

    // Processar a resposta do cliente através do gerenciador normal
    await handleClientResponse(clientId, message, followUpId);

    // Se aiResponse for true, gerar uma resposta automática da IA
    let aiGeneratedMessage = null;
    if (aiResponse) {
      try {
        // Buscar o follow-up para obter informações de contexto
        const followUp = followUpId ? await prisma.followUp.findUnique({
          where: { id: followUpId },
          include: {
            campaign: {
              include: {
                stages: {
                  where: { id: followUpId ? undefined : undefined }
                }
              }
            }
          }
        }) : null;

        // Se não encontrarmos por ID, buscar pelo ID do cliente
        const activeFollowUp = followUp || await prisma.followUp.findFirst({
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

        if (activeFollowUp) {
          // Buscar informações do estágio atual
          const currentStage = activeFollowUp.campaign.stages.find(
            s => s.id === activeFollowUp.current_stage_id
          );

          const stageInfo = {
            id: currentStage?.id,
            name: currentStage?.name,
            order: currentStage?.order,
            purpose: currentStage?.description,
            requiresResponse: currentStage?.requires_response
          };

          // Gerar resposta da IA
          console.log('Gerando resposta automática com IA...');
          aiGeneratedMessage = await generateAIResponse(
            clientId, 
            message, 
            activeFollowUp.id, 
            stageInfo
          );

          // Registrar a resposta da IA como mensagem no sistema
          if (aiGeneratedMessage) {
            await prisma.followUpMessage.create({
              data: {
                follow_up_id: activeFollowUp.id,
                content: aiGeneratedMessage,
                is_from_client: false,
                sent_at: new Date(),
                delivered: true,
                delivered_at: new Date()
              }
            });

            console.log('Resposta da IA registrada com sucesso!');
          }
        }
      } catch (aiError) {
        console.error('Erro ao gerar resposta automática com IA:', aiError);
        // Não falhar o endpoint por causa de erro na geração da resposta
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Resposta processada com sucesso',
      clientId,
      followUpId: followUpId || null,
      ai_response: aiGeneratedMessage
    });
  } catch (error) {
    console.error('Erro ao processar resposta do cliente:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    }, { status: 500 });
  }
}