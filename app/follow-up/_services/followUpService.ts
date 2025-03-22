// app/follow-up/_services/followUpService.ts
import axios from 'axios';
import { FollowUp, Campaign, CampaignStep, FunnelStage, FunnelStep } from '../_types';

// Cache simples para campanhas
const campaignStepsCache: Record<string, {data: any[], timestamp: number}> = {};
const CACHE_TTL = 60000; // 1 minuto de TTL para o cache

export const followUpService = {
  // Função para buscar follow-ups
  async getFollowUps(status?: string): Promise<FollowUp[]> {
    try {
      const response = await axios.get('/api/follow-up', {
        params: status ? { status } : undefined
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch follow-ups');
      }

      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
      throw error;
    }
  },

  // Função para buscar campanhas
  async getCampaigns(): Promise<Campaign[]> {
    try {
      const response = await axios.get('/api/follow-up/campaigns');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch campaigns');
      }
      console.log('Get Campaings', response.data.data)
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }
  },

  // Função para buscar uma campanha específica
  async getCampaign(campaignId: string): Promise<Campaign> {
    try {
      // Adicionar timestamp e cache buster para forçar atualização
      const timestamp = new Date().getTime();
      const cacheBuster = typeof window !== 'undefined' ? window.sessionStorage.getItem('cache_bust') || timestamp : timestamp;
      
      console.log(`🔍 Buscando campanha ${campaignId} com dados relacionais (t=${timestamp})`);
      
      // Configuração para forçar a não utilização de cache
      const config = {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      };
      
      const response = await axios.get(
        `/api/follow-up/campaigns/${campaignId}?t=${timestamp}&cb=${cacheBuster}`, 
        config
      );

      if (!response.data.success) {
        console.error(`❌ Erro ao buscar campanha: ${response.data.error}`);
        throw new Error(response.data.error || 'Failed to fetch campaign');
      }

      console.log(`✅ Campanha ${campaignId} carregada com sucesso`);
      
      // Os dados já vêm formatados da API
      const campaignData = response.data.data;
      
      // Verificar apenas se steps é um array
      const steps = Array.isArray(campaignData.steps) ? campaignData.steps : [];
      
      // Retornar com os dados normalizados
      return {
        ...campaignData,
        steps
      };
    } catch (error) {
      console.error('Error fetching campaign:', error);
      throw error;
    }
  },

  // Função para buscar estágios do funil
  async getFunnelStages(campaignId?: string): Promise<FunnelStage[]> {
    try {
      // Adicionar timestamp para evitar cache
      const timestamp = new Date().getTime();
      const url = campaignId 
        ? `/api/follow-up/funnel-stages?campaignId=${campaignId}&t=${timestamp}` 
        : `/api/follow-up/funnel-stages?t=${timestamp}`;
      
      const response = await axios.get(url);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch funnel stages');
      }

      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching funnel stages:', error);
      throw error;
    }
  },

  // Função para criar um novo estágio do funil
  async createFunnelStage(name: string, description?: string, order?: number, campaignId?: string): Promise<FunnelStage> {
    try {
      const response = await axios.post('/api/follow-up/funnel-stages', {
        name,
        description,
        order,
        campaignId
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create funnel stage');
      }
      
      // Limpar cache após modificar dados
      this.clearCampaignCache();

      return response.data.data;
    } catch (error) {
      console.error('Error creating funnel stage:', error);
      throw error;
    }
  },

  // Função para atualizar um estágio do funil
  async updateFunnelStage(id: string, data: { name: string, description?: string | null, order?: number, campaignId?: string }): Promise<FunnelStage> {
    try {
      // Adicionar timestamp para evitar cache
      const timestamp = new Date().getTime();
      
      console.log('🔄 Enviando dados para API:', { id, ...data, t: timestamp });

      // Criar payload com parâmetros necessários
      const payload = {
        id,
        name: data.name,
        description: data.description,
        order: data.order,
        campaignId: data.campaignId,
        _t: timestamp // Adicionar timestamp para evitar cache
      };
      
      console.log('📤 Enviando payload completo:', JSON.stringify(payload));

      const response = await axios.put('/api/follow-up/funnel-stages', payload, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      console.log('📥 Resposta da API:', response.data);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update funnel stage');
      }
      
      // Limpar cache após modificar dados
      this.clearCampaignCache();

      return response.data.data;
    } catch (error: any) {
      console.error('Error updating funnel stage:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update funnel stage';
      throw new Error(errorMessage);
    }
  },

  // Função para excluir um estágio do funil
  async deleteFunnelStage(id: string): Promise<boolean> {
    try {
      const response = await axios.delete(`/api/follow-up/funnel-stages?id=${id}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete funnel stage');
      }
      
      // Limpar cache após modificar dados
      this.clearCampaignCache();

      return true;
    } catch (error) {
      console.error(`Erro ao excluir estágio do funil ${id}:`, error);
      throw error;
    }
  },

  // Função para buscar passos de um estágio específico
  async getFunnelSteps(stageId: string): Promise<FunnelStep[]> {
    try {
      const response = await axios.get(`/api/follow-up/funnel-steps?stageId=${stageId}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch funnel steps');
      }

      const steps = response.data.data || [];
      return steps;
    } catch (error) {
      console.error(`Error fetching steps for stage ${stageId}:`, error);
      throw error;
    }
  },

  // Função para atualizar um passo específico
  async updateStep(stepId: string, data: Partial<FunnelStep>): Promise<any> {
    try {
      console.log('Atualizando passo:', stepId, JSON.stringify(data, null, 2));
      
      // No frontend, temos os dados no formato:
      // id, stage_id, stage_name, template_name, wait_time, message, category, auto_respond
      
      // Manter o formato original do frontend para a nova API
      const requestData = {
        id: stepId,
        stage_id: data.stage_id,
        stage_name: data.stage_name,
        template_name: data.template_name,
        wait_time: data.wait_time,
        message: data.message,
        category: data.category,
        auto_respond: data.auto_respond
      };
      
      console.log('Enviando dados para atualização:', JSON.stringify(requestData, null, 2));
      
      // Usar a rota alternativa que aceita o formato do frontend
      const response = await axios.put('/api/follow-up/steps', requestData);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update step');
      }
      
      this.clearCampaignCache();
      
      return response.data;
    } catch (error) {
      console.error('Error updating step:', error);
      throw error;
    }
  },

  // NOVA FUNÇÃO: Excluir um passo específico
  async deleteStep(stepId: string): Promise<any> {
    try {
      const response = await axios.delete(`/api/follow-up/funnel-steps?id=${stepId}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete step');
      }
      
      this.clearCampaignCache();

      return response.data;
    } catch (error) {
      console.error('Error deleting step:', error);
      throw error;
    }
  },

  // Função unificada otimizada para buscar passos de campanha usando o relacionamento campaign_steps
  async getCampaignSteps(campaignId?: string): Promise<CampaignStep[]> {
    if (!campaignId) {
      return [];
    }
    
    const cacheKey = `campaign-steps-${campaignId}`;
    const cachedData = campaignStepsCache[cacheKey];
    const now = Date.now();
    
    if (cachedData && (now - cachedData.timestamp < CACHE_TTL)) {
      return cachedData.data;
    }
    
    try {
      // Forçar busca direto do servidor sem usar cache
      const campaign: any = await this.getCampaign(campaignId);
      const campaignSteps: CampaignStep[] = [];
      
      // Usar diretamente os steps da resposta da API (já formatados)
      if (campaign && Array.isArray(campaign.steps)) {
        const formattedCampaignSteps = campaign.steps.map((step: any) => ({
          id: step.id,
          stage_name: step.stage_name || 'Sem nome',
          wait_time: step.wait_time || '30m',
          template_name: step.template_name || '',
          message: step.message || '',
          stage_id: step.stage_id || '',
          stage_order: step.order || 0,
          category: step.category || 'Utility',
          auto_respond: step.auto_respond !== undefined ? step.auto_respond : true
        }));
        
        campaignSteps.push(...formattedCampaignSteps);
      }
      
      campaignStepsCache[cacheKey] = {
        data: campaignSteps,
        timestamp: now
      };
      
      return campaignSteps;
    } catch (error) {
      console.error('Error fetching campaign steps:', error);
      throw error;
    }
  },
  
  // Método para limpar o cache quando necessário (após atualizações)
  clearCampaignCache(campaignId?: string) {
    console.log("⚡ LIMPANDO CACHE", campaignId || "todos");
    
    // Limpar cache local
    if (campaignId) {
      delete campaignStepsCache[`campaign-steps-${campaignId}`];
    } else {
      Object.keys(campaignStepsCache).forEach(key => {
        delete campaignStepsCache[key];
      });
    }
    
    // Forçar recarregamento de recursos
    if (typeof window !== 'undefined') {
      console.log("🔄 Forçando atualização do cache do navegador");
      // Adicionar timestamp para forçar recarregamento de recursos em cache
      const timestamp = new Date().getTime();
      window.sessionStorage.setItem('cache_bust', timestamp.toString());
    }
  },

  // Função para cancelar um follow-up
  async cancelFollowUp(followUpId: string): Promise<any> {
    try {
      const response = await axios.post('/api/follow-up/cancel', {
        followUpId
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to cancel follow-up');
      }

      return response.data;
    } catch (error) {
      console.error('Error canceling follow-up:', error);
      throw error;
    }
  },

  // Função para remover um cliente
  async removeClient(clientId: string): Promise<any> {
    try {
      const response = await axios.post('/api/follow-up/remove-client', {
        clientId
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to remove client');
      }

      return response.data;
    } catch (error) {
      console.error('Error removing client:', error);
      throw error;
    }
  },

  // Função para mover um cliente para outra etapa do funil
  async moveClientToStage(followUpId: string, stageId: string): Promise<any> {
    try {
      const response = await axios.put(`/api/follow-up/${followUpId}/move-stage`, {
        stageId
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to move client to stage');
      }
      
      // Limpar o cache para garantir que as alterações sejam refletidas
      this.clearCampaignCache();
      
      // Aguardar um pequeno intervalo para permitir que o banco de dados seja atualizado
      await new Promise(resolve => setTimeout(resolve, 100));

      return response.data;
    } catch (error) {
      console.error('Error moving client to stage:', error);
      throw error;
    }
  },

  // Função para criar um novo follow-up
  async createFollowUp(clientId: string, campaignId: string): Promise<any> {
    try {
      const response = await axios.post('/api/follow-up', {
        clientId,
        campaignId
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create follow-up');
      }

      return response.data;
    } catch (error) {
      console.error('Error creating follow-up:', error);
      throw error;
    }
  },

  // Função para atualizar uma campanha
  async updateCampaign(campaignId: string, formData: any): Promise<any> {
    try {
      // Preparar os dados - garantir que steps tem o formato correto
      const preparedData = { ...formData };
      
      // Se os steps forem fornecidos como array, serializá-los
      if (preparedData.steps && Array.isArray(preparedData.steps)) {
        // Garantir que cada step tenha todos os campos necessários no formato padrão
        const formattedSteps = preparedData.steps.map(step => ({
          // Usar apenas campos do schema.prisma
          id: step.id || undefined,
          stage_id: step.stage_id || '',
          stage_name: step.stage_name || '',
          template_name: step.template_name || '',
          wait_time: step.wait_time || '30m',
          message: step.message || '',
          category: step.category || 'Utility',
          auto_respond: step.auto_respond !== undefined ? step.auto_respond : true
        }));
        
        // Atribuir os steps formatados
        preparedData.steps = formattedSteps;
      }
      
      console.log('Enviando dados formatados para atualização:', JSON.stringify(preparedData, null, 2));
      
      const response = await axios.put(`/api/follow-up/campaigns/${campaignId}`, preparedData);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update campaign');
      }
      
      this.clearCampaignCache(campaignId);

      return response.data;
    } catch (error) {
      console.error('Error updating campaign:', error);
      throw error;
    }
  },

  // Função para criar um novo passo
  async createStep(data: any): Promise<any> {
    try {
      console.log('Criando novo passo com dados:', data);
      // Verificar se o passo contém campaign_id
      if (!data.campaign_id && data.funnel_stage_id) {
        console.log('Adicionando campaign_id ao passo...');
        // Buscar o estágio para determinar a campanha
        const stages = await this.getFunnelStages();
        const stage = stages.find(s => s.id === data.funnel_stage_id);
        if (stage && stage.campaignId) {
          data.campaign_id = stage.campaignId;
          console.log(`Adicionado campaign_id: ${data.campaign_id} ao passo`);
        }
      }
      
      const response = await axios.post('/api/follow-up/funnel-steps', data);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create step');
      }
      
      this.clearCampaignCache();

      return response.data;
    } catch (error) {
      console.error('Error creating step:', error);
      throw error;
    }
  }
};

export default followUpService;