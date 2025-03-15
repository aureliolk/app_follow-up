// scripts/migrate-campaign-steps.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Função para converter string de tempo em milissegundos (copiada do manager.ts)
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
  
  // Se chegou aqui, tentar o formato abreviado (ex: "10m", "1h", "2d")
  const match = timeStr.match(/^(\d+)([smhd])$/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    if (units[unit]) {
      return value * units[unit];
    }
  }
  
  // Valor padrão se nenhum formato for reconhecido
  console.log("Formato de tempo não reconhecido, usando padrão de 30 minutos");
  return 30 * 60 * 1000;
}

async function migrateCampaignSteps() {
  try {
    console.log('Iniciando migração de passos das campanhas para o banco de dados...');
    
    // Buscar todas as campanhas
    const campaigns = await prisma.followUpCampaign.findMany();
    console.log(`Encontradas ${campaigns.length} campanhas para processar.`);
    
    // Buscar todos os estágios do funil
    const stages = await prisma.followUpFunnelStage.findMany({
      orderBy: { order: 'asc' }
    });
    console.log(`Encontrados ${stages.length} estágios do funil.`);
    
    // Para cada campanha, processar seus passos
    for (const campaign of campaigns) {
      console.log(`\nProcessando campanha: ${campaign.name} (ID: ${campaign.id})`);
      
      let steps = [];
      
      // Converter string JSON em objeto se necessário
      if (typeof campaign.steps === 'string') {
        try {
          steps = JSON.parse(campaign.steps);
        } catch (e) {
          console.error(`Erro ao analisar steps da campanha ${campaign.id}: ${e.message}`);
          continue;
        }
      } else {
        steps = campaign.steps;
      }
      
      if (!Array.isArray(steps)) {
        console.log(`A campanha ${campaign.id} não tem passos em formato de array.`);
        continue;
      }
      
      console.log(`A campanha tem ${steps.length} passos para processar.`);
      
      // Para cada passo, criar um registro na tabela FollowUpStep
      for (const step of steps) {
        try {
          // Determinar qual formato de dados está sendo usado
          let stageName, templateName, waitTime, messageContent, category, autoRespond;
          
          if (step.stage_name) {
            // Formato: { stage_name, wait_time, message, template_name }
            stageName = step.stage_name;
            templateName = step.template_name || '';
            waitTime = step.wait_time || '30 minutos';
            messageContent = step.message || '';
            category = step.category || 'Utility';
            autoRespond = step.auto_respond !== undefined ? step.auto_respond : true;
          } else if (step.etapa) {
            // Formato: { etapa, mensagem, tempo_de_espera, nome_template, categoria, resposta_automatica }
            stageName = step.etapa;
            templateName = step.nome_template || '';
            waitTime = step.tempo_de_espera || '30 minutos';
            messageContent = step.mensagem || '';
            category = step.categoria || 'Utility';
            autoRespond = step.resposta_automatica === 'Sim';
          } else {
            console.log(`Passo com formato desconhecido: ${JSON.stringify(step)}`);
            continue;
          }
          
          // Encontrar o estágio do funil correspondente
          const funnelStage = stages.find(s => s.name === stageName);
          
          if (!funnelStage) {
            console.log(`Estágio do funil não encontrado: ${stageName}`);
            continue;
          }
          
          const waitTimeMs = parseTimeString(waitTime);
          
          // Verificar se já existe um passo idêntico para evitar duplicação
          const existingStep = await prisma.followUpStep.findFirst({
            where: {
              funnel_stage_id: funnelStage.id,
              template_name: templateName,
              wait_time: waitTime
            }
          });
          
          if (existingStep) {
            console.log(`Passo já existe: ${existingStep.id} (${templateName})`);
            continue;
          }
          
          // Criar o passo no banco de dados
          const newStep = await prisma.followUpStep.create({
            data: {
              funnel_stage_id: funnelStage.id,
              name: `${stageName} - ${waitTime}`,
              template_name: templateName,
              wait_time: waitTime,
              wait_time_ms: waitTimeMs,
              message_content: messageContent,
              message_category: category,
              auto_respond: autoRespond,
              status: 'created'
            }
          });
          
          console.log(`Passo criado: ${newStep.id} (${newStep.template_name})`);
          
        } catch (stepError) {
          console.error(`Erro ao processar passo: ${stepError.message}`);
        }
      }
      
      // Conectar a campanha aos estágios do funil
      const stageNames = new Set(steps.map(s => s.stage_name || s.etapa).filter(Boolean));
      const stageIds = stages
        .filter(s => stageNames.has(s.name))
        .map(s => ({ id: s.id }));
      
      if (stageIds.length > 0) {
        await prisma.followUpCampaign.update({
          where: { id: campaign.id },
          data: {
            stages: {
              connect: stageIds
            }
          }
        });
        
        console.log(`Campanha ${campaign.id} conectada a ${stageIds.length} estágios do funil.`);
      }
    }
    
    console.log('\nMigração concluída com sucesso!');
    
  } catch (error) {
    console.error('Erro durante a migração:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar a migração
migrateCampaignSteps()
  .then(() => console.log('Script finalizado.'))
  .catch(e => console.error('Erro no script:', e));