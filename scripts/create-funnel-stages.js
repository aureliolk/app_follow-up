// scripts/create-funnel-stages.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const funnelStages = [
  {
    name: "New - Aguardando Resposta (IA)",
    order: 1,
    description: "Cliente novo aguardando resposta inicial"
  },
  {
    name: "Conexão - Lead Engajado - Em Qualificação (IA)",
    order: 2,
    description: "Cliente engajado em processo de qualificação"
  },
  {
    name: "Qualificado IA",
    order: 3,
    description: "Cliente qualificado pela IA"
  },
  {
    name: "Fechamento (IA)",
    order: 4,
    description: "Cliente em processo de fechamento"
  },
  {
    name: "Carrinho Abandonado",
    order: 5,
    description: "Cliente abandonou o carrinho"
  },
  {
    name: "Checkout",
    order: 6,
    description: "Cliente realizou o checkout"
  }
];

async function createFunnelStages() {
  try {
    console.log("Iniciando criação de estágios do funil...");
    
    for (const stage of funnelStages) {
      const createdStage = await prisma.followUpFunnelStage.create({
        data: stage
      });
      
      console.log(`Estágio criado: ${createdStage.name} (ID: ${createdStage.id})`);
    }
    
    // Criar uma campanha de exemplo
    const campaign = await prisma.followUpCampaign.create({
      data: {
        name: "Campanha de Funil Completo",
        description: "Campanha com todos os estágios do funil de vendas",
        steps: JSON.stringify([
          {
            stage_name: "New - Aguardando Resposta (IA)",
            wait_time: "10 minutos",
            message: "Olá, percebi que você iniciou um contato conosco. Como posso ajudar?",
            template_name: "novo_lead_10min"
          },
          {
            stage_name: "Conexão - Lead Engajado - Em Qualificação (IA)",
            wait_time: "1 hora",
            message: "Olá! Vamos continuar nossa conversa? Estou aqui para qualificar suas necessidades.",
            template_name: "qualificacao_1h"
          },
          {
            stage_name: "Qualificado IA",
            wait_time: "20 minutos",
            message: "Baseado no que conversamos, temos a solução ideal para você! Quando podemos agendar uma demonstração?",
            template_name: "qualificado_20mn"
          }
        ]),
        active: true
      }
    });
    
    console.log(`Campanha criada: ${campaign.name} (ID: ${campaign.id})`);
    
    // Conectar a campanha a todos os estágios
    const allStages = await prisma.followUpFunnelStage.findMany();
    
    await prisma.followUpCampaign.update({
      where: { id: campaign.id },
      data: {
        stages: {
          connect: allStages.map(stage => ({ id: stage.id }))
        }
      }
    });
    
    console.log("Campanha conectada a todos os estágios do funil");
    console.log("Processo concluído com sucesso!");
    
  } catch (error) {
    console.error("Erro durante a criação dos estágios:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createFunnelStages()
  .then(() => console.log("Script finalizado."))
  .catch(e => console.error("Erro no script:", e));