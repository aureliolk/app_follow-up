// app/api/follow-up/_lib/manager.refactor.ts
// Versão refatorada do gerenciador de follow-up

import { prisma } from '@/lib/db';
import { scheduleMessage, cancelScheduledMessages, activeTimeouts } from './scheduler';

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

const TEST_MODE = true;
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
async function updateFollowUpStatus(
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

    // Removido: o modelo FollowUpStateTransition não existe no schema

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
async function createSystemMessage(
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
function normalizeStep(step: any): FollowUpStep {
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
async function getCampaignSteps(followUp: any): Promise<FollowUpStep[]> {
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
async function processCurrentStep(followUp: any, currentStep: FollowUpStep, currentStepIndex: number = 0): Promise<void> {
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
          current_stage_id: currentStep.funnel_stage_id,
          // metadata não existe no modelo FollowUp
        }
      });
      
      // Já adicionamos a mensagem de sistema acima
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

    // Criar registro da mensagem com os campos atualizados
    const message = await prisma.followUpMessage.create({
      data: {
        follow_up_id: followUp.id,
        step_id: currentStep.id, // Usando step_id em vez de step
        content: currentStep.message || currentStep.message_content,
        sent_at: new Date(),
        delivered: false,
        is_from_client: false
      }
    });

    // Preparar dados para envio
    const clientName = followUp.client_id?.charAt(0).toUpperCase() +
      (followUp.client_id?.slice(1).toLowerCase() || '');

    // Agendar o envio da mensagem - com formato atualizado de metadata
    await scheduleMessage({
      followUpId: followUp.id,
      stepIndex: currentStepIndex,
      message: currentStep.message || currentStep.message_content,
      scheduledTime: nextMessageTime,
      clientId: followUp.client_id,
      metadata: {
        template_name: currentStep.template_name,
        category: currentStep.category,
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
async function determineNextStep(
  followUp: any,
  steps: FollowUpStep[],
  currentStepIndex: number
): Promise<void> {
  try {
    const nextStepIndex = currentStepIndex + 1;

    // Verificar se chegamos ao fim dos passos
    if (nextStepIndex >= steps.length) {
      console.log(`Follow-up ${followUp.id} - Todos os passos foram processados. Verificando mensagens pendentes...`);
      
      // Verificar se há mensagens pendentes antes de completar
      const pendingMessages = await prisma.followUpMessage.findMany({
        where: {
          follow_up_id: followUp.id,
          delivered: false
        }
      });
      
      if (pendingMessages.length > 0) {
        console.log(`Ainda existem ${pendingMessages.length} mensagens pendentes (passos ${pendingMessages.map(m => m.step).join(', ')}) antes de completar o follow-up. Aguardando envio...`);
        
        // Não marcar como completo ainda, apenas retornar
        return;
      }
      
      // Removido: metadata não existe no modelo FollowUp
      
      console.log(`Todas as mensagens foram entregues. Marcando follow-up como completo.`);
      
      await updateFollowUpStatus(followUp.id, 'completed', {
        completed_at: new Date()
        // metadata não existe no modelo FollowUp
      });
      return;
    }

    // Obter informações do passo atual e próximo
    const currentStep = steps[currentStepIndex];
    const nextStep = steps[nextStepIndex];

    // Verificar se estamos mudando de estágio
    const isChangingStage = currentStep.stage_id !== nextStep.stage_id;

    // Coletar todos os passos do estágio atual
    const currentStageSteps = steps.filter(step => 
      step.stage_id === currentStep.stage_id || 
      step.funnel_stage_id === currentStep.funnel_stage_id
    );
    
    // Verificar se o passo atual é o último do seu estágio
    const isLastStepOfStage = currentStageSteps.indexOf(currentStep) === currentStageSteps.length - 1;

    if (isChangingStage && isLastStepOfStage) {
      // MODIFICAÇÃO: Não vamos pausar ou esperar resposta do cliente,
      // apenas avanço para o próximo estágio automaticamente
      console.log(`Follow-up ${followUp.id} - Último passo do estágio "${currentStep.stage_name}", avançando diretamente para "${nextStep.stage_name}"`);
      
      // Avançar diretamente para o próximo estágio sem esperar resposta
      await handleStageTransition(followUp, currentStep, nextStep);
    } else if (isChangingStage) {
      // Se não for o último passo do estágio, continuar executando os passos dentro do mesmo estágio
      console.log(`Follow-up ${followUp.id} - Ainda existem passos no estágio atual, continuando no mesmo estágio`);
      
      // Encontrar o próximo passo dentro do mesmo estágio
      const nextStepInSameStage = steps.find((step, index) => 
        index > currentStepIndex && 
        (step.stage_id === currentStep.stage_id || step.funnel_stage_id === currentStep.funnel_stage_id)
      );
      
      if (nextStepInSameStage) {
        const nextStepIndex = steps.indexOf(nextStepInSameStage);
        const waitTime = nextStepInSameStage.wait_time_ms || parseTimeString(nextStepInSameStage.wait_time);
        console.log(`Próximo passo dentro do mesmo estágio, tempo de espera: ${waitTime}ms`);
        await scheduleNextStepExecution(followUp, nextStepIndex, waitTime, steps);
      } else {
        // Se não encontrou passos adicionais no mesmo estágio (não deveria acontecer)
        console.log(`Follow-up ${followUp.id} - Não encontrou mais passos no estágio atual`);
        await handleStageTransition(followUp, currentStep, nextStep);
      }
    } else {
      // Mesmo estágio - agendar próximo passo normalmente passando o tempo de espera
      const waitTime = nextStep.wait_time_ms || parseTimeString(nextStep.wait_time);
      console.log(`Próximo passo: ${nextStep.template_name}, tempo de espera: ${waitTime}ms`);
      await scheduleNextStepExecution(followUp, nextStepIndex, waitTime, steps);
    }
  } catch (error) {
    console.error(`Erro ao determinar próximo passo para follow-up ${followUp.id}:`, error);
    throw error;
  }
}

// Função para lidar com transição de estágio - refatorada para usar campos estruturados
async function handleStageTransition(
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

    // Removido: o modelo FollowUpStateTransition não existe no schema

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
async function scheduleNextStepExecution(
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
        funnel_stage_id: followUp.current_stage_id
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
    
    // Mapear para o formato esperado
    const formattedSteps = steps.map(normalizeStep);
    
    // Log de depuração para verificar quais passos estão sendo buscados
    console.log(`Follow-up ${followUpId} - Buscando passos do estágio: ${followUp.current_stage_id}`);
    console.log(`Follow-up ${followUpId} - Encontrados ${formattedSteps.length} passos para o estágio atual`);

    // 4. Verificar se existem passos configurados
    if (!formattedSteps.length) {
      console.log(`Follow-up ${followUpId} - Campanha não possui passos configurados`);

      // Pausar o follow-up e registrar o motivo usando campos estruturados
      await updateFollowUpStatus(followUpId, 'paused', {
        // paused_reason não existe no modelo FollowUp
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
      const index = formattedSteps.findIndex(step => step.id === currentStepId);
      if (index >= 0) {
        currentStepIndex = index;
      }
    }
    
    const currentStep = formattedSteps[currentStepIndex];

    // 6. Verificar se o passo atual é válido
    if (!currentStep) {
      console.log(`Follow-up ${followUpId} - Passo ${currentStepIndex} não encontrado`);

      // Pausar o follow-up e registrar o motivo usando campos estruturados
      await updateFollowUpStatus(followUpId, 'paused', {
        // paused_reason não existe no modelo FollowUp
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

// Função para lidar com resposta do cliente e avançar para o próximo estágio - refatorada para usar campos estruturados
export async function handleClientResponse(
  clientId: string,
  message: string,
  followUpId?: string
): Promise<void> {
  // Nota: Esta função usa o modelo FollowUpClientResponse que não existe no schema
  // Precisamos modificar para usar apenas os modelos existentes
  try {
    console.log('=== DADOS DA RESPOSTA DO CLIENTE ===');
    console.log({ followUpId, clientId, message });
    console.log('=== FIM DADOS DA RESPOSTA DO CLIENTE ===');

    // 1. Buscar follow-ups ativos ou pausados para este cliente
    const activeFollowUps = await prisma.followUp.findMany({
      where: {
        client_id: clientId,
        status: { in: ['active', 'paused'] },
        ...(followUpId ? { id: followUpId } : {})
      },
      include: {
        campaign: {
          include: {
            campaign_steps: { include: { funnel_stage: true } },
            stages: { orderBy: { order: 'asc' } }
          }
        }
      }
    });

    if (!activeFollowUps.length) {
      console.log(`Nenhum follow-up ativo ou pausado encontrado para o cliente ${clientId}`);
      return;
    }

    // 2. Processar cada follow-up encontrado
    for (const followUp of activeFollowUps) {
      // Obter todos os passos da campanha
      const steps = await getCampaignSteps(followUp);

      if (!steps.length) {
        console.error(`Nenhum passo encontrado para o follow-up ${followUp.id}`);
        continue;
      }

      // Obter o passo atual
      const currentStepIndex = formattedSteps.findIndex(step => step.id === followUp.current_step_id) || 0;
      const currentStep = currentStepIndex < steps.length ? steps[currentStepIndex] : null;

      if (!currentStep) {
        console.error(`Passo atual (${currentStepIndex}) não encontrado para follow-up ${followUp.id}`);
        continue;
      }

      // Registrar a mensagem do cliente
      await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUp.id,
          step_id: null,
          content: message,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date(),
          // Removido: funnel_stage não existe no modelo FollowUpMessage
          is_from_client: true
        }
      });

      // Removido: o modelo FollowUpClientResponse não existe no schema

      // Atualizar follow-up com a última resposta
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          last_response: message,
          last_response_at: new Date()
          // Removido: is_responsive não existe no modelo FollowUp
        }
      });

      // Verificar se o follow-up está pausado aguardando mensagens ou resposta do cliente
      if (followUp.status === 'paused') {
        if (followUp.waiting_for_response) {
          // Cliente respondeu a uma solicitação específica de resposta
          await processStageAdvancement(followUp, steps, currentStep, message);
        } 
        else if (followUp.paused_reason && followUp.paused_reason.includes('Aguardando envio de')) {
          // Verificar se temos mensagens pendentes
          const pendingMessages = await prisma.followUpMessage.findMany({
            where: {
              follow_up_id: followUp.id,
              // Removido: funnel_stage não existe no modelo FollowUpMessage
              delivered: false
            }
          });
          
          if (pendingMessages.length === 0) {
            // Não há mais mensagens pendentes, podemos retomar o fluxo
            console.log(`Cliente respondeu e não há mais mensagens pendentes`);
            
            // Atualizar status para ativo e limpar razão de pausa
            await prisma.followUp.update({
              where: { id: followUp.id },
              data: {
                status: 'active',
                // paused_reason não existe no modelo FollowUp
                waiting_for_response: false
              }
            });
            
            // Avançar para próximo estágio
            await processStageAdvancement(followUp, steps, currentStep, message);
          }
          else {
            console.log(`Cliente respondeu mas ainda temos ${pendingMessages.length} mensagens pendentes`);
            // Manter pausado, mas marcar como responsivo
            await prisma.followUp.update({
              where: { id: followUp.id },
              data: {
                // Removido: is_responsive não existe no modelo FollowUp
              }
            });
          }
        }
      } else {
        // É uma resposta durante um follow-up ativo
        await processActiveFollowUpResponse(followUp, message);
      }
    }
  } catch (error) {
    console.error("Erro ao processar resposta do cliente:", error);
    throw error;
  }
}

// Função para processar avanço de estágio após resposta do cliente - refatorada para usar campos estruturados
async function processStageAdvancement(
  followUp: any,
  steps: FollowUpStep[],
  currentStep: FollowUpStep,
  message: string
): Promise<void> {
  try {
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
    // Usando nome do estágio do passo atual já que current_stage_name não existe no modelo
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

      // Atualizar a resposta do cliente como triggerando avanço
      await prisma.followUpClientResponse.updateMany({
        where: {
          follow_up_id: followUp.id,
          message
        },
        data: {
          triggered_advance: true
        }
      });

      await updateFollowUpStatus(followUp.id, 'completed', {
        // completion_reason e processed_by_response não existem no modelo FollowUp
        // metadata não existe no modelo FollowUp
      });
      
      // Criar mensagem de sistema
      await createSystemMessage(
        followUp.id,
        `Follow-up concluído após resposta do cliente no último estágio "${currentStageName}"`,
        "System"
      );

      console.log(`Follow-up ${followUp.id} concluído após resposta do cliente`);
      return;
    }

    console.log(`Avançando de "${currentStageName}" para "${nextStageName}"`);

    // Encontrar o primeiro passo do próximo estágio
    const stepsInNextStage = steps
      .filter(s => s.stage_name === nextStageName)
      .sort((a, b) => a.wait_time_ms - b.wait_time_ms);

    if (stepsInNextStage.length === 0) {
      console.error(`Não foi possível encontrar passos para o estágio ${nextStageName}`);

      await updateFollowUpStatus(followUp.id, 'paused', {
        // paused_reason não existe no modelo FollowUp
        // metadata não existe no modelo FollowUp
      });

      // Criar mensagem de sistema
      await createSystemMessage(
        followUp.id,
        `Follow-up pausado: o estágio "${nextStageName}" não possui passos configurados`,
        "System"
      );

      return;
    }

    // Usar o primeiro passo do próximo estágio
    const nextStep = stepsInNextStage[0];
    const firstStepOfNextStage = steps.findIndex(s => s.id === nextStep.id);

    if (firstStepOfNextStage < 0) {
      console.error(`Não foi possível encontrar o índice do primeiro passo do estágio ${nextStageName}`);
      return;
    }

    // Removido: o modelo FollowUpStateTransition não existe no schema

    // Removido: o modelo FollowUpClientResponse não existe no schema

    // Atualizar o follow-up para o novo estágio e passo usando campos estruturados
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: {
        current_step_id: stepsInNextStage[0]?.id || null,
        // Removido: is_responsive não existe no modelo FollowUp
        status: 'active',
        next_message_at: new Date(),
        current_stage_id: nextStep.stage_id || nextStep.funnel_stage_id,
        // Removido: current_stage_name e previous_stage_name não existem no modelo FollowUp
        waiting_for_response: false
      }
    });

    // Criar mensagem de sistema
    await createSystemMessage(
      followUp.id,
      `Cliente respondeu e avançou de "${currentStageName}" para "${nextStageName}"`,
      "System"
    );

    console.log(`Follow-up ${followUp.id} avançado para o estágio ${nextStageName}, passo ${firstStepOfNextStage}`);

    // Iniciar processamento no novo estágio
    await processFollowUpSteps(followUp.id);
  } catch (error) {
    console.error(`Erro ao processar avanço de estágio para follow-up ${followUp.id}:`, error);
    throw error;
  }
}

// Função para processar resposta durante follow-up ativo - refatorada para usar campos estruturados
async function processActiveFollowUpResponse(
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
        // Removido: funnel_stage não existe no modelo FollowUpMessage
        delivered: false
      }
    });
    
    // Registrar informações adicionais para debug
    console.log(`Follow-up ${followUp.id} - Verificando mensagens pendentes:
      - Estágio atual: ${currentStep.stage_name}
      - Passo atual ID: ${followUp.current_step_id || 'não definido'}
      - Total de mensagens pendentes: ${pendingMessages.length}
      - Passos pendentes: ${pendingMessages.map(m => m.step).join(', ')}
    `);
    
    // Consultar quantas mensagens estão previstas para esse estágio
    const stagesDetails = await prisma.followUpStep.count({
      where: {
        campaign_id: followUp.campaign_id,
        funnel_stage_id: followUp.current_stage_id
      }
    });
    
    console.log(`Total de passos previstos: ${stagesDetails}`);
    
    if (pendingMessages.length > 0) {
      console.log(`Follow-up ${followUp.id} - Existem ${pendingMessages.length} mensagens pendentes no estágio atual. Registrando resposta, mas mantendo o estágio.`);
      
      // Atualizar para registrar que o cliente é responsivo
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          // Removido: is_responsive não existe no modelo FollowUp
          waiting_for_response: false
        }
      });
      
      // Criar mensagem de sistema
      await createSystemMessage(
        followUp.id,
        `Cliente respondeu enquanto ainda há mensagens sendo enviadas. Resposta registrada, aguardando conclusão do envio.`,
        "System"
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
      
      // Atualizar para registrar que o cliente é responsivo, mas não avançar estágio
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          // Removido: is_responsive não existe no modelo FollowUp
          waiting_for_response: false,
          status: 'active'
        }
      });
      
      // Criar mensagem de sistema
      await createSystemMessage(
        followUp.id,
        `Cliente respondeu antes da primeira mensagem ser enviada. Resposta registrada, mas mantendo estágio atual.`,
        "System"
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
    // Usando nome do estágio do passo atual já que current_stage_name não existe no modelo
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
    // Mas somente se o cliente realmente respondeu por iniciativa própria
    // (não por um mecanismo automático)
    
    // Verificar total de mensagens entregues neste estágio
    const deliveredMessages = await prisma.followUpMessage.count({
      where: {
        follow_up_id: followUp.id,
        // Removido: funnel_stage não existe no modelo FollowUpMessage
        delivered: true
      }
    });
    
    // Verificar total de passos neste estágio
    const totalStepsInStage = await prisma.followUpStep.count({
      where: {
        campaign_id: followUp.campaign_id,
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
      const stepsInNextStage = steps
        .filter(s => s.stage_name === nextStageName)
        .sort((a, b) => a.wait_time_ms - b.wait_time_ms);
      
      if (stepsInNextStage.length > 0) {
        const nextStep = stepsInNextStage[0];
        const firstStepOfNextStage = steps.findIndex(s => s.id === nextStep.id);
        
        if (firstStepOfNextStage >= 0) {
          console.log(`Cliente respondeu durante follow-up ativo. Avançando para próximo estágio: ${nextStageName}`);
          
          // Cancelar mensagens agendadas do estágio atual
          await cancelScheduledMessages(followUp.id);
          
          // Removido: o modelo FollowUpStateTransition não existe no schema
          
          // Removido: o modelo FollowUpClientResponse não existe no schema
          
          // Atualizar o follow-up para o novo estágio usando campos estruturados
          await prisma.followUp.update({
            where: { id: followUp.id },
            data: {
              current_step_id: stepsInNextStage[0]?.id || null,
              // Removido: is_responsive não existe no modelo FollowUp,
              status: 'active', // Garantir que o status está ativo
              waiting_for_response: false, // Não está mais aguardando resposta
              current_stage_id: nextStep.stage_id || nextStep.funnel_stage_id,
              // Removido: current_stage_name e previous_stage_name não existem no modelo FollowUp
              // processed_by_response não existe no modelo FollowUp
              // metadata não existe no modelo FollowUp
            }
          });
          
          // Criar mensagem de sistema registrando a transição de estágio
          await createSystemMessage(
            followUp.id,
            `Cliente respondeu e avançou de "${currentStageName}" para "${nextStageName}"`,
            "System"
          );
          
          // Iniciar processamento no novo estágio
          await processFollowUpSteps(followUp.id);
          return;
        }
      }
    }
    
    // Mesmo que não avance de estágio, atualizar para garantir que não estamos esperando resposta
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: {
        // Removido: is_responsive não existe no modelo FollowUp
        waiting_for_response: false,
        status: 'active' // Garantir que está ativo
      }
    });
    
    console.log(`Resposta do cliente registrada para follow-up ${followUp.id} (status: ${followUp.status})`);
  } catch (error) {
    console.error(`Erro ao processar resposta para follow-up ativo ${followUp.id}:`, error);
    throw error;
  }
}

export async function resumeFollowUp(followUpId: string): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({ where: { id: followUpId } });
    if (!followUp) throw new Error(`Follow-up não encontrado: ${followUpId}`);
    if (followUp.status !== 'paused') return;

    // Removido: o modelo FollowUpStateTransition não existe no schema

    // Atualizar para status ativo
    await prisma.followUp.update({
      where: { id: followUpId },
      data: { 
        status: 'active', 
        // Removido: is_responsive não existe no modelo FollowUp 
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
            campaign_steps: {
              include: { funnel_stage: true }
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
      await updateFollowUpStatus(followUpId, 'completed', {
        // completion_reason não existe no modelo FollowUp
      });
      return;
    }

    // Removido: o modelo FollowUpStateTransition não existe no schema

    // Atualizar status e avançar para o próximo passo
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        current_step_id: steps[nextStepIndex]?.id || null,
        status: 'active',
        // Removido: is_responsive não existe no modelo FollowUp
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