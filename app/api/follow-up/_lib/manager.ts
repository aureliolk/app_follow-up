// app/api/follow-up/_lib/manager.ts
import { prisma } from '@/lib/db';
import { scheduleMessage, cancelScheduledMessages, activeTimeouts } from './scheduler';

// Interface para os dados de follow-up - alinhada com schema.prisma
interface FollowUpStep {
  wait_time_ms: any;
  stage_order: any;
  stage_name: string;    // Novo padrão (antigo: etapa)
  message: string;       // Novo padrão (antigo: mensagem)
  wait_time: string;     // Novo padrão (antigo: tempo_de_espera) - Formato: "1d", "2h", "30m"
  template_name: string;
  stage_id?: string;
  category?: string;
  auto_respond?: boolean;
  id?: string;
}

const TEST_MODE = true; // Defina como false em produção
console.log("MODO DE TESTE CONFIGURADO COMO:", TEST_MODE ? "ATIVADO" : "DESATIVADO");

// Nova função loadFollowUpData que carrega apenas do banco de dados
export async function loadFollowUpData(campaignId?: string): Promise<FollowUpStep[]> {
  try {
    // Verificar se temos um ID de campanha
    if (!campaignId) {
      console.error("ID da campanha é obrigatório para carregar etapas");
      return [];
    }

    const campaign = await prisma.followUpCampaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      console.error(`Campanha de follow-up não encontrada: ${campaignId}`);
      return [];
    }

    // Processar os passos da campanha
    try {
      const stepsString = campaign.steps as string;
      if (!stepsString || stepsString.trim() === '' || stepsString === '[]') {
        console.log(`Campanha ${campaignId} tem steps vazios ou inválidos, retornando array vazio`);
        return [];
      }
      return JSON.parse(stepsString) as FollowUpStep[];
    } catch (err) {
      console.error(`Erro ao analisar steps da campanha ${campaignId}:`, err);
      return []; // Retornar array vazio em caso de erro
    }
  } catch (error) {
    console.error("Erro ao carregar dados de follow-up:", error);
    return [];
  }
}

// Função para converter string de tempo em milissegundos
export function parseTimeString(timeStr: string): number {
  if (TEST_MODE) {
    return 30 * 1000; // 30 segundos para testes
  }
  
  // Se o tempo estiver vazio ou for inválido, usar 30 minutos como padrão
  if (!timeStr || timeStr === undefined || timeStr.trim() === "") {
    return 30 * 60 * 1000; // 30 minutos
  }

  const units: Record<string, number> = {
    's': 1000,           // segundos
    'm': 60 * 1000,      // minutos
    'h': 60 * 60 * 1000, // horas
    'd': 24 * 60 * 60 * 1000, // dias
  };

  // Extrair números do texto (para lidar com formatos como "10 minutos")
  const extractNumbers = (text: string): number => {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : NaN;
  };

  // Verificar formato de texto com minutos
  if (timeStr.toLowerCase().includes("minuto")) {
    const minutos = extractNumbers(timeStr);
    return isNaN(minutos) ? 30 * 60 * 1000 : minutos * 60 * 1000;
  }
  // Verificar formato de texto com horas
  else if (timeStr.toLowerCase().includes("hora")) {
    const horas = extractNumbers(timeStr);
    return isNaN(horas) ? 60 * 60 * 1000 : horas * 60 * 60 * 1000;
  }
  // Verificar formato de texto com dias
  else if (timeStr.toLowerCase().includes("dia")) {
    const dias = extractNumbers(timeStr);
    return isNaN(dias) ? 24 * 60 * 60 * 1000 : dias * 24 * 60 * 60 * 1000;
  }
  // Verificar para envio imediato
  else if (timeStr.toLowerCase() === "imediatamente") {
    return 1000; // 1 segundo, praticamente imediato
  }

  // Formato abreviado: "30m", "2h", "1d
  const match = timeStr.match(/^(\d+)([smhd])$/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (unit in units) {
      return value * units[unit];
    }
  }

  // Se chegou aqui e tem apenas números, assumir que são minutos
  if (/^\d+$/.test(timeStr.trim())) {
    const minutos = parseInt(timeStr.trim());
    return minutos * 60 * 1000;
  }

  // Se nenhum formato for reconhecido, usar padrão de 30 minutos
  return 30 * 60 * 1000;
}


// Função principal para processar as etapas de follow-up
export async function processFollowUpSteps(followUpId: string): Promise<void> {
  try {
    // Carregar o follow-up do banco de dados com os relacionamentos necessários
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: {
          include: {
            campaign_steps: {
              include: {
                funnel_stage: true
              }
              // Removemos a ordenação aqui para ordenar manualmente depois
            }
          }
        }
      }
    });

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`);
    }

    // Verificar se o follow-up está ativo
    if (followUp.status !== 'active') {
      return;
    }

    // Converter campaign_steps para o formato esperado
    let steps: FollowUpStep[] = [];
    
    if (followUp.campaign?.campaign_steps && followUp.campaign.campaign_steps.length > 0) {
      // Mapear para o formato esperado por FollowUpStep
      steps = followUp.campaign.campaign_steps.map(step => ({
        id: step.id,
        stage_id: step.funnel_stage_id,
        stage_name: step.funnel_stage.name,
        template_name: step.template_name,
        wait_time: step.wait_time,
        message: step.message_content,
        category: step.message_category || 'Utility',
        auto_respond: step.auto_respond !== undefined ? step.auto_respond : true,
        stage_order: step.funnel_stage.order, // Adicionar a ordem da etapa
        wait_time_ms: step.wait_time_ms // Adicionar o tempo em milissegundos
      }));

      // Ordenar os steps primeiro por stage_order (ordem da etapa) e depois por wait_time_ms (tempo de espera)
      steps.sort((a, b) => {
        // Primeiro, ordenar por stage_order
        if (a.stage_order !== b.stage_order) {
          return a.stage_order - b.stage_order;
        }
        
        // Se estiverem na mesma etapa, ordenar pelo tempo de espera
        return a.wait_time_ms - b.wait_time_ms;
      });

      console.log(`Steps ordenados: ${steps.map(s => `${s.stage_name} - ${s.template_name} (${s.wait_time})`).join(', ')}`);
    } else {
      // Fallback para o antigo modelo (se necessário durante a transição)
      console.warn(`Campanha ${followUp.campaign_id} não tem campaign_steps, verificando campo steps`);
      try {
        if (followUp.campaign?.steps) {
          const stepsString = followUp.campaign.steps as string;
          if (stepsString && stepsString.trim() !== '' && stepsString !== '[]') {
            const parsedSteps = JSON.parse(stepsString);
            if (Array.isArray(parsedSteps) && parsedSteps.length > 0) {
              steps = parsedSteps;
              console.log(`Usando ${steps.length} steps do campo JSON para compatibilidade`);
            }
          }
        }
      } catch (err) {
        console.error(`Erro ao analisar campo steps da campanha:`, err);
      }
    }

    if (!steps || steps.length === 0) {
      throw new Error("Nenhuma etapa de follow-up encontrada");
    }

    // Verificar qual é a etapa atual
    const currentStepIndex = followUp.current_step;

    // Se já completou todas as etapas, marcar como concluído
    if (currentStepIndex >= steps.length) {
      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          status: 'completed',
          completed_at: new Date()
        }
      });
      return;
    }

    // Obter a etapa atual
    const currentStep = steps[currentStepIndex];
    console.log(`Etapa atual (${currentStepIndex}): ${currentStep.stage_name} - ${currentStep.template_name}`);

    // Obter o nome do estágio atual (usando sempre stage_name - convertido na interface)
    const currentStageName = currentStep.stage_name;

    // Obter o nome do estágio atual do metadata
    let metadataStageName = "Não definido";
    try {
      if (followUp.metadata) {
        const meta = JSON.parse(followUp.metadata);
        metadataStageName = meta.current_stage_name || "Não definido";
      }
    } catch (e) {
      console.error("Erro ao analisar metadata:", e);
    }

    // Vamos armazenar o nome da etapa no campo metadata como JSON
    if (currentStageName && currentStageName !== metadataStageName) {
      // Preparar o metadata como JSON
      const metadata = JSON.stringify({
        current_stage_name: currentStageName,
        updated_at: new Date().toISOString()
      });

      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          metadata: metadata,
          current_stage_id: currentStep.stage_id // Também atualizar o ID da etapa atual
        }
      });
    }

    // Obter o tempo de espera do estágio atual (usando sempre wait_time do novo formato)
    const waitTime = parseTimeString(currentStep.wait_time);

    // Calcular o horário da próxima mensagem - SEMPRE respeitando o tempo de espera definido
    const nextMessageTime = new Date(Date.now() + waitTime);

    // Atualizar o follow-up com o horário da próxima mensagem
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        next_message_at: nextMessageTime
      }
    });

    // Registrar a mensagem atual
    const message = await prisma.followUpMessage.create({
      data: {
        follow_up_id: followUpId,
        step: currentStepIndex,
        content: currentStep.message,
        funnel_stage: currentStageName,
        template_name: currentStep.template_name,
        category: currentStep.category,
        sent_at: new Date(),
        delivered: false
      }
    });

    // Extrair o nome do cliente do ID ou usar valores default
    let clientName = followUp.client_id;

    // Formatar o nome do cliente para título caso (primeira letra maiúscula)
    if (clientName && clientName.length > 0) {
      clientName = clientName.charAt(0).toUpperCase() + clientName.slice(1).toLowerCase();
    }

    // Todas as mensagens respeitam o tempo de espera definido
    const messageScheduledTime = nextMessageTime;
    
    // Agendar o envio da mensagem atual
    await scheduleMessage({
      followUpId,
      stepIndex: currentStepIndex,
      message: currentStep.message,
      scheduledTime: messageScheduledTime,
      clientId: followUp.client_id,
      metadata: {
        template_name: currentStep.template_name,
        category: currentStep.category,
        clientName: clientName,
        templateParams: {
          name: currentStep.template_name,
          category: currentStep.category,
          language: "pt_BR"
        },
        processedParams: {
          "1": clientName
        }
      }
    });

    // Agendar a próxima etapa se o cliente não responder
    await scheduleNextStep(followUpId, currentStepIndex + 1, nextMessageTime);
  } catch (error) {
    console.error("Erro ao processar etapas de follow-up:", error);
    throw error;
  }
}

// Função para agendar a próxima etapa
export async function scheduleNextStep(
  followUpId: string,
  nextStepIndex: number,
  scheduledTime: Date
): Promise<void> {
  try {
    // Verificar se o follow-up existe e está ativo
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: { campaign: true }
    });

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`);
    }

    if (followUp.status !== 'active') {
      return;
    }

    // Carregar as etapas da campanha com tratamento seguro para strings vazias ou inválidas
    let steps: FollowUpStep[] = [];
    if (followUp.campaign?.steps) {
      try {
        const stepsString = followUp.campaign.steps as string;
        if (stepsString && stepsString.trim() !== '' && stepsString !== '[]') {
          steps = JSON.parse(stepsString) as FollowUpStep[];
        } else {
          console.log(`Follow-up ${followUpId} tem campanha com steps vazios`);
          steps = [];
        }
      } catch (err) {
        console.error(`Erro ao analisar steps da campanha para follow-up ${followUpId}:`, err);
        // Fallback para uma campanha vazia
        steps = [];
      }
    } else {
      steps = []; // Sem campanha, sem steps
    }

    // Verificar se ainda há etapas restantes
    if (nextStepIndex >= steps.length) {
      console.log(`Follow-up ${followUpId} já atingiu a última etapa.`);

      // Agendar um evento para completar o follow-up
      setTimeout(async () => {
        await prisma.followUp.update({
          where: { id: followUpId },
          data: {
            status: 'completed',
            completed_at: new Date()
          }
        });
        console.log(`Follow-up ${followUpId} marcado como completo.`);
      }, scheduledTime.getTime() - Date.now());

      return;
    }

    // Verificar se estamos na mesma etapa do funil ou mudando para outra
    const currentEtapa = steps[followUp.current_step]?.etapa || steps[followUp.current_step]?.stage_name;
    const nextEtapa = steps[nextStepIndex]?.etapa || steps[nextStepIndex]?.stage_name;

    // Verificar se estamos mudando de etapa no funil
    // Isso é importante para saber se estamos apenas avançando os estágios dentro da mesma etapa
    // ou se estamos mudando para uma etapa completamente diferente (o que só deve acontecer após resposta do cliente)
    const mudandoEtapa = currentEtapa !== nextEtapa;

    // Verificar se a mudança de etapa é permitida
    // Normalmente, só mudamos de etapa se o cliente respondeu, então verificar is_responsive
    if (mudandoEtapa) {
      // Para seguir o fluxo correto, só permitir mudança de etapa após resposta do cliente
      if (!followUp.is_responsive) {

        // Procurar o próximo estágio na mesma etapa
        let proximoEstagioMesmaEtapa = -1;
        for (let i = nextStepIndex; i < steps.length; i++) {
          const etapaDoStep = steps[i]?.etapa || steps[i]?.stage_name;
          if (etapaDoStep === currentEtapa) {
            proximoEstagioMesmaEtapa = i;
            break;
          }
        }

        // Se não encontrou próximo estágio na mesma etapa, manter o atual
        if (proximoEstagioMesmaEtapa === -1) {
          // Não avançar, pois estaríamos mudando para uma etapa diferente
          return;
        } else {
          // Atualizar para o próximo estágio na mesma etapa
          nextStepIndex = proximoEstagioMesmaEtapa;
        }
      }
    }

    // Agendar a execução da próxima etapa no tempo especificado
    setTimeout(async () => {
      try {
        // Verificar se o follow-up ainda está ativo e não foi cancelado
        const currentFollowUp = await prisma.followUp.findUnique({
          where: { id: followUpId }
        });

        if (!currentFollowUp || currentFollowUp.status !== 'active') {
          return;
        }

        // Verificar se o cliente respondeu
        if (currentFollowUp.is_responsive) {
          // Verificar se o follow-up já foi processado pela resposta do cliente
          let alreadyProcessed = false;
          try {
            if (currentFollowUp.metadata) {
              const metadata = JSON.parse(currentFollowUp.metadata);
              alreadyProcessed = !!metadata.processed_by_response;
            }
          } catch (e) {
            console.error("Erro ao analisar metadata:", e);
          }

          // Se já foi processado pela resposta, continuar normalmente
          if (alreadyProcessed) {
            console.log(`Follow-up ${followUpId} já processado pela resposta, continuando fluxo normal`);
            // Continuar normalmente
          } else {
            console.log(`Follow-up ${followUpId} marcado como responsivo mas não processado - configurando metadata`);
            
            // Configurar metadata em vez de pausar
            try {
              // Obter metadata atual ou criar novo objeto
              let metadata = {};
              if (currentFollowUp.metadata) {
                try {
                  metadata = JSON.parse(currentFollowUp.metadata);
                } catch (e) {
                  // Se não conseguir analisar, usar objeto vazio
                }
              }
              
              // Marcar como processado para não pausar nas próximas vezes
              metadata.processed_by_response = true;
              metadata.updated_at = new Date().toISOString();
              
              await prisma.followUp.update({
                where: { id: followUpId },
                data: {
                  metadata: JSON.stringify(metadata)
                }
              });
              
              console.log(`Metadata atualizado para o follow-up ${followUpId}`);
            } catch (e) {
              console.error(`Erro ao atualizar metadata do follow-up ${followUpId}:`, e);
            }
            
            // Continuar o fluxo normalmente em vez de pausar
          }
        }

        // IMPORTANTE: Verificar se o current_step atual ainda é o esperado
        // Isso evita condições de corrida onde múltiplos agendamentos possam incrementar
        // o step várias vezes ou pular estágios
        if (currentFollowUp.current_step !== nextStepIndex - 1) {
          // Se o current_step atual for maior ou igual ao next_step que estamos tentando agendar
          // significa que esse passo já foi processado por outra instância, então abortamos
          if (currentFollowUp.current_step >= nextStepIndex) {
            return;
          }
        }

        // Preparar dados para atualização
        let updateData: any = {
          current_step: nextStepIndex
        };

        // Se estamos mudando para outra etapa do funil, atualizamos o metadata
        if (currentEtapa !== nextEtapa) {
          // Preparar o metadata como JSON
          const metadata = JSON.stringify({
            current_stage_name: nextEtapa,
            updated_at: new Date().toISOString()
          });

          updateData.metadata = metadata;
        }

        // Atualizar o follow-up para a próxima etapa
        const updatedFollowUp = await prisma.followUp.update({
          where: { id: followUpId },
          data: updateData
        });

        // Processar a próxima etapa
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

// Função para reiniciar um follow-up pausado
export async function resumeFollowUp(followUpId: string): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId }
    });

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`);
    }

    if (followUp.status !== 'paused') {
      console.log(`Follow-up ${followUpId} não está pausado, status atual: ${followUp.status}`);
      return;
    }

    // Atualizar o status para ativo
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status: 'active',
        is_responsive: false,
        next_message_at: new Date() // Reiniciar imediatamente
      }
    });

    // Processar a etapa atual novamente
    await processFollowUpSteps(followUpId);

    console.log(`Follow-up ${followUpId} reiniciado com sucesso.`);
  } catch (error) {
    console.error("Erro ao reiniciar follow-up:", error);
    throw error;
  }
}

// Função para avançar para a próxima etapa manualmente
export async function advanceToNextStep(followUpId: string): Promise<void> {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: { campaign: true }
    });

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`);
    }

    if (followUp.status !== 'active' && followUp.status !== 'paused') {
      console.log(`Follow-up ${followUpId} não está ativo ou pausado, status atual: ${followUp.status}`);
      return;
    }

    // Carregar as etapas da campanha com tratamento seguro para strings vazias ou inválidas
    let steps: FollowUpStep[] = [];
    if (followUp.campaign?.steps) {
      try {
        const stepsString = followUp.campaign.steps as string;
        if (stepsString && stepsString.trim() !== '' && stepsString !== '[]') {
          steps = JSON.parse(stepsString) as FollowUpStep[];
        } else {
          console.log(`Follow-up ${followUpId} tem campanha com steps vazios`);
          steps = [];
        }
      } catch (err) {
        console.error(`Erro ao analisar steps da campanha para follow-up ${followUpId}:`, err);
        // Sem fallback para CSV
        steps = [];
      }
    } else {
      // Sem fallback para CSV
      steps = [];
    }

    const nextStepIndex = followUp.current_step + 1;

    // Verificar se ainda há etapas restantes
    if (nextStepIndex >= steps.length) {
      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          status: 'completed',
          completed_at: new Date()
        }
      });
      console.log(`Follow-up ${followUpId} completado por avanço manual.`);
      return;
    }

    // Atualizar o follow-up para a próxima etapa
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        current_step: nextStepIndex,
        status: 'active',
        is_responsive: false,
        next_message_at: new Date() // Executar próxima etapa imediatamente
      }
    });

    // Cancelar mensagens agendadas anteriormente
    await cancelScheduledMessages(followUpId);

    // Processar a próxima etapa
    await processFollowUpSteps(followUpId);

    console.log(`Follow-up ${followUpId} avançado manualmente para a etapa ${nextStepIndex}.`);
  } catch (error) {
    console.error("Erro ao avançar follow-up:", error);
    throw error;
  }
}

// Função para cancelar apenas a mensagem de uma etapa específica
export async function cancelScheduledMessageForStep(followUpId: string, stepIndex: number): Promise<void> {
  try {
    // Encontrar a chave específica para esta etapa
    const keyToRemove = `${followUpId}-${stepIndex}`;
    
    // Verificar se existe um timeout ativo para esta etapa
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

// Função para lidar com uma resposta do cliente
export async function handleClientResponse(
  clientId: string,
  message: string,
  followUpId?: string,
  respondedMessageId?: string // Novo parâmetro para identificar a mensagem respondida
): Promise<void> {
  try {
    // Buscar follow-ups ativos para este cliente (específico ou todos)
    const whereClause = {
      client_id: clientId,
      status: { in: ['active', 'paused'] }
    };
    
    // Se temos um ID específico, adicionar à consulta
    if (followUpId) {
      Object.assign(whereClause, { id: followUpId });
    }
    
    const activeFollowUps = await prisma.followUp.findMany({
      where: whereClause,
      include: {
        campaign: true
      }
    });

    if (activeFollowUps.length === 0) {
      return;
    }

    // Para cada follow-up ativo deste cliente
    for (const followUp of activeFollowUps) {
      // Carregar etapas da campanha
      let steps: FollowUpStep[] = [];
      if (followUp.campaign?.steps) {
        try {
          const stepsString = followUp.campaign.steps as string;
          if (stepsString && stepsString.trim() !== '' && stepsString !== '[]') {
            steps = JSON.parse(stepsString) as FollowUpStep[];
          } else {
            // Sem dados de etapas, não podemos continuar
            console.log(`Follow-up ${followUp.id} tem campanha sem steps válidos`);
            continue;
          }
        } catch (err) {
          console.error(`Erro ao analisar steps da campanha para follow-up ${followUp.id}:`, err);
          // Não usar fallback para CSV, simplesmente continuar para o próximo follow-up
          continue;
        }
      } else {
        // Não há campanha ou steps, não podemos continuar
        console.log(`Follow-up ${followUp.id} não tem campanha ou steps`);
        continue;
      }

      if (!steps || steps.length === 0) {
        console.log(`Nenhuma etapa encontrada para o follow-up ${followUp.id}`);
        continue;
      }

      // Identificar a fase atual do funil
      const currentStepIndex = followUp.current_step;
      const currentStep = steps[currentStepIndex];
      const currentFunnelStage = currentStep?.stage_name;

      console.log(`Follow-up ${followUp.id} - Fase atual: ${currentFunnelStage}, Etapa atual: ${currentStepIndex}`);

      // Registrar a resposta do cliente
      await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUp.id,
          step: -1, // Valor especial para indicar mensagem do cliente
          content: message,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date(),
          funnel_stage: currentFunnelStage,
          // A mensagem respondida será armazenada no metadata em vez de usar um campo que não existe
          category: respondedMessageId ? `Resposta à mensagem ${respondedMessageId}` : 'Resposta do cliente'
        }
      });

      // Recuperar o metadata atual para preservar informações relevantes
      let currentMetadata = {};
      try {
        if (followUp.metadata) {
          currentMetadata = JSON.parse(followUp.metadata);
        }
      } catch (err) {
        console.error(`Erro ao analisar metadata atual do follow-up ${followUp.id}:`, err);
      }

      // Preparar um objeto de respostas para rastrear quais etapas foram respondidas
      if (!currentMetadata.responses) {
        currentMetadata.responses = {};
      }
      
      // Registrar esta etapa específica como respondida
      currentMetadata.responses[currentStepIndex.toString()] = {
        timestamp: new Date().toISOString(),
        message: message
      };
      
      // Marcar apenas a etapa atual como respondida, não todo o follow-up
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          is_responsive: true, // Ainda usamos este campo para compatibilidade
          metadata: JSON.stringify({
            ...currentMetadata,
            updated_at: new Date().toISOString(),
            last_response: message,
            current_stage_name: currentFunnelStage,
            current_step_responded: currentStepIndex
          })
        }
      });

      console.log(`Registrada resposta para etapa ${currentStepIndex} do follow-up ${followUp.id}`);

      // IMPORTANTE: Cancelar apenas as mensagens agendadas para a etapa atual
      // NÃO cancelamos todas as mensagens do follow-up
      await cancelScheduledMessageForStep(followUp.id, currentStepIndex);
      
      // Quando recebemos uma resposta do cliente, queremos avançar para a próxima FASE
      // e não para o próximo estágio dentro da mesma fase
      
      // 1. Procurar a próxima etapa na mesma fase (apenas para referência)
      let nextStepInSamePhase = -1;
      for (let i = currentStepIndex + 1; i < steps.length; i++) {
        const stepFunnelStage = steps[i]?.stage_name;
        if (stepFunnelStage === currentFunnelStage) {
          nextStepInSamePhase = i;
          break;
        }
      }

      // 2. Procurar a primeira etapa da próxima fase
      let firstStepOfNextPhase = -1;
      let nextPhaseName = '';
      for (let i = 0; i < steps.length; i++) {
        const stepFunnelStage = steps[i]?.stage_name;
        if (stepFunnelStage && stepFunnelStage !== currentFunnelStage) {
          firstStepOfNextPhase = i;
          nextPhaseName = stepFunnelStage;
          break;
        }
      }

      // Lógica de decisão: para onde vamos mover o cliente?
      let nextStepIndex: number;
      let nextStageName: string;
      let completeCampaign = false;

      // IMPORTANTE: Quando recebemos uma resposta do cliente, o comportamento é diferente
      // Ao invés de seguir para a próxima etapa da mesma fase, vamos direto para a próxima fase
      if (firstStepOfNextPhase >= 0) {
        // Avançar para a primeira etapa da próxima fase
        nextStepIndex = firstStepOfNextPhase;
        nextStageName = nextPhaseName;
        console.log(`Cliente respondeu: Avançando para primeira etapa da próxima fase: ${nextStepIndex} (${nextPhaseName})`);
      } else if (nextStepInSamePhase >= 0) {
        // Se não houver próxima fase, mas houver mais etapas na fase atual
        // Isso só deve acontecer se a campanha tiver múltiplas etapas na mesma fase
        nextStepIndex = nextStepInSamePhase;
        nextStageName = currentFunnelStage;
        console.log(`Cliente respondeu: Não há próxima fase, avançando para próxima etapa na mesma fase: ${nextStepIndex}`);
      } else {
        // Não há mais etapas em nenhuma fase, completar o follow-up
        completeCampaign = true;
        console.log(`Cliente respondeu: Não há mais etapas, completando follow-up ${followUp.id}`);
      }

      if (completeCampaign) {
        // Completar o follow-up
        await prisma.followUp.update({
          where: { id: followUp.id },
          data: {
            status: 'completed',
            completed_at: new Date(),
            metadata: JSON.stringify({
              ...currentMetadata,
              updated_at: new Date().toISOString(),
              campaign_completed: true,
              completion_reason: "Cliente respondeu à última etapa"
            })
          }
        });
      } else {
        // Atualizar o follow-up para a próxima etapa
        await prisma.followUp.update({
          where: { id: followUp.id },
          data: {
            current_step: nextStepIndex,
            status: 'active',
            next_message_at: new Date(), // Processar próxima etapa imediatamente
            metadata: JSON.stringify({
              ...currentMetadata,
              current_stage_name: nextStageName,
              updated_at: new Date().toISOString(),
              last_response: message,
              last_response_date: new Date().toISOString(),
              processed_by_response: true,
              advanced_after_response: true,
              previous_step: currentStepIndex,
              new_step: nextStepIndex
            })
          }
        });

        // Processar a próxima etapa imediatamente
        await processFollowUpSteps(followUp.id);
      }
    }
  } catch (error) {
    console.error("Erro ao lidar com resposta do cliente:", error);
    throw error;
  }
}

// Função para criar uma nova campanha vazia
export async function createEmptyCampaign(
  name: string,
  description?: string
): Promise<string> {
  try {
    // Criar uma nova campanha no banco de dados com array vazio de steps
    const campaign = await prisma.followUpCampaign.create({
      data: {
        name,
        description,
        active: true,
        steps: "[]"
      }
    });

    console.log(`Campanha de follow-up "${name}" criada com sucesso, ID: ${campaign.id}`);
    return campaign.id;
  } catch (error) {
    console.error("Erro ao criar campanha de follow-up:", error);
    throw error;
  }
}