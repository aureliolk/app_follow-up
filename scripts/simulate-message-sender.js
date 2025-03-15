// simulate-message-sender.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();



/**
 * Este script simula o comportamento real do sistema de envio de mensagens,
 * incluindo o respeito aos tempos de espera, a detecção de mudanças de etapa,
 * e a simulação de respostas de clientes.
 */

// Configurações
const CONFIG = {
  // Use true para aguardar o tempo real definido em cada estágio
  USE_REAL_TIMING: false,
  
  // Fator de aceleração (quando USE_REAL_TIMING=false)
  // Por exemplo: 60 = 1 segundo representa 1 minuto
  TIME_ACCELERATION_FACTOR: 60,
  
  // Aguardar resposta do usuário entre etapas (false = simular automaticamente)
  WAIT_FOR_USER_RESPONSE: false,
  
  // Log detalhado de todas as operações
  VERBOSE_LOGGING: true
};

// Mensagens de simulação para respostas de clientes
const SIMULATED_RESPONSES = [
  "Sim, estou interessado no produto. Pode me dar mais informações?",
  "Preciso de mais detalhes sobre os preços e condições de pagamento.",
  "Ainda estou considerando. Vocês oferecem algum desconto?",
  "Qual é o prazo de entrega?",
  "Vou finalizar a compra hoje. Obrigado pela atenção!"
];

// Função para tempo de espera com feedback visual
function sleep(ms) {
  return new Promise(resolve => {
    // Se o tempo for muito curto, não mostrar contador
    if (ms < 3000) {
      setTimeout(resolve, ms);
      return;
    }
    
    // Para tempos mais longos, mostrar contador regressivo
    let secondsLeft = Math.ceil(ms / 1000);
    const interval = setInterval(() => {
      process.stdout.write(`\rAguardando: ${secondsLeft}s   `);
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        process.stdout.write("\rAguardando: Concluído!     \n");
        resolve();
      }
    }, 1000);
  });
}

// Função para converter string de tempo em milissegundos
function parseTimeString(timeStr) {
  if (!timeStr || timeStr === undefined || timeStr.trim() === "") {
    return 30 * 60 * 1000; // 30 minutos como padrão
  }
  
  const units = {
    's': 1000,           // segundos
    'm': 60 * 1000,      // minutos
    'h': 60 * 60 * 1000, // horas
    'd': 24 * 60 * 60 * 1000, // dias
  };

  // Extrair números do texto (para formatos como "10 minutos")
  const extractNumbers = (text) => {
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

  // Formato abreviado: "30m", "2h", "1d"
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
  console.warn(`Formato de tempo não reconhecido: "${timeStr}". Usando padrão de 30 minutos`);
  return 30 * 60 * 1000;
}

// Função para formatar timestamp para exibição
function formatDateTime(date) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Função para formatar duração
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  if (ms < 86400000) {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

// Função para simular o envio de uma mensagem
async function simulateMessageSend(followUpId, stepIndex, message, clientId, metadata = {}) {
  // Log de envio
  console.log(`\n📤 ENVIANDO MENSAGEM: Etapa ${stepIndex + 1}`);
  console.log(`📝 Conteúdo: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
  
  // Registrar a mensagem no banco de dados
  const recordedMessage = await prisma.followUpMessage.create({
    data: {
      follow_up_id: followUpId,
      step: stepIndex,
      content: message,
      funnel_stage: metadata.stage_name || 'Não definido',
      template_name: metadata.template_name || 'default',
      category: metadata.category || 'Utility',
      sent_at: new Date(),
      delivered: true,
      delivered_at: new Date()
    }
  });
  
  console.log(`✅ Mensagem registrada com ID: ${recordedMessage.id}`);
  
  // Aqui você poderia integrar com a API real de mensagens
  // Por exemplo, chamar API Lumibot ou outra API de envio
  
  return recordedMessage;
}

// Função para simular resposta do cliente
async function simulateClientResponse(followUpId, clientId) {
  // Selecionar uma resposta aleatória
  const responseIndex = Math.floor(Math.random() * SIMULATED_RESPONSES.length);
  const responseMessage = SIMULATED_RESPONSES[responseIndex];
  
  console.log(`\n👤 SIMULANDO RESPOSTA DO CLIENTE: "${responseMessage}"`);
  
  // Marcar o follow-up como responsivo
  await prisma.followUp.update({
    where: { id: followUpId },
    data: {
      is_responsive: true,
      status: 'paused' // Pausar o follow-up quando o cliente responde
    }
  });
  
  // Registrar a mensagem do cliente
  const clientMessage = await prisma.followUpMessage.create({
    data: {
      follow_up_id: followUpId,
      step: -1, // Mensagem do cliente
      content: responseMessage,
      sent_at: new Date(),
      delivered: true,
      delivered_at: new Date()
    }
  });
  
  console.log(`✅ Resposta do cliente registrada com ID: ${clientMessage.id}`);
  
  // Se esperamos interação do usuário real, aguardar confirmação
  if (CONFIG.WAIT_FOR_USER_RESPONSE) {
    console.log("\nPressione ENTER para continuar para a próxima etapa...");
    await new Promise(resolve => {
      process.stdin.once('data', data => {
        resolve();
      });
    });
  } else {
    // Pequena pausa para simular tempo de processamento
    await sleep(2000);
  }
  
  return clientMessage;
}

// Função para aguardar o tempo especificado
async function waitForNextMessage(waitTimeStr) {
  // Calcular o tempo de espera em ms
  const waitTimeMs = parseTimeString(waitTimeStr);
  const formattedTime = formatDuration(waitTimeMs);
  
  console.log(`\n⏱️ Tempo de espera: ${waitTimeStr} (${formattedTime})`);
  
  // Se estiver usando tempo real, aguardar o tempo completo
  if (CONFIG.USE_REAL_TIMING) {
    console.log(`Aguardando ${formattedTime} para próxima mensagem...`);
    await sleep(waitTimeMs);
  } else {
    // Usar tempo acelerado para testes
    const acceleratedTime = Math.max(1000, waitTimeMs / CONFIG.TIME_ACCELERATION_FACTOR);
    console.log(`Simulando tempo de espera: ${formattedTime} (acelerado para ${formatDuration(acceleratedTime)})`);
    await sleep(acceleratedTime);
  }
  
  console.log("✅ Tempo de espera concluído");
}

// Função principal para processar um follow-up específico
async function processFollowUp(followUpId) {
  try {
    console.log("===== INICIANDO SIMULAÇÃO DE ENVIO DE MENSAGENS =====");
    console.log(`Follow-up ID: ${followUpId}`);
    
    // Buscar o follow-up
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: true
      }
    });
    
    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`);
    }
    
    console.log(`\nProcessando follow-up para cliente: ${followUp.client_id}`);
    console.log(`Status atual: ${followUp.status}`);
    console.log(`Campanha: ${followUp.campaign.name}`);
    
    // Verificar se o follow-up está em um estado adequado
    if (followUp.status !== 'active' && followUp.status !== 'paused') {
      console.log(`Este follow-up está ${followUp.status}. Definindo como 'active' para simulação...`);
      
      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          status: 'active',
          current_step: 0, // Começar do início para simulação
          is_responsive: false
        }
      });
    }
    
    // Carregar as etapas da campanha
    const steps = JSON.parse(followUp.campaign.steps);
    
    if (!steps || steps.length === 0) {
      throw new Error("Nenhuma etapa de follow-up encontrada nesta campanha");
    }
    
    console.log(`Total de estágios/etapas: ${steps.length}`);
    
    // Agrupar por etapas do funil para melhor visualização
    const etapas = new Map();
    steps.forEach(step => {
      const etapaName = step.etapa || step.stage_name || 'Sem Etapa';
      if (!etapas.has(etapaName)) {
        etapas.set(etapaName, []);
      }
      etapas.get(etapaName).push(step);
    });
    
    console.log(`\nEtapas do Funil (${etapas.size}):`);
    for (const [etapaName, etapaSteps] of etapas.entries()) {
      console.log(`- ${etapaName}: ${etapaSteps.length} estágios`);
    }
    
    // Começar a processar a partir do estágio atual
    let currentStep = 0; // Para simulação, começamos do zero
    
    console.log("\n===== INICIANDO PROCESSAMENTO DE ETAPAS =====");
    
    // Loop de processamento dos estágios
    while (currentStep < steps.length) {
      // Buscar estado atual do follow-up a cada iteração
      const currentFollowUp = await prisma.followUp.findUnique({
        where: { id: followUpId }
      });
      
      if (!currentFollowUp || currentFollowUp.status === 'canceled' || currentFollowUp.status === 'completed') {
        console.log(`\n⚠️ Follow-up está ${currentFollowUp?.status || 'não encontrado'}. Interrompendo processamento.`);
        break;
      }
      
      // Verificar se o follow-up está pausado (cliente respondeu)
      if (currentFollowUp.status === 'paused') {
        console.log(`\n⏸️ Follow-up está pausado. Cliente é responsivo: ${currentFollowUp.is_responsive ? 'SIM' : 'NÃO'}`);
        
        // Se o cliente for responsivo, assumir que estamos prontos para a próxima etapa
        if (currentFollowUp.is_responsive) {
          console.log("Cliente já respondeu. Reativando para continuar para próxima etapa...");
          
          // Reativar o follow-up para continuar
          await prisma.followUp.update({
            where: { id: followUpId },
            data: {
              status: 'active',
              is_responsive: false
            }
          });
        } else {
          console.log("Follow-up pausado mas cliente não é responsivo. Situação inconsistente.");
          break;
        }
      }
      
      // Obter dados do estágio atual
      const currentStepData = steps[currentStep];
      
      console.log(`\n===== PROCESSANDO ESTÁGIO ${currentStep + 1}/${steps.length} =====`);
      console.log(`Etapa do Funil: ${currentStepData.etapa || currentStepData.stage_name || 'Não definida'}`);
      
      // Verificar se está mudando de etapa (para simulação)
      if (currentStep > 0) {
        const previousStep = steps[currentStep - 1];
        const previousEtapa = previousStep.etapa || previousStep.stage_name;
        const currentEtapa = currentStepData.etapa || currentStepData.stage_name;
        
        if (previousEtapa !== currentEtapa) {
          console.log(`\n🔄 TRANSIÇÃO DE ETAPA DETECTADA: ${previousEtapa} -> ${currentEtapa}`);
          console.log(`Este tipo de transição normalmente requer resposta do cliente.`);
          
          // Simular resposta do cliente para permitir a transição
          await simulateClientResponse(followUpId, currentFollowUp.client_id);
          
          // Atualizar o metadata para a nova etapa
          await prisma.followUp.update({
            where: { id: followUpId },
            data: {
              status: 'active',
              is_responsive: false,
              metadata: JSON.stringify({
                current_stage_name: currentEtapa,
                updated_at: new Date().toISOString()
              })
            }
          });
        }
      }
      
      // Obter tempo de espera
      const waitTime = currentStepData.tempo_de_espera || currentStepData.wait_time || '30 minutos';
      
      // Aguardar o tempo configurado
      await waitForNextMessage(waitTime);
      
      // Simular o envio da mensagem
      await simulateMessageSend(
        followUpId, 
        currentStep, 
        currentStepData.mensagem || currentStepData.message || 'Conteúdo da mensagem não definido', 
        currentFollowUp.client_id,
        {
          stage_name: currentStepData.etapa || currentStepData.stage_name,
          template_name: currentStepData.template_name,
          category: currentStepData.category
        }
      );
      
      // Verificar se é o último estágio
      if (currentStep === steps.length - 1) {
        console.log("\n🏁 ÚLTIMO ESTÁGIO ATINGIDO");
        
        // Marcar como concluído
        await prisma.followUp.update({
          where: { id: followUpId },
          data: {
            status: 'completed',
            completed_at: new Date()
          }
        });
        
        console.log("✅ Follow-up marcado como concluído");
        break;
      }
      
      // Verificar se o próximo estágio é de uma etapa diferente
      const nextStep = steps[currentStep + 1];
      const currentEtapa = currentStepData.etapa || currentStepData.stage_name;
      const nextEtapa = nextStep.etapa || nextStep.stage_name;
      
      if (currentEtapa !== nextEtapa) {
        console.log(`\n⚠️ PRÓXIMA ETAPA É DIFERENTE: ${currentEtapa} -> ${nextEtapa}`);
        console.log("Precisamos de resposta do cliente para avançar para outra etapa do funil");
        
        // Simular a resposta do cliente
        await simulateClientResponse(followUpId, currentFollowUp.client_id);
        
        // Atualizar o follow-up com a nova etapa
        await prisma.followUp.update({
          where: { id: followUpId },
          data: {
            current_step: currentStep + 1,
            status: 'active',
            is_responsive: false,
            metadata: JSON.stringify({
              current_stage_name: nextEtapa,
              updated_at: new Date().toISOString()
            })
          }
        });
      } else {
        // Avançar para o próximo estágio dentro da mesma etapa
        console.log(`\n➡️ Avançando para o próximo estágio dentro da mesma etapa: ${currentEtapa}`);
        
        await prisma.followUp.update({
          where: { id: followUpId },
          data: {
            current_step: currentStep + 1
          }
        });
      }
      
      // Avançar para o próximo estágio
      currentStep++;
      
      // Pequena pausa para melhor visualização no console
      await sleep(500);
    }
    
    console.log("\n===== SIMULAÇÃO CONCLUÍDA =====");
    
    // Exibir resumo final
    const finalFollowUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        messages: {
          orderBy: {
            sent_at: 'asc'
          }
        }
      }
    });
    
    console.log("\n📊 RESUMO DA SIMULAÇÃO:");
    console.log(`Status final: ${finalFollowUp.status}`);
    console.log(`Mensagens enviadas: ${finalFollowUp.messages.filter(m => m.step >= 0).length}`);
    console.log(`Respostas do cliente: ${finalFollowUp.messages.filter(m => m.step === -1).length}`);
    console.log(`Hora de início: ${formatDateTime(new Date(finalFollowUp.started_at))}`);
    console.log(`Hora de conclusão: ${formatDateTime(finalFollowUp.completed_at ? new Date(finalFollowUp.completed_at) : new Date())}`);
    
  } catch (error) {
    console.error("❌ ERRO NA SIMULAÇÃO:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Função para criar um novo follow-up e processá-lo imediatamente
async function createAndProcessFollowUp(campaignId, clientId) {
  try {
    console.log("===== CRIANDO NOVO FOLLOW-UP =====");
    console.log(`Campanha: ${campaignId}`);
    console.log(`Cliente: ${clientId}`);
    
    // Verificar se já existe um follow-up para este cliente
    const existingFollowUp = await prisma.followUp.findFirst({
      where: {
        client_id: clientId,
        campaign_id: campaignId,
        status: { in: ['active', 'paused'] }
      }
    });
    
    if (existingFollowUp) {
      console.log(`Follow-up existente encontrado: ${existingFollowUp.id}`);
      console.log(`Status: ${existingFollowUp.status}, Etapa: ${existingFollowUp.current_step + 1}`);
      
      // Perguntar se deseja continuar com este follow-up
      console.log("\nOpções:");
      console.log("1 - Usar o follow-up existente");
      console.log("2 - Cancelar o existente e criar um novo");
      console.log("3 - Abortar operação");
      
      const answer = await new Promise(resolve => {
        process.stdin.once('data', data => {
          resolve(data.toString().trim());
        });
      });
      
      if (answer === '1') {
        return processFollowUp(existingFollowUp.id);
      } else if (answer === '2') {
        // Cancelar o follow-up existente
        await prisma.followUp.update({
          where: { id: existingFollowUp.id },
          data: { status: 'canceled' }
        });
        console.log(`Follow-up anterior cancelado.`);
      } else {
        console.log("Operação abortada pelo usuário.");
        return;
      }
    }
    
    // Criar um novo follow-up
    const followUp = await prisma.followUp.create({
      data: {
        campaign_id: campaignId,
        client_id: clientId,
        status: "active",
        current_step: 0,
        current_stage_id: null,
        started_at: new Date(),
        next_message_at: new Date(),
        is_responsive: false
      }
    });
    
    console.log(`Novo follow-up criado: ${followUp.id}`);
    
    // Processar o follow-up
    return processFollowUp(followUp.id);
    
  } catch (error) {
    console.error("❌ ERRO AO CRIAR FOLLOW-UP:", error);
  }
}

// Menu principal
async function main() {
  console.log("===== SIMULADOR DE FOLLOW-UP =====");
  console.log("\nEscolha uma opção:");
  console.log("1 - Processar um follow-up existente (por ID)");
  console.log("2 - Criar um novo follow-up e processá-lo");
  console.log("3 - Sair");
  
  const option = await new Promise(resolve => {
    process.stdin.once('data', data => {
      resolve(data.toString().trim());
    });
  });
  
  if (option === '1') {
    console.log("\nDigite o ID do follow-up:");
    const followUpId = await new Promise(resolve => {
      process.stdin.once('data', data => {
        resolve(data.toString().trim());
      });
    });
    
    await processFollowUp(followUpId);
  } 
  else if (option === '2') {
    console.log("\nDigite o ID da campanha:");
    const campaignId = await new Promise(resolve => {
      process.stdin.once('data', data => {
        resolve(data.toString().trim());
      });
    });
    
    console.log("\nDigite o ID do cliente (email ou outro identificador):");
    const clientId = await new Promise(resolve => {
      process.stdin.once('data', data => {
        resolve(data.toString().trim());
      });
    });
    
    await createAndProcessFollowUp(campaignId, clientId);
  }
  else {
    console.log("Saindo...");
  }
  
  process.exit(0);
}

// With this ES modules check:
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if file is being run directly
if (import.meta.url === `file://${__filename}`) {
  // Configurar stdin para leitura
  process.stdin.setEncoding('utf8');
  
  // Executar menu principal
  main().catch(console.error);
}

// Exportar funções para uso em outros scripts
export {
  processFollowUp,
  createAndProcessFollowUp,
  simulateMessageSend,
  simulateClientResponse,
  parseTimeString
};