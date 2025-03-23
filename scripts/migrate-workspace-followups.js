// migrate-workspace-followups.js
// Script para migrar follow-ups existentes para workspaces

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateFollowUpsToWorkspaces() {
  console.log('Iniciando migração de follow-ups para workspaces...');
  
  try {
    // 1. Buscar todos os workspaces
    const workspaces = await prisma.workspace.findMany({
      include: {
        owner: true
      }
    });
    
    if (workspaces.length === 0) {
      console.log('Nenhum workspace encontrado. Criando workspace padrão...');
      
      // Criar um workspace padrão se não houver nenhum
      const defaultWorkspace = await prisma.workspace.create({
        data: {
          name: 'Workspace Padrão',
          slug: 'workspace-padrao',
          owner: {
            connect: {
              id: '1' // ID do primeiro usuário (ajuste conforme necessário)
            }
          }
        }
      });
      
      workspaces.push(defaultWorkspace);
    }
    
    console.log(`Encontrados ${workspaces.length} workspaces`);
    
    // 2. Buscar todas as campanhas que não estão associadas a workspaces
    const campaigns = await prisma.followUpCampaign.findMany({
      include: {
        follow_ups: true
      }
    });
    
    console.log(`Encontradas ${campaigns.length} campanhas`);
    
    // 3. Para cada campanha, encontrar ou criar associação com workspace
    let associatedCampaigns = 0;
    let associatedFollowUps = 0;
    
    const defaultWorkspace = workspaces[0]; // Usar o primeiro workspace como padrão
    
    for (const campaign of campaigns) {
      // Verificar se a campanha já está associada a algum workspace
      const existingAssociation = await prisma.workspaceFollowUpCampaign.findFirst({
        where: {
          campaign_id: campaign.id
        }
      });
      
      if (!existingAssociation) {
        // Associar a campanha ao workspace padrão
        await prisma.workspaceFollowUpCampaign.create({
          data: {
            workspace_id: defaultWorkspace.id,
            campaign_id: campaign.id
          }
        });
        
        associatedCampaigns++;
        console.log(`Campanha ${campaign.id} (${campaign.name}) associada ao workspace ${defaultWorkspace.name}`);
        
        // 4. Atualizar metadados de follow-ups para incluir o workspace_id
        for (const followUp of campaign.follow_ups) {
          // Verificar se já tem metadados
          let metadata = followUp.metadata ? JSON.parse(followUp.metadata) : {};
          
          // Adicionar workspace_id aos metadados
          metadata.workspace_id = defaultWorkspace.id;
          
          // Atualizar follow-up
          await prisma.followUp.update({
            where: { id: followUp.id },
            data: { metadata: JSON.stringify(metadata) }
          });
          
          associatedFollowUps++;
        }
      }
    }
    
    console.log(`Migração concluída!`);
    console.log(`${associatedCampaigns} campanhas associadas a workspaces`);
    console.log(`${associatedFollowUps} follow-ups atualizados com workspace_id`);
    
  } catch (error) {
    console.error('Erro na migração:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar a migração
migrateFollowUpsToWorkspaces()
  .then(() => {
    console.log('Processo de migração finalizado com sucesso.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Erro no processo de migração:', err);
    process.exit(1);
  });