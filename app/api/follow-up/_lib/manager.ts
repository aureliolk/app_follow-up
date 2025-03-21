// app/api/follow-up/_lib/manager.ts
import { prisma } from '@/lib/db';
import { scheduleMessage, cancelScheduledMessages } from './scheduler.ts';
import path from 'path';
import fs from 'fs/promises';
import csv from 'csv-parser';
import { Readable } from 'stream';

// Interface para os dados do CSV de follow-up
interface FollowUpStep {
  etapa: string;
  mensagem: string;
  tempo_de_espera: string; // Formato esperado: "1d", "2h", "30m", etc.
  condicionais?: string;
}

const TEST_MODE = true; // Defina como false em produção
console.log("MODO DE TESTE CONFIGURADO COMO:", TEST_MODE ? "ATIVADO" : "DESATIVADO");
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

// Função para processar o CSV e carregar os dados do funil
export async function loadFollowUpData(campaignId?: string): Promise<FollowUpStep[]> {
  try {
    // Se temos um ID de campanha, carregar do banco de dados
    if (campaignId) {
      const campaign = await prisma.followUpCampaign.findUnique({
        where: { id: campaignId }
      });

      if (!campaign) {
        throw new Error(`Campanha de follow-up não encontrada: ${campaignId}`);
      }

      // Retornar os passos da campanha com tratamento seguro para strings vazias ou inválidas
      try {
        // Verificar se é uma string vazia ou inválida
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
    }

    // Caso contrário, carregar do arquivo CSV mais recente
    const csvFilePath = path.join(process.cwd(), 'public', 'follow-up-sabrina-nunes-atualizado.csv');

    // Verificar se o arquivo existe
    try {
      await fs.access(csvFilePath);
    } catch (error) {
      throw new Error(`Arquivo CSV não encontrado em ${csvFilePath}`);
    }

    // Ler o arquivo CSV
    const fileContent = await fs.readFile(csvFilePath, 'utf-8');

    return new Promise((resolve, reject) => {
      const results: FollowUpStep[] = [];

      // Criar um stream a partir do conteúdo do arquivo
      const stream = Readable.from([fileContent]);

      stream
        .pipe(csv({
          separator: ',',
          headers: [
            'etapa',
            'tempo_de_espera',
            'template_name',
            'category',
            'mensagem',
            'auto_respond',
            'status'
          ]
        }))
        .on('data', (data) => {
          // Filtrar cabeçalhos ou linhas vazias
          if (data.etapa && data.etapa !== 'Etapa do Funil') {
            results.push(data);
          }
        })
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  } catch (error) {
    console.error("Erro ao carregar dados de follow-up:", error);
    throw error;
  }
}

// Função principal para processar as etapas de follow-up
export async function processFollowUpSteps(followUpId: string): Promise<void> {
  try {
    // Carregar o follow-up do banco de dados
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: true
      }
    });

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`);
    }

    // Verificar se o follow-up está ativo
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
          steps = await loadFollowUpData();
        }
      } catch (err) {
        console.error(`Erro ao analisar steps da campanha para follow-up ${followUpId}:`, err);
        // Fallback para o CSV em caso de erro
        steps = await loadFollowUpData();
      }
    } else {
      steps = await loadFollowUpData();
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

    // Verificar se há um nome de estágio do funil
    const currentEtapa = currentStep.etapa || currentStep.stage_name;

    // Obter o nome do estágio atual do metadata
    let currentStageName = "Não definido";
    try {
      if (followUp.metadata) {
        const meta = JSON.parse(followUp.metadata);
        currentStageName = meta.current_stage_name || "Não definido";
      }
    } catch (e) {
      console.error("Erro ao analisar metadata:", e);
    }

    // Vamos armazenar o nome da etapa no campo metadata como JSON
    if (currentEtapa && currentEtapa !== currentStageName) {
      // Preparar o metadata como JSON
      const metadata = JSON.stringify({
        current_stage_name: currentEtapa,
        updated_at: new Date().toISOString()
      });

      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          metadata: metadata
        }
      });
    }

    // Obter o tempo de espera do estágio atual
    // Verificar os múltiplos campos possíveis (compatibilidade com diferentes formatos)
    const tempoEspera = currentStep.tempo_de_espera || currentStep.wait_time;

    // Calcular o tempo de espera para a próxima mensagem
    const waitTime = parseTimeString(tempoEspera);

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
        content: currentStep.mensagem || currentStep.message,
        funnel_stage: currentEtapa,
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
      message: currentStep.mensagem || currentStep.message,
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
          console.log(`Follow-up ${followUpId} tem campanha com steps vazios, carregando do CSV`);
          steps = await loadFollowUpData();
        }
      } catch (err) {
        console.error(`Erro ao analisar steps da campanha para follow-up ${followUpId}:`, err);
        // Fallback para o CSV em caso de erro
        steps = await loadFollowUpData();
      }
    } else {
      steps = await loadFollowUpData();
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
            // Continuar normalmente
          } else {
            // Caso contrário, pausar como antes
            // Atualizar status para "pausado
            await prisma.followUp.update({
              where: { id: followUpId },
              data: {
                status: 'paused'
              }
            });

            return;
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
          console.log(`Follow-up ${followUpId} tem campanha com steps vazios, carregando do CSV`);
          steps = await loadFollowUpData();
        }
      } catch (err) {
        console.error(`Erro ao analisar steps da campanha para follow-up ${followUpId}:`, err);
        // Fallback para o CSV em caso de erro
        steps = await loadFollowUpData();
      }
    } else {
      steps = await loadFollowUpData();
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

// Função para lidar com uma resposta do cliente
export async function handleClientResponse(
  clientId: string,
  message: string
): Promise<void> {
  try {
    // Buscar todos os follow-ups ativos para este cliente
    const activeFollowUps = await prisma.followUp.findMany({
      where: {
        client_id: clientId,
        status: { in: ['active', 'paused'] }
      },
      include: {
        campaign: true
      }
    });

    if (activeFollowUps.length === 0) {
      return;
    }

    // Para cada follow-up ativo deste cliente
    for (const followUp of activeFollowUps) {
      // IMPORTANTE: Primeiro cancelar TODAS as mensagens agendadas
      await cancelScheduledMessages(followUp.id);

      // Registrar a resposta do cliente
      await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUp.id,
          step: -1, // Valor especial para indicar mensagem do cliente
          content: message,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date()
        }
      });

      // Agora vamos identificar a próxima fase do funil
      // Primeiro, carregamos as etapas da campanha com tratamento seguro para strings vazias ou inválidas
      let steps: FollowUpStep[] = [];
      if (followUp.campaign?.steps) {
        try {
          const stepsString = followUp.campaign.steps as string;
          if (stepsString && stepsString.trim() !== '' && stepsString !== '[]') {
            steps = JSON.parse(stepsString) as FollowUpStep[];
          } else {
            console.log(`Follow-up ${followUp.id} tem campanha com steps vazios, carregando do CSV`);
            steps = await loadFollowUpData();
          }
        } catch (err) {
          console.error(`Erro ao analisar steps da campanha para follow-up ${followUp.id}:`, err);
          // Fallback para o CSV em caso de erro
          steps = await loadFollowUpData();
        }
      } else {
        steps = await loadFollowUpData();
      }

      if (!steps || steps.length === 0) {
        console.log(`Nenhuma etapa encontrada para o follow-up ${followUp.id}`);
        continue;
      }

      // Identificar a fase atual do funil
      const currentStepIndex = followUp.current_step;
      const currentStep = steps[currentStepIndex];
      const currentFunnelStage = currentStep?.etapa || currentStep?.stage_name;

      console.log(`Fase atual do funil: ${currentFunnelStage}`);

      // Procurar a primeira etapa da próxima fase do funil
      let nextPhaseStepIndex = -1;
      let nextPhaseName = '';

      for (let i = 0; i < steps.length; i++) {
        const stepFunnelStage = steps[i]?.etapa || steps[i]?.stage_name;

        // Se encontrarmos uma fase diferente da atual, essa é a próxima fase
        if (stepFunnelStage && stepFunnelStage !== currentFunnelStage) {
          nextPhaseStepIndex = i;
          nextPhaseName = stepFunnelStage;
          break;
        }
      }

      // Se encontramos a próxima fase, atualizar o follow-up
      if (nextPhaseStepIndex >= 0) {
        // PONTO CRÍTICO: Garantir que o status seja 'active' - não 'paused
        await prisma.followUp.update({
          where: { id: followUp.id },
          data: {
            current_step: nextPhaseStepIndex,
            is_responsive: true,
            status: 'active', // IMPORTANTE: forçar como 'active' mesmo após resposta
            next_message_at: new Date(), // Processar a próxima mensagem imediatamente
            metadata: JSON.stringify({
              current_stage_name: nextPhaseName,
              updated_at: new Date().toISOString(),
              last_response: message,
              // Adicionar uma flag para identificar que este follow-up foi processado por resposta
              processed_by_response: true
            })
          }
        });

        // Processar a primeira etapa da nova fase imediatamente
        await processFollowUpSteps(followUp.id);
      } else {
        // Se não houver próxima fase, marcar como completo
        await prisma.followUp.update({
          where: { id: followUp.id },
          data: {
            status: 'completed',
            completed_at: new Date(),
            is_responsive: true
          }
        });
      }
    }
  } catch (error) {
    console.error("Erro ao lidar com resposta do cliente:", error);
    throw error;
  }
}

// Função para gerenciar importação inicial do CSV de follow-up para o banco de dados
export async function importFollowUpCampaign(
  name: string,
  description?: string
): Promise<string> {
  try {
    // Carregar dados do CSV
    const steps = await loadFollowUpData();

    if (!steps || steps.length === 0) {
      throw new Error("Nenhuma etapa encontrada no CSV");
    }

    // Criar uma nova campanha no banco de dados
    const campaign = await prisma.followUpCampaign.create({
      data: {
        name,
        description,
        active: true,
        steps: JSON.stringify(steps)
      }
    });

    console.log(`Campanha de follow-up "${name}" importada com sucesso, ID: ${campaign.id}`);
    return campaign.id;
  } catch (error) {
    console.error("Erro ao importar campanha de follow-up:", error);
    throw error;
  }
}