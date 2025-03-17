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

      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }
  },

  // Função para buscar uma campanha específica
  async getCampaign(campaignId: string): Promise<Campaign> {
    try {
      const response = await axios.get(`/api/follow-up/campaigns/${campaignId}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch campaign');
      }

      const campaignData = response.data.data;

      // Processar os steps se estiverem em formato string
      let steps = [];
      if (typeof campaignData.steps === 'string') {
        try {
          steps = JSON.parse(campaignData.steps);
        } catch (e) {
          console.error('Error parsing steps:', e);
          steps = [];
        }
      } else {
        steps = campaignData.steps || [];
      }

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
  async getFunnelStages(): Promise<FunnelStage[]> {
    try {
      const response = await axios.get('/api/follow-up/funnel-stages');

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
  async createFunnelStage(name: string, description?: string, order?: number): Promise<FunnelStage> {
    try {
      const response = await axios.post('/api/follow-up/funnel-stages', {
        name,
        description,
        order
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create funnel stage');
      }

      return response.data.data;
    } catch (error) {
      console.error('Error creating funnel stage:', error);
      throw error;
    }
  },

  // Função para atualizar um estágio do funil
  async updateFunnelStage(id: string, data: { name: string, description?: string, order?: number }): Promise<FunnelStage> {
    try {
      const response = await axios.put('/api/follow-up/funnel-stages', {
        id,
        ...data
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update funnel stage');
      }

      return response.data.data;
    } catch (error) {
      console.error('Error updating funnel stage:', error);
      throw error;
    }
  },

  // Função para excluir um estágio do funil
  async deleteFunnelStage(id: string): Promise<boolean> {
    try {
      const response = await axios.delete(`/api/follow-up/funnel-stages?id=${id}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete funnel stage');
      }

      return true;
    } catch (error) {
      console.error('Error deleting funnel stage:', error);
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

      return response.data.data || [];
    } catch (error) {
      console.error(`Error fetching steps for stage ${stageId}:`, error);
      throw error;
    }
  },

  // NOVA FUNÇÃO: Atualizar um passo específico
  async updateStep(stepId: string, data: Partial<FunnelStep>): Promise<any> {
    try {
      console.log(`Iniciando atualização do passo ${stepId} com dados:`, data);

      const response = await axios.put('/api/follow-up/funnel-steps', {
        id: stepId,
        ...data
      });

      console.log('Resposta da API de atualização de passo:', response.data);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update step');
      }
      
      // Limpar o cache completo, já que não sabemos qual campanha usa este passo
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
      console.log(`Iniciando exclusão do passo ${stepId}`);

      const response = await axios.delete(`/api/follow-up/funnel-steps?id=${stepId}`);

      console.log('Resposta da API de exclusão de passo:', response.data);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete step');
      }
      
      // Limpar o cache completo, já que não sabemos qual campanha usa este passo
      this.clearCampaignCache();

      return response.data;
    } catch (error) {
      console.error('Error deleting step:', error);
      throw error;
    }
  },

  // Função unificada otimizada para buscar passos de campanha
  async getCampaignSteps(campaignId?: string): Promise<CampaignStep[]> {
    if (!campaignId) {
      return [];
    }
    
    // Verificar se temos dados em cache válidos
    const cacheKey = `campaign-steps-${campaignId}`;
    const cachedData = campaignStepsCache[cacheKey];
    const now = Date.now();
    
    if (cachedData && (now - cachedData.timestamp < CACHE_TTL)) {
      console.log(`Usando dados em cache para a campanha ${campaignId}`);
      return cachedData.data;
    }
    
    try {
      console.log(`Buscando dados da campanha ${campaignId} do banco de dados`);
      
      // 1. Primeiro, buscar todos os estágios do funil
      const funnelStages = await this.getFunnelStages();

      // 2. Para cada estágio, buscar os passos associados
      const allSteps: CampaignStep[] = [];

      for (const stage of funnelStages) {
        try {
          const steps = await this.getFunnelSteps(stage.id);

          // Mapear passos para o formato esperado
          const formattedSteps = steps.map((step: FunnelStep) => ({
            id: step.id,
            etapa: stage.name,
            tempo_de_espera: step.wait_time,
            template_name: step.template_name,
            message: step.message_content,
            stage_id: stage.id,
            stage_name: stage.name,
            stage_order: stage.order
          }));

          allSteps.push(...formattedSteps);
        } catch (error) {
          console.error(`Error processing steps for stage ${stage.name}:`, error);
        }
      }

      // 3. Se não foram encontrados passos ou se um ID de campanha foi fornecido,
      // buscar dados da campanha
      if (allSteps.length === 0 && campaignId) {
        try {
          const campaign: any = await this.getCampaign(campaignId);

          if (campaign && (campaign.steps?.length > 0)) {
            // Mapear para o formato esperado
            const formattedCampaignSteps = campaign.steps.map((step: any, index: number) => {
              if (step.stage_name) {
                return {
                  id: `campaign-step-${index}`,
                  etapa: step.stage_name,
                  tempo_de_espera: step.wait_time || '',
                  template_name: step.template_name || '',
                  message: step.message || '',
                  stage_name: step.stage_name,
                  stage_order: step.stage_order
                };
              } else if (step.etapa) {
                return {
                  id: `campaign-step-${index}`,
                  etapa: step.etapa,
                  tempo_de_espera: step.tempo_de_espera || '',
                  template_name: step.nome_template || '',
                  message: step.mensagem || '',
                  stage_name: step.etapa,
                  stage_order: index
                };
              }
              return null;
            }).filter(Boolean);

            if (formattedCampaignSteps.length > 0) {
              // Se já temos alguns passos do banco de dados, apenas adicione os que faltam
              if (allSteps.length > 0) {
                // Verificar quais etapas já existem
                const existingStageNames = new Set(allSteps.map(step => step.etapa));
                const newSteps = formattedCampaignSteps.filter((step: any) => !existingStageNames.has(step.etapa));
                allSteps.push(...newSteps);
              } else {
                allSteps.push(...formattedCampaignSteps);
              }
            }
          }
        } catch (campaignError) {
          console.error('Error fetching campaign data:', campaignError);
        }
      }
      
      // Armazenar os dados em cache
      campaignStepsCache[cacheKey] = {
        data: allSteps,
        timestamp: now
      };
      
      return allSteps;
    } catch (error) {
      console.error('Error fetching campaign steps:', error);
      throw error;
    }
  },
  
  // Método para limpar o cache quando necessário (após atualizações)
  clearCampaignCache(campaignId?: string) {
    if (campaignId) {
      // Limpa apenas a campanha específica
      delete campaignStepsCache[`campaign-steps-${campaignId}`];
    } else {
      // Limpa todo o cache
      Object.keys(campaignStepsCache).forEach(key => {
        delete campaignStepsCache[key];
      });
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
      const response = await axios.put(`/api/follow-up/campaigns/${campaignId}`, formData);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update campaign');
      }
      
      // Limpar o cache para esta campanha após atualização
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

      const response = await axios.post('/api/follow-up/funnel-steps', data);

      console.log('Resposta da API de criação de passo:', response.data);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create step');
      }
      
      // Limpar o cache, já que não sabemos qual campanha pode usar este passo
      this.clearCampaignCache();

      return response.data;
    } catch (error) {
      console.error('Error creating step:', error);
      throw error;
    }
  }
};

export default followUpService;