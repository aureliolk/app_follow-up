// app/api/follow-up/_lib/manager.ts
// Versão refatorada do gerenciador de follow-up

import { prisma } from '@/lib/db';
import { scheduleMessage, cancelScheduledMessages } from './scheduler';
import { analyzeClientResponse, decideNextStepWithAI } from '@/app/api/follow-up/_lib/ai/functionIa';

// Importar funções internas e tipos
import {
  parseTimeString,
  updateFollowUpStatus,
  createSystemMessage,
  getCampaignSteps,
  processCurrentStep,
  determineNextStep,
  processStageAdvancement,
  processActiveFollowUpResponse,
} from './internal/followUpHelpers';

// Função principal revisada para processamento de follow-ups
export async function processFollowUpSteps(followUpId: string): Promise<void> {
  try {
    // 1. Buscar o follow-up com todos os relacionamentos necessários
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: {
          include: {
            stages: {
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    });

    // 2. Verificar se o follow-up existe e está ativo
    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`);
    }

    if (followUp.status !== 'active') {
      console.log(`Follow-up ${followUpId} não está ativo (status: ${followUp.status}), operação ignorada`);
      return;
    }

    // 3. Buscar todos os estágios da campanha
    const campaignId = followUp.campaign_id;

    // Buscar estágios da campanha
    const stages = followUp.campaign.stages;

    // Buscar passos diretamente pelo funnel_stage_id
    const stageIds = stages.map(stage => stage.id);

    // CORREÇÃO: Buscar apenas os passos do estágio atual do follow-up
    // Isso evita o problema de loop onde ele sempre buscava todos os passos de todos os estágios
    const steps = await prisma.followUpStep.findMany({
      where: {
        // Filtrar apenas pelo estágio atual
        funnel_stage_id: followUp.current_stage_id || ""
      },
      include: { funnel_stage: true },
      orderBy: [
        {
          funnel_stage: {
            order: 'asc'
          }
        },
        { wait_time_ms: 'asc' }
      ]
    });

    // Importar a função de normalização de passos
    const { normalizeStep } = require('./internal/followUpHelpers');

    // Mapear para o formato esperado
    const formattedSteps: any = steps.map(normalizeStep);

    // Log de depuração para verificar quais passos estão sendo buscados
    console.log(`Follow-up ${followUpId} - Buscando passos do estágio: ${followUp.current_stage_id}`);
    console.log(`Follow-up ${followUpId} - Encontrados ${formattedSteps.length} passos para o estágio atual`);

    // 4. Verificar se existem passos configurados
    if (!formattedSteps.length) {
      console.log(`Follow-up ${followUpId} - Campanha não possui passos configurados`);

      // Pausar o follow-up e registrar o motivo usando campos estruturados
      await updateFollowUpStatus(followUpId, 'paused', {
        waiting_for_response: false
      });

      // Criar mensagem de sistema explicando o problema
      await createSystemMessage(
        followUpId,
        "Follow-up pausado: a campanha não possui passos configurados. É necessário configurar os passos na campanha antes de iniciar o follow-up."
      );

      console.log(`Follow-up ${followUpId} pausado - Campanha precisa ser configurada`);
      return;
    }

    // 5. Obter o passo atual
    // Como current_step foi substituído por current_step_id, precisamos encontrar o índice
    const currentStepId = followUp.current_step_id;
    let currentStepIndex = 0;

    if (currentStepId) {
      // Se temos um ID específico, encontrar o índice
      const index = formattedSteps.findIndex((step: any) => step.id === currentStepId);
      if (index >= 0) {
        currentStepIndex = index;
      }
    }

    const currentStep: any = formattedSteps[currentStepIndex];

    // 6. Verificar se o passo atual é válido
    if (!currentStep) {
      console.log(`Follow-up ${followUpId} - Passo ${currentStepIndex} não encontrado`);

      // Pausar o follow-up e registrar o motivo usando campos estruturados
      await updateFollowUpStatus(followUpId, 'paused', {
        waiting_for_response: false
      });

      // Criar mensagem de sistema explicando o problema
      await createSystemMessage(
        followUpId,
        `Follow-up pausado: o passo ${currentStepIndex} não foi encontrado na configuração da campanha.`
      );

      return;
    }

    // 7. Processar o passo atual
    await processCurrentStep(followUp, currentStep, currentStepIndex);

    // 8. Determinar e agendar o próximo passo
    await determineNextStep(followUp, formattedSteps, currentStepIndex);

  } catch (error) {
    console.error(`Erro ao processar follow-up ${followUpId}:`, error);
    throw error;
  }
}

// Função para lidar com resposta do cliente e avançar para o próximo estágio
export async function handleClientResponse(
  clientId: string,
  message: string,
  followUpId?: string
): Promise<void> {
  try {
    console.log('=== DADOS DA RESPOSTA DO CLIENTE ===');
    console.log({ followUpId, clientId, message });
    console.log('=== FIM DADOS DA RESPOSTA DO CLIENTE ===');

    // Buscar follow-ups ativos ou pausados para este cliente
    const activeFollowUps = await prisma.followUp.findMany({
      where: {
        client_id: clientId,
        status: { in: ['active', 'paused'] },
        ...(followUpId ? { id: followUpId } : {})
      },
      include: {
        campaign: {
          include: {
            stages: { orderBy: { order: 'asc' } }
          }
        }
      }
    });

    if (!activeFollowUps.length) {
      console.log(`Nenhum follow-up ativo ou pausado encontrado para o cliente ${clientId}`);
      return;
    }

    // ADIÇÃO: Analisar a resposta do cliente com IA
    const aiAnalysis = await analyzeClientResponse(clientId, message, activeFollowUps[0].id);
    console.log("Análise de IA da resposta do cliente:", aiAnalysis);

    // 2. Processar cada follow-up encontrado
    for (const followUp of activeFollowUps) {
      // Obter todos os passos da campanha
      const steps = await getCampaignSteps(followUp);

      if (!steps.length) {
        console.error(`Nenhum passo encontrado para o follow-up ${followUp.id}`);
        continue;
      }

      // Obter o passo atual
      const currentStepIndex = steps.findIndex(step => step.id === followUp.current_step_id) || 0;
      const currentStep = currentStepIndex < steps.length ? steps[currentStepIndex] : null;

      if (!currentStep) {
        console.error(`Passo atual (${currentStepIndex}) não encontrado para follow-up ${followUp.id}`);
        continue;
      }

      // Registrar a mensagem do cliente
      const clientMessage = await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUp.id,
          step_id: null,
          content: message,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date(),
          is_from_client: true
        }
      });

      // Atualizar follow-up com a última resposta
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          last_response: message,
          last_response_at: new Date()
        }
      });

      // Se você tiver criado o modelo FollowUpAIAnalysis no seu schema, descomente este código:
      // Criar registro de análise
      await prisma.followUpAIAnalysis.create({
        data: {
          follow_up_id: followUp.id,
          message_id: clientMessage.id, // Usando o ID da mensagem que acabamos de criar
          sentiment: aiAnalysis.sentiment,
          intent: aiAnalysis.intent,
          topics: aiAnalysis.topics,
          next_action: aiAnalysis.nextAction,
          suggested_stage: aiAnalysis.suggestedStage
        }
      });
      

      // MODIFICAÇÃO: Usar a IA para decidir o próximo passo
      const aiDecision: any = await decideNextStepWithAI(followUp, currentStep, message);
      console.log(`Decisão da IA para follow-up ${followUp.id}:`, aiDecision);

      // Agir com base na decisão da IA
      if (aiDecision.action === 'continue') {
        // Verificar se o follow-up está pausado
        if (followUp.status === 'paused') {
          if (followUp.waiting_for_response) {
            await processStageAdvancement(followUp, steps, currentStep, message);
          } else {
            // Verificar mensagens pendentes e retomar fluxo se necessário
            const pendingMessages = await prisma.followUpMessage.findMany({
              where: {
                follow_up_id: followUp.id,
                delivered: false
              }
            });

            if (pendingMessages.length === 0) {
              await prisma.followUp.update({
                where: { id: followUp.id },
                data: {
                  status: 'active',
                  waiting_for_response: false
                }
              });

              await processStageAdvancement(followUp, steps, currentStep, message);
            } else {
              await prisma.followUp.update({
                where: { id: followUp.id },
                data: {
                  last_response: message,
                  last_response_at: new Date()
                }
              });
            }
          }
        } else {
          // Follow-up ativo, processar resposta normalmente
          await processActiveFollowUpResponse(followUp, message);
        }
      } else if (aiDecision.action === 'skip' && aiDecision.targetStep !== undefined) {
        // Pular para um passo específico no mesmo estágio
        await prisma.followUp.update({
          where: { id: followUp.id },
          data: {
            current_step_id: steps[aiDecision.targetStep]?.id || null,
            status: 'active',
            waiting_for_response: false
          }
        });

        // Registrar mensagem de sistema explicando a mudança
        await createSystemMessage(
          followUp.id,
          `IA determinou pular para o passo ${aiDecision.targetStep} (${steps[aiDecision.targetStep]?.template_name}). Motivo: ${aiDecision.reason}`
        );

        // Processar o próximo passo
        await processFollowUpSteps(followUp.id);
      } else if (aiDecision.action === 'jump' && aiDecision.targetStage) {
        // Pular para outro estágio
        const targetStage = followUp.campaign.stages.find(s =>
          s.id === aiDecision.targetStage || s.name === aiDecision.targetStage
        );

        if (targetStage) {
          // Registrar mensagem de sistema explicando a mudança
          await createSystemMessage(
            followUp.id,
            `IA determinou avançar para o estágio "${targetStage.name}". Motivo: ${aiDecision.reason}`
          );

          // Buscar o primeiro passo do estágio alvo
          const firstStepInTargetStage = steps.find(s => s.stage_id === targetStage.id);

          if (firstStepInTargetStage) {
            await prisma.followUp.update({
              where: { id: followUp.id },
              data: {
                current_step_id: firstStepInTargetStage.id,
                current_stage_id: targetStage.id,
                status: 'active',
                waiting_for_response: false
              }
            });

            // Processar o passo no novo estágio
            await processFollowUpSteps(followUp.id);
          }
        }
      } else if (aiDecision.action === 'complete') {
        // Completar o follow-up
        await updateFollowUpStatus(followUp.id, 'completed', {
          completed_at: new Date(),
          last_response: message,
          last_response_at: new Date()
        });

        // Criar mensagem de sistema
        await createSystemMessage(
          followUp.id,
          `Follow-up concluído por recomendação da IA. Motivo: ${aiDecision.reason}`
        );
      }
    }
  } catch (error) {
    console.error("Erro ao processar resposta do cliente:", error);
    throw error;
  }
}

export async function resumeFollowUp(followUpId: string): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({ where: { id: followUpId } });
    if (!followUp) throw new Error(`Follow-up não encontrado: ${followUpId}`);
    if (followUp.status !== 'paused') return;

    // Atualizar para status ativo
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status: 'active',
        next_message_at: new Date(),
        waiting_for_response: false
      }
    });

    // Registrar mensagem de sistema sobre a retomada
    await createSystemMessage(
      followUpId,
      "Follow-up retomado manualmente."
    );

    // Continuar o processamento a partir do passo atual
    await processFollowUpSteps(followUpId);
  } catch (error) {
    console.error("Erro ao reiniciar follow-up:", error);
    throw error;
  }
}

// Função para avançar manualmente para o próximo passo - também usada pelos mecanismos automáticos
export async function advanceToNextStep(followUpId: string): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: {
          include: {
            stages: { // Usando 'stages' em vez de 'campaign_steps'
              include: { steps: true } // Incluindo os passos de cada estágio
            }
          }
        }
      }
    });

    if (!followUp) throw new Error(`Follow-up não encontrado: ${followUpId}`);
    if (followUp.status !== 'active' && followUp.status !== 'paused') return;

    // Obter os passos da campanha
    const steps = await getCampaignSteps(followUp);
    // Encontrar o índice do passo atual no array de passos
    const currentStepIndex = steps.findIndex(step => step.id === followUp.current_step_id) || 0;
    const nextStepIndex = currentStepIndex + 1;

    if (nextStepIndex >= steps.length) {
      await updateFollowUpStatus(followUpId, 'completed', {});
      return;
    }

    // Atualizar status e avançar para o próximo passo
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        current_step_id: steps[nextStepIndex]?.id || null,
        status: 'active',
        next_message_at: new Date(),
        waiting_for_response: false
      }
    });

    // Cancelar mensagens pendentes
    await cancelScheduledMessages(followUpId);

    // Continuar o processamento a partir do novo passo
    await processFollowUpSteps(followUpId);
  } catch (error) {
    console.error("Erro ao avançar follow-up:", error);
    throw error;
  }
}

// Reexportar parseTimeString que é usado em outros arquivos
export { parseTimeString }