// app/api/follow-up/_lib/internal/followUpHelpers.ts
// Funções internas para gerenciamento de follow-up

import { prisma } from '@/lib/db';
import { personalizeMessageContent, decideNextStepWithAI } from '@/app/api/follow-up/_lib/ai/functionIa';
import { scheduleMessage } from '../scheduler';

interface FollowUpStep {
  id: string;
  stage_id?: string;
  funnel_stage_id?: string;
  stage_name: string;
  message: string;
  message_content?: string;
  wait_time: string;
  template_name: string;
  category?: string;
  message_category?: string;
  auto_respond?: boolean;
  stage_order: number;
  wait_time_ms: number;
  funnel_stage?: any;
}

const TEST_MODE = false;
console.log("MODO DE TESTE CONFIGURADO COMO:", TEST_MODE ? "ATIVADO" : "DESATIVADO");

export function parseTimeString(timeStr: string): number {
  // Em modo de teste, reduzir drasticamente os tempos para facilitar testes
  if (TEST_MODE) {
    console.log(`Modo de teste: convertendo tempo "${timeStr}" para 30 segundos para testes`);
    return 30 * 1000; // 30 segundos para todos os passos em modo de teste
  }
  
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

// Função para atualizar o status do follow-up usando campos estruturados
export async function updateFollowUpStatus(
  followUpId: string,
  status: 'active' | 'paused' | 'completed' | 'canceled',
  updates: Record<string, any> = {}
): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId }
    });

    if (!followUp) throw new Error(`Follow-up não encontrado: ${followUpId}`);

    // Dados adicionais específicos para cada status
    const additionalData: any = {};

    if (status === 'completed') {
      additionalData.completed_at = new Date();
    } else if (status === 'paused') {
      // Removido: is_responsive não existe no modelo FollowUp
      additionalData.waiting_for_response = 
        updates.waiting_for_response !== undefined ? updates.waiting_for_response : true;
    }

    // Atualizar o follow-up com os novos campos estruturados
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status,
        ...additionalData,
        ...updates
      }
    });

    console.log(`Follow-up ${followUpId} atualizado para status: ${status}`);
  } catch (error) {
    console.error(`Erro ao atualizar status do follow-up ${followUpId}:`, error);
    throw error;
  }
}

// Função atualizada para registrar mensagem no sistema
export async function createSystemMessage(
  followUpId: string,
  content: string
): Promise<void> {
  try {
    await prisma.followUpMessage.create({
      data: {
        follow_up_id: followUpId,
        step_id: null,
        content,
        is_from_client: false,
        sent_at: new Date(),
        delivered: true,
        delivered_at: new Date()
      }
    });
  } catch (error) {
    console.error(`Erro ao criar mensagem de sistema para follow-up ${followUpId}:`, error);
  }
}

// Função para normalizar objeto de passo
export function normalizeStep(step: any): FollowUpStep {
  // Calcular o tempo de espera adequado
  let waitTimeMs = step.wait_time_ms || parseTimeString(step.wait_time);
  
  // Em modo de teste, forçar tempos curtos mesmo se wait_time_ms já estiver definido
  if (TEST_MODE && waitTimeMs > 60 * 1000) {
    console.log(`Modo de teste: reduzindo tempo de espera de ${waitTimeMs}ms para 30 segundos`);
    waitTimeMs = 30 * 1000; // Máximo de 30 segundos em modo de teste
  }
  
  return {
    id: step.id,
    stage_id: step.funnel_stage_id || step.stage_id,
    funnel_stage_id: step.funnel_stage_id || step.stage_id,
    stage_name: step.funnel_stage?.name || step.stage_name,
    message: step.message_content || step.message,
    message_content: step.message_content || step.message,
    wait_time: step.wait_time,
    template_name: step.template_name,
    category: step.message_category || step.category || 'Utility',
    message_category: step.message_category || step.category || 'Utility',
    auto_respond: step.auto_respond !== undefined ? step.auto_respond : true,
    stage_order: step.funnel_stage?.order || step.stage_order || 0,
    wait_time_ms: waitTimeMs,
    funnel_stage: step.funnel_stage
  };
}

// Função para obter os passos de uma campanha
export async function getCampaignSteps(followUp: any): Promise<FollowUpStep[]> {
  try {
    // Buscar estágios da campanha
    const stages = await prisma.followUpFunnelStage.findMany({
      where: { campaign_id: followUp.campaign_id },
      orderBy: { order: 'asc' }
    });
    
    // Buscar todos os passos para esses estágios
    const steps = await prisma.followUpStep.findMany({
      where: {
        funnel_stage_id: { in: stages.map(stage => stage.id) }
      },
      include: { funnel_stage: true },
      orderBy: [
        { funnel_stage: { order: 'asc' } },
        { wait_time_ms: 'asc' }
      ]
    });
    
    // Mapear para o formato esperado
    return steps.map(normalizeStep);
  } catch (error) {
    console.error(`Erro ao buscar passos da campanha para follow-up ${followUp.id}:`, error);
    return [];
  }
}

// Função para processar o passo atual - refatorada para usar campos estruturados
// Modificação na função processCurrentStep para personalizar mensagens com IA
export async function processCurrentStep(followUp: any, currentStep: FollowUpStep, currentStepIndex: number = 0): Promise<void> {
  try {
    console.log(`Processando passo para follow-up ${followUp.id}`);

    // Verificar mudança de estágio
    const currentStep_funnel_stage = await prisma.followUpFunnelStage.findUnique({
      where: { id: currentStep.funnel_stage_id }
    });
    
    const currentStageName = currentStep_funnel_stage?.name || '';
    const stageChanged = followUp.current_stage_id !== currentStep.funnel_stage_id;

    // Se mudou de estágio, atualizar os campos estruturados
    if (stageChanged) {
      // Registrar mensagem de sistema sobre a mudança de estágio
      await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUp.id,
          step_id: null,
          content: `Sistema avançou para o estágio "${currentStageName}"`,
          is_from_client: false,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date()
        }
      });

      // Atualizar o follow-up com o novo estágio
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          current_stage_id: currentStep.funnel_stage_id
        }
      });
    }

    // Calcular quando a mensagem deve ser enviada
    const waitTime = parseTimeString(currentStep.wait_time);
    const nextMessageTime = new Date(Date.now() + waitTime);

    // Atualizar próximo horário de mensagem
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: {
        next_message_at: nextMessageTime
      }
    });

    // MODIFICAÇÃO: Personalizar a mensagem com IA
    const messageMetadata = {
      template_name: currentStep.template_name,
      category: currentStep.category,
      stage_name: currentStageName
    };
    
    let messageContent = currentStep.message || currentStep.message_content;
    
    // Verificar se devemos personalizar com IA
    const followUpSettings = JSON.parse(followUp.metadata || '{}');
    if (followUpSettings.enableAIPersonalization !== false) { // Habilitado por padrão
      messageContent = await personalizeMessageContent(
        messageContent,
        followUp.client_id,
        followUp.id,
        messageMetadata
      );
    }

    // Criar registro da mensagem com os campos atualizados
    const message = await prisma.followUpMessage.create({
      data: {
        follow_up_id: followUp.id,
        step_id: currentStep.id,
        content: messageContent,
        sent_at: new Date(),
        delivered: false,
        is_from_client: false
      }
    });

    // Preparar dados para envio
    const clientName = followUp.client_id?.charAt(0).toUpperCase() +
      (followUp.client_id?.slice(1).toLowerCase() || '');

    // Agendar o envio da mensagem com o conteúdo personalizado
    await scheduleMessage({
      followUpId: followUp.id,
      stepIndex: currentStepIndex,
      message: messageContent,
      scheduledTime: nextMessageTime,
      clientId: followUp.client_id,
      metadata: {
        ...messageMetadata,
        clientName,
        templateParams: {
          name: currentStep.template_name,
          category: currentStep.category,
          language: "pt_BR"
        },
        processedParams: { "1": clientName }
      }
    });

    console.log(`Mensagem para o follow-up ${followUp.id} agendada com sucesso`);
  } catch (error) {
    console.error(`Erro ao processar passo atual do follow-up ${followUp.id}:`, error);
    throw error;
  }
}

// Função para determinar e agendar o próximo passo
// Modificação na função determineNextStep para usar IA em decisões
export async function determineNextStep(
  followUp: any,
  steps: FollowUpStep[],
  currentStepIndex: number
): Promise<void> {
  try {
    const nextStepIndex = currentStepIndex + 1;
    const currentStep = steps[currentStepIndex];

    // ADIÇÃO: Consultar IA para decisão inteligente de próximo passo
    const followUpSettings = JSON.parse(followUp.metadata || '{}');
    
    if (followUpSettings.enableAIDecisions !== false) { // Habilitado por padrão
      const aiDecision = await decideNextStepWithAI(followUp, currentStep);
      console.log(`Decisão de IA para próximo passo:`, aiDecision);
      
      // Agir com base na decisão da IA
      if (aiDecision.action === 'skip' && aiDecision.targetStep !== undefined) {
        // Registrar decisão no log
        console.log(`IA decidiu pular para o passo ${aiDecision.targetStep} - ${aiDecision.reason}`);
        
        // Registrar mensagem de sistema
        await createSystemMessage(
          followUp.id,
          `IA decidiu otimizar o fluxo: pular para o passo ${steps[aiDecision.targetStep]?.template_name}. Motivo: ${aiDecision.reason}`
        );
        
        // Pular para o passo definido pela IA
        await scheduleNextStepExecution(followUp, aiDecision.targetStep, 5000, steps);
        return;
      } else if (aiDecision.action === 'jump' && aiDecision.targetStage) {
        // Encontrar o estágio alvo
        const campaign = await prisma.followUpCampaign.findUnique({
          where: { id: followUp.campaign_id },
          include: {
            stages: { orderBy: { order: 'asc' } }
          }
        });
        
        const targetStage = campaign.stages.find(s => 
          s.id === aiDecision.targetStage || s.name === aiDecision.targetStage
        );
        
        if (targetStage) {
          // Registrar mensagem de sistema
          await createSystemMessage(
            followUp.id,
            `IA decidiu avançar o cliente diretamente para o estágio "${targetStage.name}". Motivo: ${aiDecision.reason}`
          );
          
          // Buscar o primeiro passo do estágio alvo
          const firstStepInTargetStage = await prisma.followUpStep.findFirst({
            where: { funnel_stage_id: targetStage.id },
            orderBy: { wait_time_ms: 'asc' }
          });
          
          if (firstStepInTargetStage) {
            // Atualizar follow-up e iniciar processamento no novo estágio
            await prisma.followUp.update({
              where: { id: followUp.id },
              data: {
                current_step_id: firstStepInTargetStage.id,
                current_stage_id: targetStage.id,
                next_message_at: new Date(Date.now() + 5000)
              }
            });
            
            // Agendar processamento com pequeno delay
            setTimeout(() => import('../manager').then(({ processFollowUpSteps }) => processFollowUpSteps(followUp.id)), 5000);
            return;
          }
        }
      } else if (aiDecision.action === 'complete') {
        // Completar o follow-up conforme recomendado pela IA
        await updateFollowUpStatus(followUp.id, 'completed', {
          completed_at: new Date()
        });
        
        // Criar mensagem de sistema
        await createSystemMessage(
          followUp.id,
          `Follow-up concluído por recomendação da IA. Motivo: ${aiDecision.reason}`
        );
        
        return;
      }
      // Se nenhuma ação especial, continuar com o fluxo normal
    }

    // Resto da lógica original da função
    // Verificar se chegamos ao fim dos passos
    if (nextStepIndex >= steps.length) {
      console.log(`Follow-up ${followUp.id} - Todos os passos foram processados...`);
      
      // Verificar mensagens pendentes
      const pendingMessages = await prisma.followUpMessage.findMany({
        where: {
          follow_up_id: followUp.id,
          delivered: false
        }
      });
      
      if (pendingMessages.length > 0) {
        return;
      }
      
      await updateFollowUpStatus(followUp.id, 'completed', {
        completed_at: new Date()
      });
      return;
    }

    // Lógica existente para mudança de estágio e agendamento de próximo passo
    const nextStep = steps[nextStepIndex];
    const isChangingStage = currentStep.stage_id !== nextStep.stage_id;
    const currentStageSteps = steps.filter(step => 
      step.stage_id === currentStep.stage_id || 
      step.funnel_stage_id === currentStep.funnel_stage_id
    );
    const isLastStepOfStage = currentStageSteps.indexOf(currentStep) === currentStageSteps.length - 1;

    if (isChangingStage && isLastStepOfStage) {
      await handleStageTransition(followUp, currentStep, nextStep);
    } else if (isChangingStage) {
      const nextStepInSameStage = steps.find((step, index) => 
        index > currentStepIndex && 
        (step.stage_id === currentStep.stage_id || step.funnel_stage_id === currentStep.funnel_stage_id)
      );
      
      if (nextStepInSameStage) {
        const nextStepIndex = steps.indexOf(nextStepInSameStage);
        const waitTime = nextStepInSameStage.wait_time_ms || parseTimeString(nextStepInSameStage.wait_time);
        await scheduleNextStepExecution(followUp, nextStepIndex, waitTime, steps);
      } else {
        await handleStageTransition(followUp, currentStep, nextStep);
      }
    } else {
      const waitTime = nextStep.wait_time_ms || parseTimeString(nextStep.wait_time);
      await scheduleNextStepExecution(followUp, nextStepIndex, waitTime, steps);
    }
  } catch (error) {
    console.error(`Erro ao determinar próximo passo para follow-up ${followUp.id}:`, error);
    throw error;
  }
}

// Função para lidar com transição de estágio - refatorada para usar campos estruturados
export async function handleStageTransition(
  followUp: any,
  currentStep: FollowUpStep,
  nextStep: FollowUpStep
): Promise<void> {
  try {
    // Modificação: Ao invés de avançar automaticamente, pausar para aguardar interação ou envio completo
    console.log(`Follow-up ${followUp.id} - Preparando transição para o próximo estágio: ${nextStep.stage_name}`);
    
    // MODIFICAÇÃO IMPORTANTE: Estamos removendo a verificação de mensagens pendentes
    // para permitir que o sistema avance mesmo com mensagens agendadas para o futuro.
    // Isto corrige o problema de pausar o follow-up incorretamente após enviar a primeira mensagem.
    
    // O código original verificava mensagens pendentes aqui, mas isso fazia com que
    // mensagens que foram apenas agendadas (mas ainda não enviadas) pausassem o follow-up
    // desnecessariamente.
    
    console.log(`Follow-up ${followUp.id} - Ignorando verificação de mensagens pendentes para avançar fluxo normalmente.`);
    
    // Todas as mensagens já foram enviadas, podemos avançar para o próximo estágio
    console.log(`Follow-up ${followUp.id} - Avançando para o próximo estágio: ${nextStep.stage_name}`);

    // Criar mensagem de sistema informando sobre a transição
    await createSystemMessage(
      followUp.id,
      `Sistema avançou para o próximo estágio "${nextStep.stage_name}" após concluir o estágio "${currentStep.stage_name}".`
    );

    // Avançar para o próximo estágio
    // Não podemos usar 'steps' aqui porque não está definido nesta função
    // Definimos um valor fixo para o nextStepIndex, que será ajustado depois
    const nextStepIndex = 0; // O primeiro passo do próximo estágio
    
    // Atualizar o follow-up para o novo estágio - usando apenas campos que existem no modelo
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: {
        // Removido: current_stage_name não existe no modelo FollowUp
        // Removido: previous_stage_name não existe no modelo FollowUp
        current_stage_id: nextStep.stage_id || nextStep.funnel_stage_id,
        waiting_for_response: false
      }
    });
    
    console.log(`Follow-up ${followUp.id} atualizado para estágio ${nextStep.stage_name} (ID: ${nextStep.stage_id || nextStep.funnel_stage_id})`);
    
    // Agendar o próximo passo com o tempo de espera adequado
    const waitTime = nextStep.wait_time_ms || parseTimeString(nextStep.wait_time);
    console.log(`Transição de estágio para: ${nextStep.stage_name}, próximo passo com tempo de espera: ${waitTime}ms`);
    // Removido referência a 'steps' que não está definido nesta função
    await scheduleNextStepExecution(followUp, nextStepIndex, waitTime);
  } catch (error) {
    console.error(`Erro ao gerenciar transição de estágio para follow-up ${followUp.id}:`, error);
    throw error;
  }
}

// Função para agendar a execução do próximo passo
export async function scheduleNextStepExecution(
  followUp: any,
  nextStepIndex: number,
  delay: number = 0,
  stepsArray?: FollowUpStep[] // Adicionar parâmetro de passos
): Promise<void> {
  try {
    if (stepsArray && stepsArray.length > nextStepIndex) {
      // Atualizar o índice do passo atual com o ID do passo correspondente
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: { current_step_id: stepsArray[nextStepIndex]?.id || null }
      });
    } else {
      // Apenas atualizar sem referência a steps
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: { current_step_id: null }
      });
    }

    // Garantir um delay mínimo para evitar processamento imediato
    const effectiveDelay = delay > 0 ? delay : parseTimeString("30s");
    console.log(`Agendando próximo passo ${nextStepIndex} para follow-up ${followUp.id} com delay de ${effectiveDelay}ms`);
    
    // Sempre usar setTimeout para garantir que não haja processamento em cascata
    setTimeout(async () => {
      try {
        // Verificar se o follow-up ainda está ativo antes de continuar
        const currentFollowUp = await prisma.followUp.findUnique({
          where: { id: followUp.id }
        });

        if (!currentFollowUp || currentFollowUp.status !== 'active') {
          console.log(`Follow-up ${followUp.id} não está mais ativo, ignorando agendamento`);
          return;
        }

        // Processar o próximo passo
        const { processFollowUpSteps } = await import('../manager');
        await processFollowUpSteps(followUp.id);
      } catch (error) {
        console.error(`Erro ao processar passo agendado para follow-up ${followUp.id}:`, error);
      }
    }, effectiveDelay);
  } catch (error) {
    console.error(`Erro ao agendar próximo passo para follow-up ${followUp.id}:`, error);
    throw error;
  }
}

// Função para processar avanço de estágio após resposta do cliente - refatorada para usar campos estruturados
export async function processStageAdvancement(
  followUp: any,
  steps: FollowUpStep[],
  currentStep: FollowUpStep,
  message: string
): Promise<void> {
  try {
    // Importar a função necessária para evitar referência circular
    const { cancelScheduledMessages } = await import('../scheduler');
    
    // Cancelar quaisquer mensagens agendadas
    await cancelScheduledMessages(followUp.id);

    // Obter todos os estágios da campanha em ordem
    const campaignStages = followUp.campaign?.stages || [];

    // Garantir que os estágios estão ordenados corretamente
    const sortedStages = [...campaignStages].sort((a, b) => a.order - b.order);

    // Mapear nomes dos estágios na ordem correta
    const stageNames = sortedStages.map(stage => stage.name);

    // Se não existirem estágios definidos na campanha, extrair dos passos (fallback)
    if (stageNames.length === 0) {
      // Encontrar estágios únicos dos passos e ordená-los
      const uniqueStages = [...new Set(steps.map(s => s.stage_name))];
      uniqueStages.sort((a, b) => {
        const stageA = steps.find(s => s.stage_name === a);
        const stageB = steps.find(s => s.stage_name === b);
        return (stageA?.stage_order || 0) - (stageB?.stage_order || 0);
      });
      stageNames.push(...uniqueStages);
    }

    console.log('Estágios ordenados:', stageNames);

    // Encontrar o índice do estágio atual
    const currentStageName = currentStep.stage_name;
    const currentStageIndex = stageNames.indexOf(currentStageName);
    console.log('Estágio atual:', currentStageName, 'índice:', currentStageIndex);

    // IMPORTANTE: Sempre avançar para o próximo estágio em sequência
    // Ignorar os metadados e usar sempre a ordem definida na campanha
    const nextStageIndex = currentStageIndex + 1;
    const nextStageName = nextStageIndex < stageNames.length ? stageNames[nextStageIndex] : null;
    
    console.log(`Avançando para próximo estágio - ignorando metadados para evitar loops`);

    console.log('Próximo índice de estágio:', nextStageIndex, 'de total:', stageNames.length);

    // Se não existe próximo estágio, completar o follow-up
    if (nextStageIndex >= stageNames.length || !nextStageName) {
      console.log(`Follow-up ${followUp.id} - Cliente já está no último estágio`);

      await updateFollowUpStatus(followUp.id, 'completed', {
        completed_at: new Date(),
        last_response: message,
        last_response_at: new Date()
      });
      
      // Criar mensagem de sistema
      await createSystemMessage(
        followUp.id,
        `Follow-up concluído após resposta do cliente no último estágio "${currentStageName}"`
      );

      console.log(`Follow-up ${followUp.id} concluído após resposta do cliente`);
      return;
    }

    console.log(`Avançando de "${currentStageName}" para "${nextStageName}"`);

    // Obter o ID do próximo estágio
    const nextStageId = sortedStages[nextStageIndex]?.id;
    
    // Encontrar o primeiro passo do próximo estágio diretamente do banco
    const stepsInNextStage = await prisma.followUpStep.findMany({
      where: {
        funnel_stage_id: nextStageId
      },
      orderBy: { wait_time_ms: 'asc' },
      take: 1
    });

    if (stepsInNextStage.length === 0) {
      console.error(`Não foi possível encontrar passos para o estágio ${nextStageName}`);

      await updateFollowUpStatus(followUp.id, 'paused', {
        waiting_for_response: false,
        last_response: message,
        last_response_at: new Date()
      });

      // Criar mensagem de sistema
      await createSystemMessage(
        followUp.id,
        `Follow-up pausado: o estágio "${nextStageName}" não possui passos configurados`
      );

      return;
    }

    // Usar o primeiro passo do próximo estágio
    const nextStep = stepsInNextStage[0];

    // Atualizar o follow-up para o novo estágio e passo
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: {
        current_step_id: nextStep.id || null,
        status: 'active',
        next_message_at: new Date(),
        current_stage_id: nextStageId,
        waiting_for_response: false,
        last_response: message,
        last_response_at: new Date()
      }
    });

    // Criar mensagem de sistema
    await createSystemMessage(
      followUp.id,
      `Cliente respondeu e avançou de "${currentStageName}" para "${nextStageName}"`
    );

    console.log(`Follow-up ${followUp.id} avançado para o estágio ${nextStageName}`);

    // Iniciar processamento no novo estágio
    const { processFollowUpSteps } = await import('../manager');
    await processFollowUpSteps(followUp.id);
  } catch (error) {
    console.error(`Erro ao processar avanço de estágio para follow-up ${followUp.id}:`, error);
    throw error;
  }
}

// Função para processar resposta durante follow-up ativo - refatorada para usar campos estruturados
export async function processActiveFollowUpResponse(
  followUp: any,
  message: string
): Promise<void> {
  try {
    // Obter todos os passos da campanha
    const steps = await getCampaignSteps(followUp);
    
    if (!steps.length) {
      console.error(`Nenhum passo encontrado para o follow-up ${followUp.id}`);
      return;
    }
    
    // Obter o passo atual
    const currentStepIndex = steps.findIndex(step => step.id === followUp.current_step_id) || 0;
    const currentStep = currentStepIndex < steps.length ? steps[currentStepIndex] : null;
    
    if (!currentStep) {
      console.error(`Passo atual (${currentStepIndex}) não encontrado para follow-up ${followUp.id}`);
      return;
    }
    
    // Verificar se existem mensagens já criadas/agendadas e pendentes no estágio atual
    const pendingMessages = await prisma.followUpMessage.findMany({
      where: {
        follow_up_id: followUp.id,
        delivered: false
      }
    });
    
    // Registrar informações adicionais para debug
    console.log(`Follow-up ${followUp.id} - Verificando mensagens pendentes:
      - Estágio atual: ${currentStep.stage_name}
      - Passo atual ID: ${followUp.current_step_id || 'não definido'}
      - Total de mensagens pendentes: ${pendingMessages.length}
      - Passos pendentes: ${pendingMessages.map(m => m.step_id).join(', ')}
    `);
    
    // Consultar quantas mensagens estão previstas para esse estágio
    const stepsCount = await prisma.followUpStep.count({
      where: {
        funnel_stage_id: followUp.current_stage_id
      }
    });
    
    console.log(`Total de passos previstos: ${stepsCount}`);
    
    if (pendingMessages.length > 0) {
      console.log(`Follow-up ${followUp.id} - Existem ${pendingMessages.length} mensagens pendentes no estágio atual. Registrando resposta, mas mantendo o estágio.`);
      
      // Atualizar para registrar que o cliente respondeu
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          waiting_for_response: false,
          last_response: message,
          last_response_at: new Date()
        }
      });
      
      // Criar mensagem de sistema
      await createSystemMessage(
        followUp.id,
        `Cliente respondeu enquanto ainda há mensagens sendo enviadas. Resposta registrada, aguardando conclusão do envio.`
      );
      
      return;
    }
    
    // Verificar se pelo menos uma mensagem foi enviada para este follow-up
    const messagesDelivered = await prisma.followUpMessage.count({
      where: {
        follow_up_id: followUp.id,
        delivered: true
      }
    });
    
    if (messagesDelivered === 0) {
      console.log(`Follow-up ${followUp.id} - Nenhuma mensagem enviada ainda. Registrando resposta, mas mantendo estágio atual.`);
      
      // Atualizar para registrar que o cliente respondeu, mas não avançar estágio
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          waiting_for_response: false,
          status: 'active',
          last_response: message,
          last_response_at: new Date()
        }
      });
      
      // Criar mensagem de sistema
      await createSystemMessage(
        followUp.id,
        `Cliente respondeu antes da primeira mensagem ser enviada. Resposta registrada, mas mantendo estágio atual.`
      );
      
      return;
    }
    
    // Obter todos os estágios da campanha em ordem
    const campaignStages = followUp.campaign?.stages || [];
    const sortedStages = [...campaignStages].sort((a, b) => a.order - b.order);
    const stageNames = sortedStages.map(stage => stage.name);
    
    // Se não existirem estágios definidos na campanha, extrair dos passos (fallback)
    if (stageNames.length === 0) {
      // Encontrar estágios únicos dos passos e ordená-los
      const uniqueStages = [...new Set(steps.map(s => s.stage_name))];
      uniqueStages.sort((a, b) => {
        const stageA = steps.find(s => s.stage_name === a);
        const stageB = steps.find(s => s.stage_name === b);
        return (stageA?.stage_order || 0) - (stageB?.stage_order || 0);
      });
      stageNames.push(...uniqueStages);
    }
    
    // Encontrar o índice do estágio atual
    // Usando nome do estágio do passo atual
    const currentStageName = currentStep.stage_name;
    const currentStageIndex = stageNames.indexOf(currentStageName);
    console.log('Estágio atual:', currentStageName, 'índice:', currentStageIndex);
    
    // Verificar se este é o último passo do estágio atual
    const stepsInCurrentStage = steps.filter(s => 
      s.stage_name === currentStageName || 
      s.funnel_stage?.name === currentStageName
    );
    
    // Ordenar passos no estágio atual
    stepsInCurrentStage.sort((a, b) => steps.indexOf(a) - steps.indexOf(b));
    
    // Verificar se o passo atual é o último passo do estágio
    const isLastStepOfStage = stepsInCurrentStage.length > 0 && 
                              stepsInCurrentStage[stepsInCurrentStage.length - 1].id === currentStep.id;
                              
    // Informar no log que vamos tentar avançar o estágio
    
    // Verificar total de mensagens entregues neste estágio
    const deliveredMessages = await prisma.followUpMessage.count({
      where: {
        follow_up_id: followUp.id,
        delivered: true
      }
    });
    
    // Verificar total de passos neste estágio
    const totalStepsInStage = await prisma.followUpStep.count({
      where: {
        funnel_stage_id: followUp.current_stage_id
      }
    });
    
    console.log(`Cliente respondeu durante estágio ${currentStageName}. 
    - Mensagens entregues: ${deliveredMessages}/${totalStepsInStage} 
    - Tentaremos avançar para o próximo estágio.`);
    
    // Verificar se existe próximo estágio
    if (currentStageIndex < stageNames.length - 1) {
      // A resposta do cliente pode avançar para o próximo estágio em qualquer passo, 
      // não apenas no último passo do estágio
      const nextStageName = stageNames[currentStageIndex + 1];
      
      // Encontrar o primeiro passo do próximo estágio
      const nextStageId = sortedStages[currentStageIndex + 1]?.id;
      
      if (nextStageId) {
        // Buscar os passos do próximo estágio diretamente do banco
        const stepsInNextStage = await prisma.followUpStep.findMany({
          where: {
            funnel_stage_id: nextStageId
          },
          orderBy: { wait_time_ms: 'asc' },
          take: 1
        });
        
        if (stepsInNextStage.length > 0) {
          const nextStep = stepsInNextStage[0];
          
          console.log(`Cliente respondeu durante follow-up ativo. Avançando para próximo estágio: ${nextStageName}`);
          
          // Cancelar mensagens agendadas do estágio atual
          const { cancelScheduledMessages } = await import('../scheduler');
          await cancelScheduledMessages(followUp.id);
          
          // Atualizar o follow-up para o novo estágio usando campos estruturados
          await prisma.followUp.update({
            where: { id: followUp.id },
            data: {
              current_step_id: nextStep?.id || null,
              status: 'active', // Garantir que o status está ativo
              waiting_for_response: false, // Não está mais aguardando resposta
              current_stage_id: nextStageId,
              last_response: message,
              last_response_at: new Date()
            }
          });
          
          // Criar mensagem de sistema registrando a transição de estágio
          await createSystemMessage(
            followUp.id,
            `Cliente respondeu e avançou de "${currentStageName}" para "${nextStageName}"`
          );
          
          // Iniciar processamento no novo estágio
          const { processFollowUpSteps } = await import('../manager');
          await processFollowUpSteps(followUp.id);
          return;
        }
      }
    }
    
    // Mesmo que não avance de estágio, atualizar para garantir que não estamos esperando resposta
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: {
        waiting_for_response: false,
        status: 'active', // Garantir que está ativo
        last_response: message,
        last_response_at: new Date()
      }
    });
    
    console.log(`Resposta do cliente registrada para follow-up ${followUp.id} (status: ${followUp.status})`);
  } catch (error) {
    console.error(`Erro ao processar resposta para follow-up ativo ${followUp.id}:`, error);
    throw error;
  }
}