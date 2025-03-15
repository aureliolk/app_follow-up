// test-follow-up.js
import { PrismaClient } from '@prisma/client';

// Importar diretamente as funções que precisamos, sem usar o módulo manager
// Definir função parseTimeString aqui para evitar problemas de importação
function parseTimeString(timeStr) {
  // Se o tempo estiver vazio ou for inválido, usar 30 minutos como padrão
  if (!timeStr || timeStr === undefined || timeStr.trim() === "") {
    console.log("Tempo de espera não definido, usando padrão de 30 minutos");
    return 30 * 60 * 1000; // 30 minutos
  }
  
  console.log(`Analisando tempo: "${timeStr}"`);

  const units = {
    's': 1000,           // segundos
    'm': 60 * 1000,      // minutos
    'h': 60 * 60 * 1000, // horas
    'd': 24 * 60 * 60 * 1000, // dias
  };

  // Extrair números do texto (para lidar com formatos como "10 minutos")
  const extractNumbers = (text) => {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : NaN;
  };

  // Verificar formato de texto com minutos
  if (timeStr.toLowerCase().includes("minuto")) {
    const minutos = extractNumbers(timeStr);
    console.log(`Extraído ${minutos} minutos do texto`);
    return isNaN(minutos) ? 30 * 60 * 1000 : minutos * 60 * 1000;
  } 
  // Verificar formato de texto com horas
  else if (timeStr.toLowerCase().includes("hora")) {
    const horas = extractNumbers(timeStr);
    console.log(`Extraído ${horas} horas do texto`);
    return isNaN(horas) ? 60 * 60 * 1000 : horas * 60 * 60 * 1000;
  } 
  // Verificar formato de texto com dias
  else if (timeStr.toLowerCase().includes("dia")) {
    const dias = extractNumbers(timeStr);
    console.log(`Extraído ${dias} dias do texto`);
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
    console.log(`Assumindo ${minutos} minutos baseado apenas nos números`);
    return minutos * 60 * 1000;
  }

  // Se nenhum formato for reconhecido, usar padrão de 30 minutos
  console.warn(`Formato de tempo não reconhecido: "${timeStr}". Usando padrão de 30 minutos`);
  return 30 * 60 * 1000;
}

const prisma = new PrismaClient();

/**
 * Script para testar o fluxo de follow-up de uma campanha
 * Simula o processamento de todos os estágios de uma campanha
 */
async function testFollowUpCampaign(campaignId, clientId = 'test_user@example.com') {
  try {
    console.log('=== INICIANDO TESTE DE FOLLOW-UP ===');
    console.log(`Campanha: ${campaignId}`);
    console.log(`Cliente: ${clientId}`);
    
    // Buscar campanha para verificar se existe
    const campaign = await prisma.followUpCampaign.findUnique({
      where: { id: campaignId }
    });
    
    if (!campaign) {
      throw new Error(`Campanha não encontrada: ${campaignId}`);
    }
    
    console.log(`Campanha encontrada: ${campaign.name}`);
    
    // Extrair etapas (steps) da campanha
    const campaignSteps = JSON.parse(campaign.steps);
    console.log(`Total de estágios na campanha: ${campaignSteps.length}`);
    
    // Agrupar estágios por etapas do funil para análise
    const etapas = new Map();
    
    campaignSteps.forEach((step) => {
      const etapaName = step.etapa || step.stage_name || 'Sem Etapa';
      if (!etapas.has(etapaName)) {
        etapas.set(etapaName, []);
      }
      etapas.get(etapaName).push(step);
    });
    
    console.log(`Total de etapas do funil: ${etapas.size}`);
    
    // Exibir resumo das etapas e estágios
    for (const [etapa, steps] of etapas.entries()) {
      console.log(`\nEtapa: "${etapa}" - ${steps.length} estágios`);
      
      for (const [index, step] of steps.entries()) {
        const tempoEspera = step.tempo_de_espera || step.wait_time || '30m';
        const tempoMs = parseTimeString(tempoEspera);
        const tempoFormatado = formatarTempo(tempoMs);
        
        console.log(`  Estágio ${index + 1}: Tempo de espera: ${tempoEspera} (${tempoFormatado})`);
        console.log(`    Mensagem: "${(step.mensagem || step.message)?.substring(0, 50)}..."`);
      }
    }

    // Criar um novo follow-up para teste
    console.log('\n=== CRIANDO FOLLOW-UP DE TESTE ===');
    
    // Primeiro, verificar se já existe um follow-up ativo para este cliente nesta campanha
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
      
      console.log('Um follow-up já existe para este cliente. Cancelando o existente e criando um novo...');
      
      // Cancelar o follow-up existente
      await prisma.followUp.update({
        where: { id: existingFollowUp.id },
        data: { status: 'canceled' }
      });
      
      console.log(`Follow-up anterior cancelado.`);
    }
    
    // Criar um novo follow-up
    const followUp = await prisma.followUp.create({
      data: {
        campaign_id: campaignId,
        client_id: clientId,
        status: "active",
        current_step: 0,
        current_stage_id: null, // Assumindo que ainda não temos o ID do estágio
        started_at: new Date(),
        next_message_at: new Date(),
        is_responsive: false
      }
    });
    
    console.log(`Novo follow-up criado: ${followUp.id}`);
    
    // Iniciar o processamento
    console.log('\n=== INICIANDO PROCESSAMENTO DE ESTÁGIOS ===');
    console.log('ATENÇÃO: Este teste vai simular o envio das mensagens sem aguardar os tempos de espera reais');
    console.log('Os resultados serão impressos imediatamente, mas na aplicação real as mensagens seriam enviadas');
    console.log('nos tempos definidos para cada estágio.\n');
    
    // Processar todos os estágios
    await processarTodosEstagios(followUp.id, campaignSteps);
    
    console.log('\n=== TESTE CONCLUÍDO ===');
  } catch (error) {
    console.error('Erro durante o teste de follow-up:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Processa todos os estágios de um follow-up, registrando informações sobre
 * a lógica de transição e estágios do funil
 */
async function processarTodosEstagios(followUpId, campaignSteps) {
  try {
    let currentStep = 0;
    
    while (currentStep < campaignSteps.length) {
      const step = campaignSteps[currentStep];
      
      // Buscar o estado atual do follow-up
      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId }
      });
      
      if (!followUp || followUp.status !== 'active') {
        console.log(`Follow-up não está mais ativo. Status: ${followUp?.status || 'N/A'}`);
        break;
      }
      
      console.log(`\n> Processando estágio ${currentStep + 1}`);
      console.log(`  Etapa do funil: ${step.etapa || step.stage_name || 'Não definida'}`);
      console.log(`  Tempo de espera: ${step.tempo_de_espera || step.wait_time || '30m'}`);
      console.log(`  Mensagem: "${(step.mensagem || step.message)?.substring(0, 50)}..."`);
      
      // Simular envio de mensagem
      console.log('  Simulando envio da mensagem...');
      
      // Registrar a mensagem no banco de dados
      await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUpId,
          step: currentStep,
          content: step.mensagem || step.message || 'Conteúdo da mensagem',
          funnel_stage: step.etapa || step.stage_name || 'Não definida',
          template_name: step.template_name,
          category: step.category,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date()
        }
      });
      
      console.log('  Mensagem registrada no banco de dados.');
      
      // Verificar se o próximo estágio muda de etapa
      if (currentStep + 1 < campaignSteps.length) {
        const nextStep = campaignSteps[currentStep + 1];
        const currentEtapa = step.etapa || step.stage_name;
        const nextEtapa = nextStep.etapa || nextStep.stage_name;
        
        if (currentEtapa !== nextEtapa) {
          console.log(`\n  [TRANSIÇÃO DE ETAPA DETECTADA]`);
          console.log(`  De: "${currentEtapa}" Para: "${nextEtapa}"`);
          console.log(`  Na lógica real, esta transição só ocorreria se o cliente respondesse.`);
          
          // Agora vamos simular uma resposta do cliente para testar a transição
          console.log('\n  SIMULANDO RESPOSTA DO CLIENTE PARA PERMITIR TRANSIÇÃO DE ETAPA');
          
          // Atualizar o follow-up como responsivo
          await prisma.followUp.update({
            where: { id: followUpId },
            data: {
              is_responsive: true,
              status: 'paused' // Pausar o follow-up quando o cliente responde
            }
          });
          
          // Registrar uma mensagem simulada do cliente
          await prisma.followUpMessage.create({
            data: {
              follow_up_id: followUpId,
              step: -1, // Mensagem do cliente
              content: 'Mensagem simulada do cliente para testar transição de etapa',
              sent_at: new Date(),
              delivered: true,
              delivered_at: new Date()
            }
          });
          
          console.log('  Cliente marcado como responsivo, mensagem simulada registrada.');
          console.log('  Na lógica real, o follow-up seria pausado aqui e aguardaria intervenção humana.');
          
          // Pequena pausa para simular operador vendo a mensagem
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Como é um teste, vamos "resumir" manualmente o follow-up para a próxima etapa
          await prisma.followUp.update({
            where: { id: followUpId },
            data: {
              current_step: currentStep + 1,
              is_responsive: false, // Resetar para simular continuação
              status: 'active',
              metadata: JSON.stringify({
                current_stage_name: nextEtapa,
                updated_at: new Date().toISOString()
              })
            }
          });
          
          console.log('  Follow-up resumido automaticamente para a próxima etapa (apenas para teste).');
        } else {
          // Apenas avanço normal para o próximo estágio na mesma etapa
          console.log('  Avançando para o próximo estágio na mesma etapa');
          
          // Como é um teste, vamos avançar manualmente o follow-up
          await prisma.followUp.update({
            where: { id: followUpId },
            data: {
              current_step: currentStep + 1
            }
          });
        }
      } else {
        console.log('\n  [ÚLTIMO ESTÁGIO ATINGIDO]');
        console.log('  Não há mais estágios na campanha. Follow-up seria marcado como concluído.');
        
        // Marcar follow-up como concluído
        await prisma.followUp.update({
          where: { id: followUpId },
          data: {
            status: 'completed',
            completed_at: new Date()
          }
        });
        
        console.log('  Follow-up marcado como concluído.');
      }
      
      // Avançar para o próximo estágio
      currentStep++;
      
      // Pequena pausa entre os estágios para melhor visualização no console
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('Erro ao processar estágios:', error);
  }
}

/**
 * Formatar o tempo em milissegundos para um formato mais legível
 */
function formatarTempo(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${Math.floor(ms / 1000)}s`;
  }
  if (ms < 3600000) {
    const minutos = Math.floor(ms / 60000);
    const segundos = Math.floor((ms % 60000) / 1000);
    return segundos > 0 ? `${minutos}m ${segundos}s` : `${minutos}m`;
  }
  if (ms < 86400000) {
    const horas = Math.floor(ms / 3600000);
    const minutos = Math.floor((ms % 3600000) / 60000);
    return minutos > 0 ? `${horas}h ${minutos}m` : `${horas}h`;
  }
  
  const dias = Math.floor(ms / 86400000);
  const horas = Math.floor((ms % 86400000) / 3600000);
  return horas > 0 ? `${dias}d ${horas}h` : `${dias}d`;
}

// Executar o teste para uma campanha específica
// Obter argumentos da linha de comando
const campaignId = process.argv[2];
const clientId = process.argv[3] || 'cliente_teste@exemplo.com';

if (!campaignId) {
  console.error('Erro: ID da campanha não fornecido!');
  console.log('Uso: node test-follow-up.js CAMPANHA_ID [EMAIL_CLIENTE]');
  process.exit(1);
}

// Para executar o script:
// node test-follow-up.js CAMPANHA_ID EMAIL_CLIENTE
console.log(`Iniciando teste para campanha ${campaignId} com cliente ${clientId}`);
testFollowUpCampaign(campaignId, clientId)
  .catch(console.error);