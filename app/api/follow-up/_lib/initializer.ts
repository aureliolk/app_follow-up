// app/api/follow-up/_lib/initializer.ts
import { prisma } from '@/lib/db';
import { processFollowUpSteps } from './manager';
import { setMessageProcessor } from './scheduler';
import axios from 'axios';

/**
 * Inicializa a configuração do sistema de follow-up
 */
export function initializeFollowUpSystem() {
  // Configurar o processador de mensagens para a API Lumibot
  setMessageProcessor({
    process: async (message) => {
      try {
        // Configurações fixas para a API
        const accountId = 10;
        const conversationId = message.clientId || 3;
        const apiToken = 'Z41o5FJFVEdZJjQaqDz6pYC7';
        
        // Fazer a requisição POST para a API usando axios
        const response = await axios.post(
          `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
          {
            'content': message.message,
            'message_type': 'outgoing'
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'api_access_token': apiToken
            }
          }
        );
        
        console.log(`Mensagem enviada com sucesso para cliente ${message.clientId}`);
        return true;
      } catch (error) {
        console.error(`Erro ao enviar mensagem para a API Lumibot:`, error);
        return false;
      }
    }
  });
  
  console.log("Sistema de follow-up inicializado com integração da API Lumibot.");
}

/**
 * Verifica se uma campanha pertence a um workspace específico
 */
export async function isCampaignInWorkspace(
  campaignId: string, 
  workspaceId: string
): Promise<boolean> {
  const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findUnique({
    where: {
      workspace_id_campaign_id: {
        workspace_id: workspaceId,
        campaign_id: campaignId
      }
    }
  });
  
  return !!campaignBelongsToWorkspace;
}

/**
 * Busca uma campanha ativa para um workspace
 */
export async function findActiveCampaignForWorkspace(
  workspaceId: string
): Promise<string | null> {
  // Buscar IDs de campanhas associadas ao workspace
  const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
    where: { workspace_id: workspaceId },
    select: { campaign_id: true }
  });
  
  if (workspaceCampaigns.length === 0) {
    return null;
  }
  
  const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);
  
  // Buscar uma campanha ativa entre as campanhas do workspace
  const defaultCampaign = await prisma.followUpCampaign.findFirst({
    where: {
      id: { in: campaignIds },
      active: true
    },
    orderBy: { created_at: 'desc' }
  });
  
  return defaultCampaign?.id || null;
}

/**
 * Busca um follow-up ativo para um cliente e campanha específicos
 */
export async function findActiveFollowUp(
  clientId: string, 
  campaignId: string
): Promise<any | null> {
  return await prisma.followUp.findFirst({
    where: {
      client_id: clientId,
      campaign_id: campaignId,
      status: { in: ['active', 'paused'] }
    }
  });
}

/**
 * Inicia um novo follow-up
 */
export async function initializeNewFollowUp(
  clientId: string,
  campaignId: string,
  workspaceId?: string | null,
  metadata?: any
): Promise<any> {
  // Usar transação para garantir consistência
  return await prisma.$transaction(async (tx) => {
    // 1. Carregar a campanha com seu primeiro estágio
    const campaign = await tx.followUpCampaign.findUnique({
      where: { id: campaignId },
      include: {
        stages: {
          orderBy: {
            order: 'asc'
          },
          take: 1 // Pegar o primeiro estágio
        }
      }
    });

    if (!campaign) {
      throw new Error("Campanha não encontrada");
    }

    // 2. Obter o primeiro estágio do funil
    const initialStageId = campaign.stages.length > 0 ? campaign.stages[0].id : null;

    // 3. Preparar metadados
    let metadataObj = metadata || {};
    if (workspaceId) {
      metadataObj = {
        ...metadataObj,
        workspace_id: workspaceId
      };
    }

    // 4. Criar o novo follow-up
    const newFollowUp = await tx.followUp.create({
      data: {
        campaign_id: campaignId,
        client_id: clientId,
        status: "active",
        current_step: 0,
        current_stage_id: initialStageId,
        started_at: new Date(),
        next_message_at: new Date(), // Inicia imediatamente
        is_responsive: false,
        metadata: Object.keys(metadataObj).length > 0 
          ? JSON.stringify(metadataObj) 
          : null,
      }
    });

    return newFollowUp;
  });
}

/**
 * Busca campanhas de follow-up com contagem de passos
 */
export async function getCampaignsWithCounts(
  workspaceId?: string | null,
  activeOnly: boolean = false
): Promise<any[]> {
  // 1. Construir a condição de busca
  const where: any = activeOnly ? { active: true } : {};
  
  // 2. Adicionar filtro por workspace
  if (workspaceId) {
    // Buscar IDs de campanhas associadas ao workspace
    const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
      where: { workspace_id: workspaceId },
      select: { campaign_id: true }
    });
    
    if (workspaceCampaigns.length === 0) {
      return [];
    }
    
    const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);
    where.id = { in: campaignIds };
  }
  
  // 3. Buscar campanhas
  const campaigns = await prisma.followUpCampaign.findMany({
    where,
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      active: true,
      created_at: true,
    }
  });
  
  // 4. Adicionar contagens para cada campanha
  return await Promise.all(campaigns.map(async (campaign) => {
    // Contar passos da campanha
    const stepsCount = await prisma.followUpStep.count({
      where: { campaign_id: campaign.id }
    });
    
    // Contar follow-ups ativos
    const activeFollowUps = await prisma.followUp.count({
      where: {
        campaign_id: campaign.id,
        status: 'active'
      }
    });
    
    return {
      ...campaign,
      stepsCount,
      activeFollowUps
    };
  }));
}

/**
 * Busca os detalhes de uma campanha específica com seus estágios e passos
 */
export async function getCampaignDetails(
  campaignId: string
): Promise<any> {
  // Buscar a campanha com seus relacionamentos
  const campaign = await prisma.followUpCampaign.findUnique({
    where: { id: campaignId },
    include: {
      stages: {
        select: {
          id: true,
          name: true,
          order: true,
          description: true
        },
        orderBy: {
          order: 'asc'
        }
      },
      campaign_steps: {
        include: {
          funnel_stage: true
        }
      }
    }
  });
  
  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }
  
  // Mapear os passos e incluir informações da etapa
  const mappedSteps = campaign.campaign_steps.map(step => ({
    id: step.id,
    stage_id: step.funnel_stage_id,
    stage_name: step.funnel_stage.name,
    template_name: step.template_name,
    wait_time: step.wait_time,
    message: step.message_content,
    category: step.message_category || 'Utility',
    auto_respond: step.auto_respond,
    stage_order: step.funnel_stage.order,
    wait_time_ms: step.wait_time_ms
  }));
  
  // Ordenar os passos primeiro pela ordem da etapa e depois pelo tempo de espera
  const formattedSteps = mappedSteps.sort((a, b) => {
    if (a.stage_order !== b.stage_order) {
      return a.stage_order - b.stage_order;
    }
    return a.wait_time_ms - b.wait_time_ms;
  });
  
  // Estruturar a resposta
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    active: campaign.active,
    steps: formattedSteps,
    stages: campaign.stages
  };
}

/**
 * Função auxiliar para calcular o tempo de espera em milissegundos
 */
export function calculateWaitTimeMs(waitTime: string): number {
  if (!waitTime) return 30 * 60 * 1000; // Padrão: 30 minutos
  
  // Regex para extrair números e unidades
  const regex = /(\d+)\s*(min|minutos?|h|horas?|dias?)/i;
  const match = waitTime.match(regex);
  
  if (!match) {
    // Formato abreviado: "30m", "2h", "1d"
    const shortMatch = waitTime.match(/^(\d+)([mhd])$/i);
    if (shortMatch) {
      const value = parseInt(shortMatch[1]);
      const unit = shortMatch[2].toLowerCase();
      
      if (unit === 'm') return value * 60 * 1000;
      if (unit === 'h') return value * 60 * 60 * 1000;
      if (unit === 'd') return value * 24 * 60 * 60 * 1000;
    }
    
    // Se só tiver números, assume minutos
    if (/^\d+$/.test(waitTime.trim())) {
      return parseInt(waitTime.trim()) * 60 * 1000;
    }
    
    return 30 * 60 * 1000; // Default 30 minutos
  }
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit.startsWith('min')) {
    return value * 60 * 1000;
  } else if (unit.startsWith('h')) {
    return value * 60 * 60 * 1000;
  } else if (unit.startsWith('d')) {
    return value * 24 * 60 * 60 * 1000;
  }
  
  return 30 * 60 * 1000;
}

// Executar a inicialização se estivermos no lado do servidor
if (typeof window === 'undefined') {
  initializeFollowUpSystem();
}

export default initializeFollowUpSystem;