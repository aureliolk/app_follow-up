// app/api/follow-up/_lib/manager.ts
import { prisma } from '@/lib/db';
import { scheduleMessage, cancelScheduledMessages, activeTimeouts } from './scheduler';

interface FollowUpStep {
  wait_time_ms: any;
  stage_order: any;
  stage_name: string;
  message: string;
  wait_time: string;
  template_name: string;
  stage_id?: string;
  category?: string;
  auto_respond?: boolean;
  id?: string;
}

const TEST_MODE = true;
console.log("MODO DE TESTE CONFIGURADO COMO:", TEST_MODE ? "ATIVADO" : "DESATIVADO");

export async function loadFollowUpData(campaignId?: string): Promise<FollowUpStep[]> {
  try {
    if (!campaignId) throw new Error("ID da campanha é obrigatório para carregar etapas");

    const campaign = await prisma.followUpCampaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) throw new Error(`Campanha de follow-up não encontrada: ${campaignId}`);

    const stepsString = campaign.steps as string;
    if (!stepsString || stepsString.trim() === '' || stepsString === '[]') {
      console.log(`Campanha ${campaignId} tem steps vazios ou inválidos`);
      return [];
    }

    const parsedSteps = JSON.parse(stepsString);
    if (!Array.isArray(parsedSteps)) throw new Error(`Steps da campanha ${campaignId} não é um array válido`);
    return parsedSteps as FollowUpStep[];
  } catch (error) {
    console.error("Erro ao carregar dados de follow-up:", error);
    throw error;
  }
}

export function parseTimeString(timeStr: string): number {
  if (TEST_MODE) return 30 * 1000;
  if (!timeStr || timeStr.trim() === "") return 30 * 60 * 1000;

  const timeMap: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    minuto: 60 * 1000,
    hora: 60 * 60 * 1000,
    dia: 24 * 60 * 60 * 1000
  };

  const match = timeStr.match(/^(\d+)([smhd])$/i) || timeStr.match(/(\d+)\s*(minuto|hora|dia)/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    return value * timeMap[unit];
  }

  if (/^\d+$/.test(timeStr.trim())) return parseInt(timeStr) * 60 * 1000;
  if (timeStr.toLowerCase() === "imediatamente") return 1000;
  return 30 * 60 * 1000;
}


// Ajuste na função processFollowUpSteps
export async function processFollowUpSteps(followUpId: string): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: {
          include: {
            campaign_steps: {
              include: { funnel_stage: true },
              orderBy: [{ funnel_stage: { order: 'asc' } }, { wait_time_ms: 'asc' }]
            }
          }
        }
      }
    });

    if (!followUp) throw new Error(`Follow-up não encontrado: ${followUpId}`);
    if (followUp.status !== 'active') return;

    let steps: FollowUpStep[] = followUp.campaign?.campaign_steps?.map(step => ({
      id: step.id,
      stage_id: step.funnel_stage_id,
      stage_name: step.funnel_stage.name,
      template_name: step.template_name,
      wait_time: step.wait_time,
      message: step.message_content,
      category: step.message_category || 'Utility',
      auto_respond: step.auto_respond ?? true,
      stage_order: step.funnel_stage.order,
      wait_time_ms: step.wait_time_ms
    }))?.sort((a, b) => a.stage_order - b.stage_order || a.wait_time_ms - b.wait_time_ms) || [];

    if (steps.length === 0 && followUp.campaign?.steps) {
      steps = JSON.parse(followUp.campaign.steps as string) as FollowUpStep[];
    }

    if (!steps.length) throw new Error("Nenhuma etapa de follow-up encontrada");

    let currentStepIndex = followUp.current_step;
    const totalSteps = steps.length;

    // Verifica se todos os passos foram processados
    if (currentStepIndex >= totalSteps) {
      await prisma.followUp.update({
        where: { id: followUpId },
        data: { status: 'completed', completed_at: new Date() }
      });
      console.log(`Follow-up ${followUpId} concluído - todos os passos processados`);
      return;
    }

    const currentStep = steps[currentStepIndex];
    let existingMetadata = followUp.metadata ? JSON.parse(followUp.metadata) : {};
    const stageChanged = currentStep.stage_name !== existingMetadata.current_stage_name;

    if (stageChanged) {
      const updatedMetadata = {
        ...existingMetadata,
        current_stage_name: currentStep.stage_name,
        previous_stage_name: existingMetadata.current_stage_name || null,
        updated_at: new Date().toISOString(),
        step_in_stage: 0
      };

      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          metadata: JSON.stringify(updatedMetadata),
          current_stage_id: currentStep.stage_id,
          current_step: currentStepIndex
        }
      });
    }

    const waitTime = parseTimeString(currentStep.wait_time);
    const nextMessageTime = new Date(Date.now() + waitTime);

    await prisma.followUp.update({
      where: { id: followUpId },
      data: { next_message_at: nextMessageTime, current_step: currentStepIndex }
    });

    const message = await prisma.followUpMessage.create({
      data: {
        follow_up_id: followUpId,
        step: currentStepIndex,
        content: currentStep.message,
        funnel_stage: currentStep.stage_name,
        template_name: currentStep.template_name,
        category: currentStep.category,
        sent_at: new Date(),
        delivered: false
      }
    });

    const clientName = followUp.client_id?.charAt(0).toUpperCase() + (followUp.client_id?.slice(1).toLowerCase() || '');

    await scheduleMessage({
      followUpId,
      stepIndex: currentStepIndex,
      message: currentStep.message,
      scheduledTime: nextMessageTime,
      clientId: followUp.client_id,
      metadata: {
        template_name: currentStep.template_name,
        category: currentStep.category,
        stage_name: currentStep.stage_name,
        clientName,
        templateParams: { name: currentStep.template_name, category: currentStep.category, language: "pt_BR" },
        processedParams: { "1": clientName }
      }
    });

    // Agendar o próximo passo
    await scheduleNextStep(followUpId, currentStepIndex + 1, nextMessageTime, totalSteps);

    // Após o envio, verificar se foi o último passo
    if (currentStepIndex === totalSteps - 1) {
      await prisma.followUp.update({
        where: { id: followUpId },
        data: { status: 'completed', completed_at: new Date() }
      });
      console.log(`Follow-up ${followUpId} concluído - último passo (${currentStepIndex}) enviado`);
    }
  } catch (error) {
    console.error("Erro ao processar etapas de follow-up:", error);
    throw error;
  }
}

// Ajuste na função scheduleNextStep
export async function scheduleNextStep(followUpId: string, nextStepIndex: number, scheduledTime: Date, totalSteps: number): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: { campaign: { include: { campaign_steps: { include: { funnel_stage: true } } } } }
    });

    if (!followUp || followUp.status !== 'active') return;

    if (nextStepIndex >= totalSteps) {
      // Não faz nada aqui, a conclusão será tratada em processFollowUpSteps após o envio
      return;
    }

    setTimeout(async () => {
      try {
        const currentFollowUp = await prisma.followUp.findUnique({ where: { id: followUpId } });
        if (!currentFollowUp || currentFollowUp.status !== 'active') return;

        await prisma.followUp.update({
          where: { id: followUpId },
          data: { current_step: nextStepIndex }
        });
        await processFollowUpSteps(followUpId);
      } catch (error) {
        console.error(`Erro ao processar próxima etapa do follow-up ${followUpId}:`, error);
      }
    }, scheduledTime.getTime() - Date.now());
  } catch (error) {
    console.error("Erro ao agendar próxima etapa:", error);
    throw error;
  }
}

export async function resumeFollowUp(followUpId: string): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({ where: { id: followUpId } });
    if (!followUp) throw new Error(`Follow-up não encontrado: ${followUpId}`);
    if (followUp.status !== 'paused') return;

    await prisma.followUp.update({
      where: { id: followUpId },
      data: { status: 'active', is_responsive: false, next_message_at: new Date() }
    });

    await processFollowUpSteps(followUpId);
  } catch (error) {
    console.error("Erro ao reiniciar follow-up:", error);
    throw error;
  }
}

export async function advanceToNextStep(followUpId: string): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({ where: { id: followUpId }, include: { campaign: true } });
    if (!followUp) throw new Error(`Follow-up não encontrado: ${followUpId}`);
    if (followUp.status !== 'active' && followUp.status !== 'paused') return;

    let steps: FollowUpStep[] = followUp.campaign?.steps ? JSON.parse(followUp.campaign.steps as string) : [];
    const nextStepIndex = followUp.current_step + 1;

    if (nextStepIndex >= steps.length) {
      await prisma.followUp.update({
        where: { id: followUpId },
        data: { status: 'completed', completed_at: new Date() }
      });
      return;
    }

    await prisma.followUp.update({
      where: { id: followUpId },
      data: { current_step: nextStepIndex, status: 'active', is_responsive: false, next_message_at: new Date() }
    });

    await cancelScheduledMessages(followUpId);
    await processFollowUpSteps(followUpId);
  } catch (error) {
    console.error("Erro ao avançar follow-up:", error);
    throw error;
  }
}

export async function cancelScheduledMessageForStep(followUpId: string, stepIndex: number): Promise<void> {
  try {
    const keyToRemove = `${followUpId}-${stepIndex}`;
    if (activeTimeouts.has(keyToRemove)) {
      clearTimeout(activeTimeouts.get(keyToRemove)!);
      activeTimeouts.delete(keyToRemove);
      console.log(`Timeout para mensagem ${keyToRemove} cancelado com sucesso`);
    }
  } catch (error) {
    console.error(`Erro ao cancelar mensagem agendada para etapa ${stepIndex}:`, error);
    throw error;
  }
}

export async function handleClientResponse(clientId: string, message: string, followUpId?: string): Promise<void> {
  try {
    console.log('=== DADOS DA RESPOSTA DO CLIENTE ===', { followUpId, clientId, message });

    const activeFollowUps = await prisma.followUp.findMany({
      where: { client_id: clientId, status: { in: ['active', 'paused'] }, ...(followUpId ? { id: followUpId } : {}) },
      include: { campaign: { include: { campaign_steps: { include: { funnel_stage: true } }, stages: { orderBy: { order: 'asc' } } } } }
    });

    if (!activeFollowUps.length) {
      console.log(`Nenhum follow-up ativo encontrado para o cliente ${clientId}`);
      return;
    }

    for (const followUp of activeFollowUps) {
      let steps: FollowUpStep[] = followUp.campaign?.campaign_steps?.map(step => ({
        id: step.id,
        stage_id: step.funnel_stage_id,
        stage_name: step.funnel_stage.name,
        template_name: step.template_name,
        wait_time: step.wait_time,
        message: step.message_content,
        category: step.message_category || 'Utility',
        auto_respond: step.auto_respond ?? true,
        stage_order: step.funnel_stage.order,
        wait_time_ms: step.wait_time_ms
      })) || [];

      if (!steps.length && followUp.campaign?.steps) {
        steps = JSON.parse(followUp.campaign.steps as string) as FollowUpStep[];
      }

      if (!steps.length) {
        console.error(`Nenhuma etapa encontrada para o follow-up ${followUp.id}`);
        continue;
      }

      steps.sort((a, b) => a.stage_order - b.stage_order || a.wait_time_ms - b.wait_time_ms);
      const currentStepIndex = followUp.current_step;
      const currentStep = steps[currentStepIndex];
      const currentStageName = currentStep.stage_name;

      await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUp.id,
          step: -1,
          content: message,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date(),
          funnel_stage: currentStageName,
          category: 'Resposta do cliente'
        }
      });

      let currentMetadata = followUp.metadata ? JSON.parse(followUp.metadata) : {};
      currentMetadata.responses = currentMetadata.responses || {};
      currentMetadata.responses[`${currentStepIndex}_${Date.now()}`] = {
        timestamp: new Date().toISOString(),
        message,
        stage_name: currentStageName
      };

      await cancelScheduledMessages(followUp.id);

      const stageNames = followUp.campaign?.stages?.length
        ? followUp.campaign.stages.map(s => s.name)
        : [...new Set(steps.map(s => s.stage_name))].sort((a, b) => (steps.find(s => s.stage_name === a)?.stage_order || 0) - (steps.find(s => s.stage_name === b)?.stage_order || 0));

      const currentStageIndex = stageNames.indexOf(currentStageName);
      const nextStageIndex = currentStageIndex + 1;

      if (nextStageIndex >= stageNames.length) {
        const lastStepIndex = steps.length - 1;
        if (currentStepIndex >= lastStepIndex) {
          await prisma.followUp.update({
            where: { id: followUp.id },
            data: {
              status: 'completed',
              completed_at: new Date(),
              metadata: JSON.stringify({
                ...currentMetadata,
                campaign_completed: true,
                completion_reason: "Cliente respondeu no último estágio e todos os passos foram processados"
              })
            }
          });
          console.log(`Follow-up ${followUp.id} concluído - último estágio alcançado e todos os passos processados`);
        } else {
          await prisma.followUp.update({
            where: { id: followUp.id },
            data: { current_step: currentStepIndex + 1, next_message_at: new Date() }
          });
          await processFollowUpSteps(followUp.id);
        }
        continue;
      }

      const nextStageName = stageNames[nextStageIndex];
      const firstStepOfNextStage = steps.findIndex(s => s.stage_name === nextStageName);

      if (firstStepOfNextStage < 0) {
        console.error(`Não foi possível encontrar o primeiro passo do estágio ${nextStageName}`);
        continue;
      }

      const nextStep = steps[firstStepOfNextStage];
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          current_step: firstStepOfNextStage,
          is_responsive: true,
          status: 'active',
          next_message_at: new Date(),
          current_stage_id: nextStep.stage_id,
          metadata: JSON.stringify({
            ...currentMetadata,
            current_stage_name: nextStep.stage_name,
            updated_at: new Date().toISOString(),
            last_response: message,
            last_response_date: new Date().toISOString(),
            processed_by_response: true,
            advanced_after_response: true,
            previous_step: currentStepIndex,
            new_step: firstStepOfNextStage,
            previous_stage_name: currentStageName
          })
        }
      });

      console.log(`Follow-up ${followUp.id} avançado para o estágio ${nextStageName}, passo ${firstStepOfNextStage}`);
      await processFollowUpSteps(followUp.id);
    }
  } catch (error) {
    console.error("Erro ao lidar com resposta do cliente:", error);
    throw error;
  }
}

export async function createEmptyCampaign(name: string, description?: string): Promise<string> {
  try {
    const campaign = await prisma.followUpCampaign.create({
      data: { name, description, active: true, steps: "[]" }
    });
    return campaign.id;
  } catch (error) {
    console.error("Erro ao criar campanha de follow-up:", error);
    throw error;
  }
}