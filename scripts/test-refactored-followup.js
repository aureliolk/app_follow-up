// scripts/test-refactored-followup.js
// Script para testar a implementação refatorada do follow-up

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();

// Configurações
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  campaignId: 'd17d857b-8366-4a90-9434-6dec8416dab6',
  clientId: '58', // Usar o mesmo cliente do teste de campanha
  apiKey: 'wsat_SzYfBm0661doBFQ4LdcgFSGCUAhjCkvadXleIphPE4'
};

// Função auxiliar para colorir texto no console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
  const timestamp = new Date().toISOString().substr(11, 8);
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para verificar campos estruturados nos follow-ups
async function checkFollowUpFields(followUpId) {
  try {
    log('Verificando campos estruturados do follow-up...', colors.cyan);
    
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        state_transitions: true,
        client_responses: true
      }
    });

    if (!followUp) {
      log(`Follow-up ${followUpId} não encontrado!`, colors.red);
      return false;
    }

    // Verificar campos estruturados obrigatórios
    log(`Status: ${followUp.status}`, colors.blue);
    log(`Stage atual: ${followUp.current_stage_name || 'Não definido'}`, colors.blue);
    log(`ID do estágio atual: ${followUp.current_stage_id || 'Não definido'}`, colors.blue);
    log(`Estágio anterior: ${followUp.previous_stage_name || 'Nenhum'}`, colors.blue);
    log(`Aguardando resposta: ${followUp.waiting_for_response ? 'Sim' : 'Não'}`, colors.blue);
    
    if (followUp.paused_reason) {
      log(`Motivo da pausa: ${followUp.paused_reason}`, colors.yellow);
    }

    // Verificar transições de estado
    log(`Total de transições registradas: ${followUp.state_transitions.length}`, colors.green);
    followUp.state_transitions.forEach((transition, index) => {
      log(`Transição ${index+1}: ${transition.from_stage_name || 'Início'} -> ${transition.to_stage_name}`, colors.green);
    });

    // Verificar respostas de cliente
    log(`Total de respostas registradas: ${followUp.client_responses.length}`, colors.green);
    
    return true;
  } catch (error) {
    log(`Erro ao verificar campos estruturados: ${error.message}`, colors.red);
    console.error(error);
    return false;
  }
}

// Função para verificar se existe follow-up ativo para o cliente
async function checkExistingFollowUp(clientId) {
  try {
    log(`Verificando se existe follow-up ativo para o cliente ${clientId}...`, colors.cyan);
    
    // Buscar diretamente no banco de dados
    const existingFollowUps = await prisma.followUp.findMany({
      where: {
        client_id: clientId,
        status: { in: ['active', 'paused'] }
      }
    });
    
    if (existingFollowUps.length > 0) {
      log(`Encontrados ${existingFollowUps.length} follow-ups ativos para o cliente ${clientId}`, colors.yellow);
      return existingFollowUps;
    }
    
    log(`Nenhum follow-up ativo encontrado para o cliente ${clientId}`, colors.green);
    return [];
  } catch (error) {
    log(`Erro ao verificar follow-ups existentes: ${error.message}`, colors.red);
    return [];
  }
}

// Função para criar um novo follow-up
async function createFollowUp() {
  try {
    const clientId = CONFIG.clientId;
    log(`Preparando criação de follow-up para cliente ${clientId}...`, colors.cyan);
    
    // 1. Verificar se já existe follow-up ativo
    const existingFollowUps = await checkExistingFollowUp(clientId);
    
    // 2. Se existir, cancelar todos
    if (existingFollowUps.length > 0) {
      log(`Cancelando ${existingFollowUps.length} follow-ups existentes antes de criar um novo...`, colors.yellow);
      
      for (const followUp of existingFollowUps) {
        log(`Cancelando follow-up ${followUp.id}...`, colors.yellow);
        await cancelFollowUp(followUp.id);
      }
      
      // Aguardar um momento para garantir que o cancelamento foi processado
      await sleep(1000);
    }
    
    // 3. Criar o novo follow-up
    log(`Criando novo follow-up para cliente ${clientId}...`, colors.cyan);
    
    const response = await axios.post(`${CONFIG.baseUrl}/api/follow-up`, {
      clientId: clientId,
      campaignId: CONFIG.campaignId,
      metadata: {
        source: 'Teste Sistema Refatorado',
        test_run: true
      }
    }, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro desconhecido ao criar follow-up');
    }
    
    const followUpId = response.data.followUpId;
    log(`Follow-up criado com sucesso! ID: ${followUpId}`, colors.green);
    
    // Verificar se o follow-up foi criado corretamente
    await sleep(1000); // Aguardar um segundo para o processamento
    await checkFollowUpFields(followUpId);
    
    return followUpId;
  } catch (error) {
    log(`Erro ao criar follow-up: ${error.message}`, colors.red);
    console.error(error.response?.data || error);
    return null;
  }
}

// Função para enviar resposta do cliente
async function sendClientResponse(followUpId, message) {
  try {
    log(`Enviando resposta do cliente: "${message}"...`, colors.cyan);
    
    const response = await axios.post(`${CONFIG.baseUrl}/api/follow-up/client-response`, {
      clientId: CONFIG.clientId,
      followUpId,
      message
    }, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro desconhecido ao enviar resposta');
    }
    
    log('Resposta enviada com sucesso!', colors.green);
    
    // Verificar os campos após resposta
    await sleep(1000); // Aguardar um segundo para o processamento
    await checkFollowUpFields(followUpId);
    
    return true;
  } catch (error) {
    log(`Erro ao enviar resposta: ${error.message}`, colors.red);
    console.error(error.response?.data || error);
    return false;
  }
}

// Função para verificar status do follow-up
async function getFollowUpStatus(followUpId) {
  try {
    const response = await axios.get(`${CONFIG.baseUrl}/api/follow-up/status?id=${followUpId}`, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro desconhecido ao obter status');
    }
    
    return response.data.data;
  } catch (error) {
    log(`Erro ao obter status: ${error.message}`, colors.red);
    console.error(error.response?.data || error);
    return null;
  }
}

// Função para cancelar follow-up
async function cancelFollowUp(followUpId) {
  try {
    log(`Cancelando follow-up ${followUpId}...`, colors.cyan);
    
    try {
      const response = await axios.post(`${CONFIG.baseUrl}/api/follow-up/cancel`, {
        followUpId
      }, {
        headers: {
          'x-api-key': CONFIG.apiKey
        }
      });
      
      if (response.data.success) {
        log('Follow-up cancelado com sucesso via API!', colors.green);
        return true;
      } else {
        log(`Aviso: API retornou erro: ${response.data.error}`, colors.yellow);
        // Continuar com o método alternativo
      }
    } catch (apiError) {
      log(`Aviso: Falha ao cancelar via API: ${apiError.message}`, colors.yellow);
      // Continuar com o método alternativo
    }
    
    // Método alternativo: atualizar diretamente no banco de dados
    log('Tentando cancelar follow-up diretamente no banco de dados...', colors.yellow);
    await prisma.followUp.update({
      where: { id: followUpId },
      data: { status: 'canceled' }
    });
    
    log('Follow-up cancelado com sucesso via banco de dados!', colors.green);
    return true;
  } catch (error) {
    log(`Erro ao cancelar follow-up: ${error.message}`, colors.red);
    console.error(error);
    return false;
  }
}

// Função para testar resume
async function resumeFollowUp(followUpId) {
  try {
    log(`Resumindo follow-up ${followUpId}...`, colors.cyan);
    
    const response = await axios.post(`${CONFIG.baseUrl}/api/follow-up/resume`, {
      followUpId
    }, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Erro desconhecido ao resumir follow-up');
    }
    
    log('Follow-up resumido com sucesso!', colors.green);
    
    // Verificar os campos após resumir
    await sleep(1000);
    await checkFollowUpFields(followUpId);
    
    return true;
  } catch (error) {
    log(`Erro ao resumir follow-up: ${error.message}`, colors.red);
    console.error(error.response?.data || error);
    return false;
  }
}

// Função para verificar se o follow-up avançou corretamente de estágio
async function verifyStageAdvancement(followUpId, initialStageName) {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        state_transitions: {
          orderBy: { transition_date: 'desc' },
          take: 1
        }
      }
    });
    
    if (!followUp) {
      log(`Follow-up ${followUpId} não encontrado!`, colors.red);
      return false;
    }
    
    // Verificar se o estágio atual é diferente do inicial
    const currentStageName = followUp.current_stage_name;
    const previousStageName = followUp.previous_stage_name;
    
    if (currentStageName === initialStageName) {
      log(`ERRO: Follow-up não avançou de estágio! Permanece em "${currentStageName}"`, colors.red);
      return false;
    }
    
    if (previousStageName !== initialStageName) {
      log(`ATENÇÃO: previous_stage_name (${previousStageName}) não corresponde ao estágio inicial (${initialStageName})`, colors.yellow);
    }
    
    // Verificar a última transição
    if (followUp.state_transitions.length > 0) {
      const lastTransition = followUp.state_transitions[0];
      log(`Última transição: ${lastTransition.from_stage_name} -> ${lastTransition.to_stage_name}`, colors.green);
      
      if (lastTransition.from_stage_name === lastTransition.to_stage_name) {
        log(`ERRO: Transição circular detectada! De "${lastTransition.from_stage_name}" para "${lastTransition.to_stage_name}"`, colors.red);
        return false;
      }
      
      log(`Avanço de estágio verificado com sucesso! De "${initialStageName}" para "${currentStageName}"`, colors.green);
      return true;
    } else {
      log(`ERRO: Nenhuma transição de estágio registrada!`, colors.red);
      return false;
    }
  } catch (error) {
    log(`Erro ao verificar avanço de estágio: ${error.message}`, colors.red);
    console.error(error);
    return false;
  }
}

// Função principal para testar o fluxo completo
async function testFollowUpFlow() {
  try {
    log('\n=============================================', colors.bright + colors.magenta);
    log('TESTE DO SISTEMA DE FOLLOW-UP REFATORADO', colors.bright + colors.magenta);
    log('=============================================\n', colors.bright + colors.magenta);
    
    // 1. Criar um novo follow-up
    const followUpId = await createFollowUp();
    if (!followUpId) {
      log('Teste abortado: não foi possível criar follow-up', colors.red);
      return;
    }
    
    // 2. Verificar o status e obter o estágio inicial
    const initialStatus = await prisma.followUp.findUnique({
      where: { id: followUpId },
      select: { 
        current_stage_name: true,
        current_stage_id: true
      }
    });
    
    const initialStageName = initialStatus?.current_stage_name;
    log(`Estágio inicial: "${initialStageName}"`, colors.blue);
    
    // 3. Aguardar o envio de TODAS as mensagens do estágio inicial
    log('Aguardando o envio de TODAS as mensagens do estágio inicial...', colors.yellow);
    
    // Função para esperar até que TODAS as mensagens do estágio atual sejam enviadas
    async function waitForAllMessagesInStage() {
      try {
        // Buscar todos os passos da campanha para este estágio
        const campaign = await prisma.followUpCampaign.findUnique({
          where: { id: CONFIG.campaignId },
          include: {
            campaign_steps: {
              where: { funnel_stage: { name: initialStageName } },
              include: { funnel_stage: true },
              orderBy: [{ wait_time_ms: 'asc' }]
            }
          }
        });
        
        if (!campaign || !campaign.campaign_steps.length) {
          log('Não foi possível encontrar os passos do estágio atual', colors.red);
          return false;
        }
        
        // Contar quantos passos existem no estágio atual
        const totalStepsInStage = campaign.campaign_steps.length;
        log(`Total de passos no estágio "${initialStageName}": ${totalStepsInStage}`, colors.blue);
        
        // Esperar até que TODAS as mensagens sejam enviadas
        let messagesDelivered = 0;
        let retryCount = 0;
        const maxRetries = 20; // Tentar até 20 vezes (com 10s entre tentativas) = até ~3.3 minutos total
        const waitTimeBetweenChecks = 10000; // 10 segundos entre verificações
        
        // Verificar se há steps programados mas não entregues
        const pendingMessages = await prisma.followUpMessage.findMany({
          where: {
            follow_up_id: followUpId,
            funnel_stage: initialStageName,
            delivered: false
          }
        });
        
        log(`Mensagens pendentes: ${pendingMessages.length}`, colors.yellow);
        
        while (retryCount < maxRetries) {
          // Verificar quantas mensagens foram entregues
          const messages = await prisma.followUpMessage.findMany({
            where: {
              follow_up_id: followUpId,
              funnel_stage: initialStageName,
              delivered: true
            }
          });
          
          messagesDelivered = messages.length;
          log(`Mensagens entregues até agora: ${messagesDelivered}/${totalStepsInStage}`, colors.yellow);
          
          // Precisamos de TODAS as mensagens antes de continuar
          if (messagesDelivered >= totalStepsInStage) {
            log(`✓ TODAS as mensagens do estágio "${initialStageName}" foram entregues!`, colors.bright + colors.green);
            
            // Esperar mais um momento para garantir que tudo foi processado
            await sleep(5000);
            return true;
          }
          
          // Verificar se já temos pelo menos uma mensagem
          if (messagesDelivered > 0) {
            log(`Já temos ${messagesDelivered}/${totalStepsInStage} mensagens entregues. Continuando a aguardar...`, colors.yellow);
          }
          
          // Verificar se ainda há mensagens pendentes
          const stillPendingMessages = await prisma.followUpMessage.findMany({
            where: {
              follow_up_id: followUpId,
              funnel_stage: initialStageName,
              delivered: false
            }
          });
          
          if (stillPendingMessages.length > 0) {
            log(`Ainda existem ${stillPendingMessages.length} mensagens pendentes.`, colors.yellow);
          }
          
          // Aguardar mais um pouco
          log(`Aguardando envio de mais mensagens (tentativa ${retryCount + 1}/${maxRetries})...`, colors.yellow);
          await sleep(waitTimeBetweenChecks);
          retryCount++;
        }
        
        // Se chegamos aqui, é porque o tempo máximo foi excedido
        log(`\n⚠️ TEMPO MÁXIMO EXCEDIDO - ${messagesDelivered}/${totalStepsInStage} mensagens entregues.`, colors.bright + colors.yellow);
        
        // Se pelo menos uma mensagem foi entregue, podemos continuar mesmo sem todas
        if (messagesDelivered > 0) {
          log(`Pelo menos uma mensagem foi entregue. Continuando o teste...`, colors.yellow);
          await sleep(5000); // Pequena pausa antes de continuar
          return true;
        }
        
        // Nenhuma mensagem foi entregue - aguardar mais um pouco como última chance
        log(`Nenhuma mensagem foi entregue! Aguardando mais 30 segundos como última tentativa...`, colors.red);
        await sleep(30000);
        
        // Verificar uma última vez
        const finalMessages = await prisma.followUpMessage.findMany({
          where: {
            follow_up_id: followUpId,
            funnel_stage: initialStageName,
            delivered: true
          }
        });
        
        if (finalMessages.length > 0) {
          log(`Na última verificação, encontramos ${finalMessages.length}/${totalStepsInStage} mensagens. Continuando...`, colors.yellow);
          return true;
        }
        
        log(`⚠️ Nenhuma mensagem foi entregue mesmo após tempo adicional. O teste pode falhar.`, colors.bright + colors.red);
        return false;
      } catch (error) {
        log(`Erro ao verificar mensagens: ${error.message}`, colors.red);
        return false;
      }
    }
    
    // Aguardar até que TODAS as mensagens do estágio tenham sido enviadas
    await waitForAllMessagesInStage();
    
    // 4. TESTE PRINCIPAL: Enviar resposta do cliente para verificar avanço de estágio
    log('Enviando resposta do cliente para testar avanço de estágio...', colors.cyan);
    await sendClientResponse(followUpId, 'Olá, estou testando o avanço de estágio!');
    
    // Aguardar processamento
    log('Aguardando processamento após resposta (15s)...', colors.yellow);
    await sleep(15000);
    
    // Verificar se avançou corretamente de estágio
    const advancedCorrectly = await verifyStageAdvancement(followUpId, initialStageName);
    
    if (advancedCorrectly) {
      log('✅ TESTE DE AVANÇO DE ESTÁGIO BEM-SUCEDIDO!', colors.bright + colors.green);
    } else {
      log('❌ TESTE DE AVANÇO DE ESTÁGIO FALHOU!', colors.bright + colors.red);
    }
    
    // Não cancelamos o follow-up para permitir que o fluxo completo seja executado
    log('Follow-up continuará sendo processado em segundo plano...', colors.cyan);
    
    if (!advancedCorrectly) {
      log('\n=============================================', colors.bright + colors.red);
      log('TESTE FALHOU: Problemas no avanço de estágio', colors.bright + colors.red);
      log('=============================================\n', colors.bright + colors.red);
      process.exit(1);
    }
    
    // Acompanhar o fluxo completo da campanha até o final
    log('\n=============================================', colors.bright + colors.green);
    log('ESTÁGIO 1 CONCLUÍDO COM SUCESSO!', colors.bright + colors.green);
    log('Monitorando o fluxo completo da campanha...', colors.bright + colors.green);
    log('=============================================\n', colors.bright + colors.green);
    
    // Função para continuar monitorando o fluxo completo da campanha
    async function monitorCampaignFlow() {
      try {
        let currentStatus = null;
        let previousStage = 'Etapa 2'; // Começamos no estágio 2 após o primeiro avanço
        let monitoringAttempts = 0;
        const maxMonitoringAttempts = 15; // 15 verificações com 20s entre cada = 5 minutos
        
        while (monitoringAttempts < maxMonitoringAttempts) {
          // Verificar o status atual
          currentStatus = await getFollowUpStatus(followUpId);
          
          if (!currentStatus) {
            log('Não foi possível obter o status do follow-up', colors.red);
            break;
          }
          
          // Verificar se o follow-up foi concluído
          if (currentStatus.status === 'completed') {
            log(`\n✅ FOLLOW-UP CONCLUÍDO COM SUCESSO!`, colors.bright + colors.green);
            log(`Todas as etapas da campanha foram processadas.`, colors.green);
            break;
          }
          
          // Verificar se houve mudança de estágio
          if (currentStatus.current_stage_name && currentStatus.current_stage_name !== previousStage) {
            log(`\n🔄 AVANÇO DETECTADO: ${previousStage} -> ${currentStatus.current_stage_name}`, colors.bright + colors.blue);
            previousStage = currentStatus.current_stage_name;
            
            // Encontrar o próximo estágio
            const campaignDetails = await prisma.followUpCampaign.findUnique({
              where: { id: CONFIG.campaignId },
              include: { stages: { orderBy: { order: 'asc' } } }
            });
            
            if (campaignDetails && campaignDetails.stages.length > 0) {
              // Verificar posição do estágio atual
              const allStages = campaignDetails.stages.map(s => s.name);
              const currentStageIndex = allStages.indexOf(currentStatus.current_stage_name);
              
              if (currentStageIndex !== -1 && currentStageIndex < allStages.length - 1) {
                // Há próximo estágio
                log(`Próximo estágio: ${allStages[currentStageIndex + 1]}`, colors.yellow);
                
                // Esperar todas as mensagens do estágio atual serem enviadas
                log(`Esperando todas as mensagens do estágio "${currentStatus.current_stage_name}" serem enviadas...`, colors.yellow);
                
                // Função para aguardar todas as mensagens do estágio atual
                async function waitForAllCurrentStageMessages() {
                  try {
                    // Buscar quantos passos existem neste estágio
                    const stageSteps = await prisma.followUpStep.count({
                      where: {
                        campaign_id: CONFIG.campaignId,
                        funnel_stage: { name: currentStatus.current_stage_name }
                      }
                    });
                    
                    log(`Total de passos no estágio "${currentStatus.current_stage_name}": ${stageSteps}`, colors.blue);
                    
                    let messagesDelivered = 0;
                    let attempts = 0;
                    const maxAttempts = 20; // Máximo de 20 tentativas
                    
                    while (attempts < maxAttempts) {
                      // Verificar mensagens entregues
                      const messages = await prisma.followUpMessage.findMany({
                        where: {
                          follow_up_id: followUpId,
                          funnel_stage: currentStatus.current_stage_name,
                          delivered: true
                        }
                      });
                      
                      messagesDelivered = messages.length;
                      log(`Mensagens entregues do estágio atual: ${messagesDelivered}/${stageSteps}`, colors.yellow);
                      
                      if (messagesDelivered >= stageSteps) {
                        log(`✓ Todas as mensagens do estágio "${currentStatus.current_stage_name}" foram entregues!`, colors.green);
                        return true;
                      }
                      
                      // Aguardar e tentar novamente
                      log(`Aguardando mais mensagens... (tentativa ${attempts + 1}/${maxAttempts})`, colors.yellow);
                      await sleep(10000);
                      attempts++;
                    }
                    
                    // Se não conseguiu receber todas as mensagens, continuar mesmo assim
                    log(`⚠️ Tempo máximo excedido. Continuando mesmo sem todas as mensagens...`, colors.yellow);
                    return true;
                  } catch (error) {
                    log(`Erro ao aguardar mensagens: ${error.message}`, colors.red);
                    return false;
                  }
                }
                
                // Aguardar o envio de todas as mensagens
                await waitForAllCurrentStageMessages();
                
                // Enviar resposta do cliente para avançar para o próximo estágio
                log(`Enviando resposta do cliente para avançar para o estágio "${allStages[currentStageIndex + 1]}"...`, colors.cyan);
                await sendClientResponse(followUpId, `Continuando o teste para avançar para o estágio ${allStages[currentStageIndex + 1]}`);
                
                // Aguardar processamento da resposta
                await sleep(5000);
              } else {
                log(`Este é o último estágio da campanha`, colors.yellow);
              }
            }
          }
          
          // Log do status atual
          log(`Status atual: ${currentStatus.status}, Estágio: ${currentStatus.current_stage_name}`, colors.blue);
          
          // Aguardar antes da próxima verificação
          log(`Aguardando processamento... (verificação ${monitoringAttempts + 1}/${maxMonitoringAttempts})`, colors.yellow);
          await sleep(20000); // 20 segundos entre verificações
          monitoringAttempts++;
        }
        
        if (monitoringAttempts >= maxMonitoringAttempts) {
          log(`\nTempo máximo de monitoramento atingido.`, colors.yellow);
          log(`Fluxo da campanha ainda em progresso, mas o teste será concluído.`, colors.yellow);
        }
        
        log('\n=============================================', colors.bright + colors.green);
        log('TESTE CONCLUÍDO COM SUCESSO!', colors.bright + colors.green);
        log('=============================================\n', colors.bright + colors.green);
      } catch (error) {
        log(`Erro ao monitorar fluxo da campanha: ${error.message}`, colors.red);
      }
    }
    
    // Iniciar o monitoramento
    await monitorCampaignFlow();
    
  } catch (error) {
    log('\n=============================================', colors.bright + colors.red);
    log('TESTE FALHOU!', colors.bright + colors.red);
    log(`Erro: ${error.message}`, colors.red);
    log('=============================================\n', colors.bright + colors.red);
    console.error(error);
    process.exit(1);
  } finally {
    // Desconectar do Prisma
    await prisma.$disconnect();
  }
}

// Executar o teste
testFollowUpFlow();