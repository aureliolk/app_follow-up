// scripts/create-sample-followups.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Gerar nomes aleatórios
const firstNames = ["Maria", "João", "Ana", "Pedro", "Carla", "Lucas", "Juliana", "Roberto", "Sandra", "Márcio"];
const lastNames = ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Ferreira", "Rodrigues", "Almeida", "Gomes"];

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomName() {
  return `${getRandomElement(firstNames)} ${getRandomElement(lastNames)}`;
}

function generateRandomEmail(name) {
  const [firstName, lastName] = name.split(' ');
  const domains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.br", "uol.com.br"];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${getRandomElement(domains)}`;
}

function generateRandomPhone() {
  return `(${Math.floor(Math.random() * 90) + 10}) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;
}

async function createSampleFollowUps() {
  try {
    console.log("Iniciando criação de exemplos de follow-up...");
    
    // Buscar a campanha e os estágios
    const campaign = await prisma.followUpCampaign.findFirst({
      orderBy: { created_at: 'desc' }
    });
    
    if (!campaign) {
      console.error("Nenhuma campanha encontrada. Execute primeiro o script create-funnel-stages.js");
      return;
    }
    
    const stages = await prisma.followUpFunnelStage.findMany({
      orderBy: { order: 'asc' }
    });
    
    if (stages.length === 0) {
      console.error("Nenhum estágio de funil encontrado. Execute primeiro o script create-funnel-stages.js");
      return;
    }
    
    // Criar alguns follow-ups para cada estágio
    for (const stage of stages) {
      const numFollowUps = Math.floor(Math.random() * 3) + 2; // 2-4 follow-ups por estágio
      
      console.log(`Criando ${numFollowUps} follow-ups para o estágio: ${stage.name}`);
      
      for (let i = 0; i < numFollowUps; i++) {
        const clientName = generateRandomName();
        const clientId = `client_${Math.floor(Math.random() * 1000) + 1}`;
        const email = generateRandomEmail(clientName);
        const phone = generateRandomPhone();
        
        // Metadados do cliente
        const metadata = {
          name: clientName,
          email: email,
          phone: phone
        };
        
        // Criar o follow-up
        const followUp = await prisma.followUp.create({
          data: {
            campaign_id: campaign.id,
            client_id: clientId,
            current_step: Math.floor(Math.random() * 3), // 0-2 steps aleatório
            current_stage_id: stage.id,
            status: "active",
            is_responsive: Math.random() > 0.7, // 30% de chance de ser responsivo
            metadata: JSON.stringify(metadata),
            started_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Até 7 dias atrás
            next_message_at: new Date(Date.now() + Math.random() * 24 * 60 * 60 * 1000) // Até 24h no futuro
          }
        });
        
        // Criar uma mensagem de exemplo
        await prisma.followUpMessage.create({
          data: {
            follow_up_id: followUp.id,
            step: 0,
            funnel_stage: stage.name,
            content: `Olá ${clientName}! Essa é uma mensagem de exemplo para o estágio ${stage.name}.`,
            template_name: `exemplo_${stage.order}`,
            category: "Utility",
            sent_at: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // Até 24h atrás
            delivered: true,
            delivered_at: new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000) // Até 12h atrás
          }
        });
        
        console.log(`Follow-up criado para ${clientName} (${clientId})`);
      }
    }
    
    console.log("Processo concluído com sucesso!");
    
  } catch (error) {
    console.error("Erro durante a criação dos exemplos:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createSampleFollowUps()
  .then(() => console.log("Script finalizado."))
  .catch(e => console.error("Erro no script:", e));