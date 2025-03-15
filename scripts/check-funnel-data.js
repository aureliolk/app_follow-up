// scripts/check-funnel-data.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkFunnelData() {
  try {
    console.log('Verificando etapas do funil:');
    const stages = await prisma.followUpFunnelStage.findMany({
      orderBy: { order: 'asc' }
    });
    
    console.log(`Encontradas ${stages.length} etapas do funil:`);
    for (const stage of stages) {
      console.log(`- ${stage.name} (ID: ${stage.id}, Ordem: ${stage.order})`);
    }
    
    console.log('\nVerificando passos de cada etapa:');
    for (const stage of stages) {
      const steps = await prisma.followUpStep.findMany({
        where: { funnel_stage_id: stage.id }
      });
      
      console.log(`\nEtapa "${stage.name}" tem ${steps.length} passos:`);
      for (const step of steps) {
        console.log(`  - ${step.name}`);
        console.log(`    Template: ${step.template_name}`);
        console.log(`    Tempo: ${step.wait_time}`);
        console.log(`    Mensagem: ${step.message_content.substring(0, 50)}...`);
      }
    }
    
    console.log('\nVerificando campanhas:');
    const campaigns = await prisma.followUpCampaign.findMany({
      include: { stages: true }
    });
    
    console.log(`Encontradas ${campaigns.length} campanhas:`);
    for (const campaign of campaigns) {
      console.log(`- ${campaign.name} (ID: ${campaign.id})`);
      console.log(`  Etapas associadas: ${campaign.stages.length}`);
      
      // Analisar os steps da campanha
      let stepsData;
      try {
        if (typeof campaign.steps === 'string') {
          stepsData = JSON.parse(campaign.steps);
        } else {
          stepsData = campaign.steps;
        }
        
        console.log(`  Total de steps: ${Array.isArray(stepsData) ? stepsData.length : 'Não é um array'}`);
        
        if (Array.isArray(stepsData) && stepsData.length > 0) {
          console.log('  Exemplo de step:');
          console.log(JSON.stringify(stepsData[0], null, 2));
        }
      } catch (e) {
        console.error(`  Erro ao analisar steps: ${e.message}`);
      }
    }
    
  } catch (error) {
    console.error('Erro durante a verificação:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar a verificação
checkFunnelData()
  .then(() => console.log('\nVerificação concluída.'))
  .catch(error => console.error('\nErro na verificação:', error));