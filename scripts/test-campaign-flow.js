// test-campaign-flow.js
// Script para testar o fluxo completo de uma campanha de follow-up

import axios from 'axios';

// Configuração - será sobrescrita pelos argumentos da linha de comando
let CONFIG = {
  baseUrl: 'http://localhost:3000',
  campaignId: '852fabf3-e6c1-4c64-8ee3-d7b3f443b350',
  clientId: '58',
  timeout: 40000, // Tempo máximo para aguardar cada mensagem (40s)
  responseMessage: 'Esta é uma resposta de teste automático',
  verbose: true,
  apiKey: 'test-api-key-123456' // Chave de API para testes
};

// Cores para saída no console
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

/**
 * Utilitários
 */
function log(message, color = colors.reset) {
  if (CONFIG.verbose) {
    const timestamp = new Date().toISOString().substr(11, 8);
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Função para criar um novo follow-up
 */
async function createFollowUp(campaignId, clientId) {
  try {
    log(`Criando novo follow-up para campanha ${campaignId} e cliente ${clientId}...`, colors.cyan);
    
    // Verificar se já existe follow-up ativo para este cliente
    log('Verificando e cancelando follow-ups existentes...', colors.yellow);
    
    try {
      const existingResponse = await axios.get(`${CONFIG.baseUrl}/api/follow-up?clientId=${clientId}`, {
        headers: {
          'x-api-key': CONFIG.apiKey
        }
      });
      
      if (existingResponse.data.success && existingResponse.data.data?.length > 0) {
        for (const followUp of existingResponse.data.data) {
          if (followUp.status === 'active' || followUp.status === 'paused') {
            log(`Cancelando follow-up existente: ${followUp.id}`, colors.yellow);
            
            await axios.post(`${CONFIG.baseUrl}/api/follow-up/cancel`, {
              followUpId: followUp.id
            }, {
              headers: {
                'x-api-key': CONFIG.apiKey
              }
            });
          }
        }
      }
    } catch (err) {
      log(`Aviso: Não foi possível verificar follow-ups existentes: ${err.message}`, colors.yellow);
    }
    
    // Criar novo follow-up
    const response = await axios.post(`${CONFIG.baseUrl}/api/follow-up`, {
      clientId,
      campaignId,
      metadata: {
        source: 'Teste Automatizado',
        test_run: true,
        timestamp: new Date().toISOString()
      }
    }, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(`API retornou erro: ${response.data.error}`);
    }
    
    const followUpId = response.data.followUpId;
    log(`Follow-up criado com sucesso! ID: ${followUpId}`, colors.green);
    
    return followUpId;
  } catch (error) {
    log(`Erro ao criar follow-up: ${error.message}`, colors.red);
    if (error.response?.data) {
      log(`Detalhes: ${JSON.stringify(error.response.data)}`, colors.red);
    }
    throw error;
  }
}

/**
 * Função para buscar estágios de uma campanha
 */
async function getCampaignStages(campaignId) {
  try {
    log(`Buscando estágios da campanha ${campaignId}...`, colors.cyan);
    log(`URL: ${CONFIG.baseUrl}/api/follow-up/funnel-stages?campaignId=${campaignId}`, colors.yellow);
    
    const response = await axios.get(`${CONFIG.baseUrl}/api/follow-up/funnel-stages?campaignId=${campaignId}`, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    log(`Resposta da API: ${JSON.stringify(response.data)}`, colors.yellow);
    
    if (!response.data.success) {
      throw new Error(`API retornou erro: ${response.data.error}`);
    }
    
    const stages = response.data.data;
    log(`Encontrados ${stages.length} estágios para a campanha:`, colors.green);
    
    stages.forEach((stage, index) => {
      log(`  ${index + 1}. ${stage.name} (ID: ${stage.id}) - ${stage.stepsCount || 0} passos`, colors.cyan);
    });
    
    return stages;
  } catch (error) {
    log(`Erro ao buscar estágios: ${error.message}`, colors.red);
    if (error.response) {
      log(`Status: ${error.response.status}`, colors.red);
      if (error.response.data) {
        log(`Detalhes: ${JSON.stringify(error.response.data)}`, colors.red);
      }
    } else if (error.request) {
      log(`Erro de conexão: ${error.message}`, colors.red);
    } else {
      log(`Erro inesperado: ${error.message}`, colors.red);
    }
    console.error('Erro completo:', error);
    throw error;
  }
}

/**
 * Função para obter o status atual de um follow-up
 */
async function getFollowUpStatus(followUpId) {
  try {
    const response = await axios.get(`${CONFIG.baseUrl}/api/follow-up/status?id=${followUpId}`, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(`API retornou erro: ${response.data.error}`);
    }
    
    return response.data.data;
  } catch (error) {
    log(`Erro ao obter status: ${error.message}`, colors.red);
    throw error;
  }
}

/**
 * Função para obter mensagens de um follow-up
 */
async function getFollowUpMessages(followUpId) {
  try {
    const response = await axios.get(`${CONFIG.baseUrl}/api/follow-up/messages?followUpId=${followUpId}`, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(`API retornou erro: ${response.data.error}`);
    }
    
    return response.data.data || [];
  } catch (error) {
    log(`Erro ao obter mensagens: ${error.message}`, colors.red);
    throw error;
  }
}

/**
 * Função para esperar até que uma mensagem específica seja enviada
 */
async function waitForMessage(followUpId, stepIndex, timeout = CONFIG.timeout) {
  log(`Aguardando mensagem do passo ${stepIndex}...`, colors.yellow);
  
  const startTime = Date.now();
  const checkInterval = 1000; // 1 segundo
  
  while (Date.now() - startTime < timeout) {
    try {
      const messages = await getFollowUpMessages(followUpId);
      const matchingMessage = messages.find(msg => msg.step === stepIndex && msg.delivered);
      
      if (matchingMessage) {
        log(`✓ Mensagem do passo ${stepIndex} recebida: "${matchingMessage.content.substring(0, 30)}..."`, colors.green);
        return matchingMessage;
      }
      
      // Verificar se o follow-up ainda está ativo
      const status = await getFollowUpStatus(followUpId);
      if (status.status !== 'active' && status.status !== 'paused') {
        log(`Follow-up não está mais ativo. Status atual: ${status.status}`, colors.yellow);
        throw new Error(`Follow-up não está ativo (${status.status})`);
      }
      
      await sleep(checkInterval);
    } catch (error) {
      log(`Erro ao verificar mensagens: ${error.message}`, colors.red);
      await sleep(checkInterval);
    }
  }
  
  throw new Error(`Timeout esperando pela mensagem do passo ${stepIndex}`);
}

/**
 * Função para esperar por mudança de etapa
 */
async function waitForStageChange(followUpId, expectedStageName, timeout = CONFIG.timeout) {
  log(`Aguardando mudança para etapa "${expectedStageName}"...`, colors.yellow);
  
  const startTime = Date.now();
  const checkInterval = 1000; // 1 segundo
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await getFollowUpStatus(followUpId);
      let currentStageName = "Não definido";
      
      // Extrair nome da etapa atual do metadata
      try {
        if (status.metadata) {
          const metadata = typeof status.metadata === 'string' 
            ? JSON.parse(status.metadata) 
            : status.metadata;
          
          currentStageName = metadata.current_stage_name || "Não definido";
        }
      } catch (e) {
        log(`Erro ao analisar metadata: ${e.message}`, colors.yellow);
      }
      
      if (currentStageName === expectedStageName) {
        log(`✓ Follow-up mudou para etapa "${expectedStageName}"`, colors.green);
        return true;
      }
      
      // Verificar se o follow-up ainda está ativo ou pausado
      if (status.status !== 'active' && status.status !== 'paused') {
        log(`Follow-up não está mais ativo. Status atual: ${status.status}`, colors.yellow);
        throw new Error(`Follow-up não está mais ativo (${status.status})`);
      }
      
      await sleep(checkInterval);
    } catch (error) {
      log(`Erro ao verificar mudança de etapa: ${error.message}`, colors.red);
      await sleep(checkInterval);
    }
  }
  
  throw new Error(`Timeout esperando mudança para etapa "${expectedStageName}"`);
}

/**
 * Função para simular resposta do cliente
 */
async function simulateClientResponse(clientId, message = CONFIG.responseMessage, followUpId = null) {
  try {
    log(`Enviando resposta do cliente para follow-up ${followUpId || 'todos'}: "${message}"`, colors.cyan);
    
    const payload = {
      clientId,
      message
    };
    
    // Adicionar followUpId ao payload apenas se foi fornecido
    if (followUpId) {
      payload.followUpId = followUpId;
    }
    
    const response = await axios.post(`${CONFIG.baseUrl}/api/follow-up/client-response`, payload, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(`API retornou erro: ${response.data.error}`);
    }
    
    log(`✓ Resposta do cliente enviada com sucesso para follow-up ${response.data.followUpId || 'todos'}`, colors.green);
    return response.data;
  } catch (error) {
    log(`Erro ao enviar resposta do cliente: ${error.message}`, colors.red);
    throw error;
  }
}

/**
 * Função para retomar um follow-up pausado
 */
async function resumeFollowUp(followUpId) {
  try {
    log(`Retomando follow-up ${followUpId}...`, colors.cyan);
    
    const response = await axios.post(`${CONFIG.baseUrl}/api/follow-up/resume`, {
      followUpId
    }, {
      headers: {
        'x-api-key': CONFIG.apiKey
      }
    });
    
    if (!response.data.success) {
      throw new Error(`API retornou erro: ${response.data.error}`);
    }
    
    log(`✓ Follow-up retomado com sucesso`, colors.green);
    return response.data;
  } catch (error) {
    log(`Erro ao retomar follow-up: ${error.message}`, colors.red);
    throw error;
  }
}

/**
 * Função principal para testar o fluxo completo de uma campanha
 */
async function testCampaignFlow(campaignId, clientId) {
  log('', colors.reset);
  log('====================================================', colors.bright + colors.magenta);
  log(`TESTE DE FLUXO DE CAMPANHA: ${campaignId}`, colors.bright + colors.magenta);
  log('====================================================', colors.bright + colors.magenta);
  
  try {
    // 1. Obter estágios da campanha
    const stages = await getCampaignStages(campaignId);
    
    if (stages.length === 0) {
      throw new Error('A campanha não tem estágios definidos!');
    }
    
    // 2. Criar um novo follow-up
    const followUpId = await createFollowUp(campaignId, clientId);
    
    // 3. Obter status inicial
    const initialStatus = await getFollowUpStatus(followUpId);
    log('\nStatus inicial:', colors.blue);
    log(`  ID: ${followUpId}`, colors.blue);
    log(`  Status: ${initialStatus.status}`, colors.blue);
    log(`  Etapa atual: ${initialStatus.current_step + 1}`, colors.blue);
    
    // 4. Processar cada etapa do funil
    log('\n--- INICIANDO PROCESSAMENTO DE ETAPAS ---', colors.bright + colors.cyan);
    
    // Mapear nomes de etapas para controle
    const stageNames = stages.map(stage => stage.name);
    let currentStageIndex = 0;
    let messagesReceived = 0;
    let clientResponses = 0;
    
    // Loop principal - vamos percorrer as etapas do funil
    while (currentStageIndex < stageNames.length) {
      const currentStageName = stageNames[currentStageIndex];
      log(`\n===> PROCESSANDO ETAPA: ${currentStageName} (${currentStageIndex + 1}/${stageNames.length})`, colors.bright + colors.blue);
      
      // Verificar se esta etapa precisa de resposta manual do cliente antes de iniciar
      // Isso é determinado pelo comportamento do fluxo da campanha
      const isSpecialStage = currentStageName === "Qualificado IA" || 
                            currentStageName === "Fechamento (IA)" ||
                            currentStageName === "Carrinho Abandonado";
                            
      if (isSpecialStage && currentStageIndex > 0) {
        log(`\n===> ETAPA ESPECIAL DETECTADA: "${currentStageName}" - PODE PRECISAR DE RESPOSTA INICIAL`, colors.bright + colors.blue);
        log(`Enviando resposta do cliente para iniciar a etapa...`, colors.yellow);
        await simulateClientResponse(clientId, `Quero saber mais sobre a etapa ${currentStageName}`, followUpId);
        clientResponses++;
        // Aguardar um tempo para processar
        await sleep(2000);
      }
      
      // Esperar pela primeira mensagem desta etapa
      const status = await getFollowUpStatus(followUpId);
      let latestMessageIndex = status.current_step;
      
      // Garantir que recebemos pelo menos uma mensagem desta etapa
      log(`Aguardando mensagem da etapa ${currentStageName}...`, colors.yellow);
      await waitForMessage(followUpId, latestMessageIndex);
      messagesReceived++;
      
      // Verificar se há mais mensagens nesta etapa
      let keepWaiting = true;
      while (keepWaiting) {
        try {
          // Verificar status atual
          const currentStatus = await getFollowUpStatus(followUpId);
          
          // Se a etapa atual avançou, esperar a próxima mensagem
          if (currentStatus.current_step > latestMessageIndex) {
            log(`Etapa avançou para ${currentStatus.current_step}`, colors.yellow);
            await waitForMessage(followUpId, currentStatus.current_step);
            latestMessageIndex = currentStatus.current_step;
            messagesReceived++;
          } 
          // Se não avançou após um tempo, provavelmente é a última mensagem desta etapa
          else {
            log(`Sem novas mensagens após ${CONFIG.timeout/1000}s, assumindo que é a última da etapa`, colors.yellow);
            keepWaiting = false;
          }
          
          // Verificar se o follow-up ainda está ativo
          if (currentStatus.status !== 'active') {
            log(`Status do follow-up mudou para ${currentStatus.status}`, colors.yellow);
            
            if (currentStatus.status === 'paused') {
              log('Follow-up pausado - aguardando resposta do cliente. Retomando...', colors.yellow);
              await resumeFollowUp(followUpId);
            } 
            else if (currentStatus.status === 'completed') {
              log('Follow-up marcado como completo!', colors.green);
              return {
                success: true,
                followUpId,
                messagesReceived,
                clientResponses,
                completed: true
              };
            }
            else {
              throw new Error(`Follow-up não está mais ativo (${currentStatus.status})`);
            }
          }
          
          await sleep(1000); // Pausa breve entre verificações
        } 
        catch (error) {
          if (error.message.includes('Timeout')) {
            log('Timeout aguardando próxima mensagem, assumindo que é a última da etapa', colors.yellow);
            keepWaiting = false;
          } else {
            throw error;
          }
        }
      }
      
      // Se não é a última etapa, enviar resposta do cliente para avançar
      if (currentStageIndex < stageNames.length - 1) {
        log(`\n===> ENVIANDO RESPOSTA PARA AVANÇAR PARA PRÓXIMA ETAPA`, colors.bright + colors.yellow);
        // Agora passamos o ID específico do follow-up para garantir que apenas este follow-up seja afetado
        await simulateClientResponse(clientId, CONFIG.responseMessage, followUpId);
        clientResponses++;
        
        // Aguardar mudança para a próxima etapa
        const nextStageName = stageNames[currentStageIndex + 1];
        log(`Aguardando mudança para próxima etapa: ${nextStageName}...`, colors.yellow);
        
        try {
          await waitForStageChange(followUpId, nextStageName);
          currentStageIndex++;
          
          // Se a próxima etapa for "Qualificado IA", enviar uma resposta adicional
          // Esta etapa específica requer uma resposta do cliente antes de enviar a próxima mensagem
          if (nextStageName === "Qualificado IA") {
            log(`\n===> DETECTADO ETAPA ESPECIAL "${nextStageName}" - ENVIANDO RESPOSTA ADICIONAL`, colors.bright + colors.yellow);
            await simulateClientResponse(clientId, "Sim, estou interessado. Por favor, continue.", followUpId);
            clientResponses++;
            log('Resposta adicional enviada para etapa especial', colors.green);
          }
        } catch (error) {
          // Se não conseguiu detectar mudança de etapa pelo nome, verificar status
          log(`Não foi possível detectar mudança para etapa ${nextStageName}`, colors.yellow);
          log('Verificando status atual...', colors.yellow);
          
          const currentStatus = await getFollowUpStatus(followUpId);
          // Se estiver completo, terminamos
          if (currentStatus.status === 'completed') {
            log('Follow-up marcado como completo!', colors.green);
            break;
          }
          
          // Se estiver pausado, retomar
          if (currentStatus.status === 'paused') {
            log('Follow-up pausado. Retomando...', colors.yellow);
            await resumeFollowUp(followUpId);
            // Vamos assumir que avançou e seguir para próxima etapa
            currentStageIndex++;
          }
        }
      } 
      // Se é a última etapa, apenas aguardar conclusão
      else {
        log('\n===> ÚLTIMA ETAPA PROCESSADA', colors.bright + colors.green);
        
        // Verificar status final
        const finalStatus = await getFollowUpStatus(followUpId);
        log(`Status final: ${finalStatus.status}`, colors.green);
        
        if (finalStatus.status !== 'completed') {
          log('Follow-up não foi marcado como completo. Verificando se há mais ações necessárias...', colors.yellow);
          
          if (finalStatus.status === 'paused') {
            log('Follow-up está pausado. Enviando resposta final...', colors.yellow);
            await simulateClientResponse(clientId, "Obrigado pela atenção. Teste concluído.", followUpId);
            clientResponses++;
            
            // Verificar status após resposta final
            await sleep(2000);
            const afterResponseStatus = await getFollowUpStatus(followUpId);
            log(`Status após resposta final: ${afterResponseStatus.status}`, colors.green);
          }
        }
        
        break; // Sair do loop de etapas
      }
    }
    
    // 5. Verificar o resultado final
    const finalMessages = await getFollowUpMessages(followUpId);
    const finalStatus = await getFollowUpStatus(followUpId);
    
    log('\n====================================================', colors.bright + colors.green);
    log('TESTE CONCLUÍDO COM SUCESSO!', colors.bright + colors.green);
    log('====================================================', colors.bright + colors.green);
    log('Resumo do teste:', colors.green);
    log(`  Follow-up ID: ${followUpId}`, colors.green);
    log(`  Status final: ${finalStatus.status}`, colors.green);
    log(`  Etapas processadas: ${currentStageIndex + 1}/${stageNames.length}`, colors.green);
    log(`  Mensagens recebidas: ${messagesReceived}`, colors.green);
    log(`  Respostas enviadas: ${clientResponses}`, colors.green);
    log(`  Total de mensagens no follow-up: ${finalMessages.length}`, colors.green);
    
    return {
      success: true,
      followUpId,
      messagesReceived,
      clientResponses,
      completed: finalStatus.status === 'completed'
    };
  } catch (error) {
    log('\n====================================================', colors.bright + colors.red);
    log('TESTE FALHOU!', colors.bright + colors.red);
    log('====================================================', colors.bright + colors.red);
    log(`Erro: ${error.message}`, colors.red);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Processar argumentos da linha de comando
function processArguments() {
  const args = process.argv.slice(2);
  
  // Se tem help, mostrar ajuda e sair
  if (args.includes('--help') || args.includes('-h')) {
    console.log('\nTeste de fluxo de campanha de follow-up');
    console.log('Uso: node test-campaign-flow.js [opções]');
    console.log('\nOpções:');
    console.log('  --campaign, -c ID      ID da campanha a ser testada [padrão: ' + CONFIG.campaignId + ']');
    console.log('  --client, -u ID        ID do cliente (email ou telefone) [padrão: ' + CONFIG.clientId + ']');
    console.log('  --url, -b URL          URL base da API [padrão: http://localhost:3000]');
    console.log('  --timeout, -t MS       Timeout em ms para esperar cada mensagem [padrão: 40000]');
    console.log('  --response, -r MSG     Mensagem de resposta do cliente [padrão: mensagem de teste]');
    console.log('  --quiet, -q            Modo silencioso (menos logs)');
    console.log('  --help, -h             Mostra esta ajuda\n');
    process.exit(1);
  }
  
  // Se não tem argumentos, usar os valores padrão
  if (args.length === 0) {
    // Já estamos usando os valores padrão então não precisamos fazer nada
    return;
  }
  
  // Processar argumentos
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--campaign' || arg === '-c') {
      CONFIG.campaignId = args[++i];
    }
    else if (arg === '--client' || arg === '-u') {
      CONFIG.clientId = args[++i];
    }
    else if (arg === '--url' || arg === '-b') {
      CONFIG.baseUrl = args[++i];
    }
    else if (arg === '--timeout' || arg === '-t') {
      CONFIG.timeout = parseInt(args[++i], 10);
    }
    else if (arg === '--response' || arg === '-r') {
      CONFIG.responseMessage = args[++i];
    }
    else if (arg === '--quiet' || arg === '-q') {
      CONFIG.verbose = false;
    }
  }
  
  // Validar se temos campanha configurada
  if (!CONFIG.campaignId) {
    console.error('Erro: ID da campanha é obrigatório!');
    console.error('Use --campaign ou -c para especificar o ID da campanha');
    console.error('Use --help para mais informações');
    process.exit(1);
  }
  
  // Mostrar configuração
  if (CONFIG.verbose) {
    console.log('\n=== Configuração ===');
    console.log(`URL base: ${CONFIG.baseUrl}`);
    console.log(`ID da campanha: ${CONFIG.campaignId}`);
    console.log(`ID do cliente: ${CONFIG.clientId}`);
    console.log(`Timeout: ${CONFIG.timeout}ms`);
    console.log(`Mensagem de resposta: "${CONFIG.responseMessage}"`);
    console.log('==================\n');
  }
}

// Execução principal
async function main() {
  try {
    processArguments();
    await testCampaignFlow(CONFIG.campaignId, CONFIG.clientId);
  } catch (error) {
    console.error(`Erro fatal: ${error.message}`);
    process.exit(1);
  }
}

main();