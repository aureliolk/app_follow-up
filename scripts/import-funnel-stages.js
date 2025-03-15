// scripts/import-funnel-stages.js
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Função para converter string de tempo para milissegundos
function parseTimeString(timeStr) {
  if (!timeStr || timeStr.trim() === "") {
    console.log("Tempo de espera não definido, usando padrão de 30 minutos");
    return 30 * 60 * 1000;
  }

  const units = {
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
  };

  if (timeStr.includes("minutos") || timeStr.includes("minuto")) {
    const minutos = parseInt(timeStr);
    return isNaN(minutos) ? 30 * 60 * 1000 : minutos * 60 * 1000;
  } else if (timeStr.includes("hora") || timeStr.includes("horas")) {
    const horas = parseInt(timeStr);
    return isNaN(horas) ? 60 * 60 * 1000 : horas * 60 * 60 * 1000;
  } else if (timeStr.includes("dias") || timeStr.includes("dia")) {
    const dias = parseInt(timeStr);
    return isNaN(dias) ? 24 * 60 * 60 * 1000 : dias * 24 * 60 * 60 * 1000;
  } else if (timeStr.toLowerCase() === "imediatamente") {
    return 1000;
  }

  const match = timeStr.match(/^(\d+)([smhd])$/i);
  if (!match) {
    console.warn(`Formato de tempo inválido: ${timeStr}. Usando padrão de 30 minutos`);
    return 30 * 60 * 1000;
  }

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  if (!(unit in units)) {
    console.warn(`Unidade de tempo desconhecida: ${unit}. Usando padrão de 30 minutos`);
    return 30 * 60 * 1000;
  }

  return value * units[unit];
}

async function importFunnelStages() {
  try {
    const csvFilePath = path.join(path.resolve(), 'public', 'follow-up-sabrina-nunes-atualizado.csv');
    
    // Verificar se o CSV existe
    if (!fs.existsSync(csvFilePath)) {
      console.error(`Arquivo CSV não encontrado: ${csvFilePath}`);
      return;
    }

    console.log(`Importando dados do arquivo: ${csvFilePath}`);

    // Estrutura para armazenar os dados processados
    const funnelStages = new Map();
    const rows = [];

    // Ler o CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          // Processa cada linha do CSV
          rows.push(row);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Foram lidas ${rows.length} linhas do CSV.`);

    // Agrupar linhas por estágio de funil
    for (const row of rows) {
      const stageName = row['Etapa do Funil'];
      if (!stageName) continue;

      if (!funnelStages.has(stageName)) {
        funnelStages.set(stageName, []);
      }
      funnelStages.get(stageName).push(row);
    }

    console.log(`Foram identificados ${funnelStages.size} estágios de funil.`);

    // Criar os estágios de funil no banco de dados
    let order = 1;
    const campaignSteps = [];

    for (const [stageName, steps] of funnelStages.entries()) {
      console.log(`Processando estágio: ${stageName} com ${steps.length} passos`);

      // Criar o estágio de funil
      const funnelStage = await prisma.followUpFunnelStage.create({
        data: {
          name: stageName,
          order: order++,
          description: `Estágio de funil: ${stageName}`
        }
      });

      console.log(`Estágio criado: ${funnelStage.id}`);

      // Criar os passos para este estágio
      for (const step of steps) {
        const waitTime = step['Tempo de Disparo após Inatividade'];
        const templateName = step['Nome do Template da Mensagem'] || '';
        const category = step['Categoria da Mensagem'] || '';
        const messageContent = step['Template da Mensagem'] || '';
        const autoRespond = (step['Resposta Automática'] || '').toLowerCase() === 'sim';

        const waitTimeMs = parseTimeString(waitTime);

        const stepData = await prisma.followUpStep.create({
          data: {
            funnel_stage_id: funnelStage.id,
            name: `${stageName} - ${waitTime}`,
            template_name: templateName,
            wait_time: waitTime,
            wait_time_ms: waitTimeMs,
            message_content: messageContent,
            message_category: category,
            auto_respond: autoRespond,
            status: step['Status'] || 'created'
          }
        });

        console.log(`Passo criado: ${stepData.id}`);

        // Guardar para a campanha
        campaignSteps.push({
          stage_id: funnelStage.id,
          stage_name: stageName,
          step_id: stepData.id,
          template_name: templateName,
          wait_time: waitTime,
          wait_time_ms: waitTimeMs,
          message: messageContent,
          category: category,
          auto_respond: autoRespond
        });
      }
    }

    // Criar uma campanha padrão com todos os estágios e passos
    const campaignName = "Campanha Sabrina Nunes";
    const stageIds = Array.from(funnelStages.keys()).map(stageName => {
      return { id: funnelStages.get(stageName)[0].stage_id };
    });

    const campaign = await prisma.followUpCampaign.create({
      data: {
        name: campaignName,
        description: "Campanha completa de funil de vendas importada do CSV",
        steps: JSON.stringify(campaignSteps),
        active: true,
        stages: {
          connect: Array.from(funnelStages.entries()).map(([_, steps]) => {
            return { id: steps[0].stage_id };
          })
        }
      }
    });

    console.log(`Campanha criada: ${campaign.id}`);
    console.log("Importação concluída com sucesso!");

  } catch (error) {
    console.error("Erro durante a importação:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar a importação
importFunnelStages()
  .then(() => console.log("Script finalizado."))
  .catch(e => console.error("Erro no script:", e));