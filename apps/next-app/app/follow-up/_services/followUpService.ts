// app/follow-up/_services/followUpService.ts
import axios from 'axios';
import { prisma } from '@meuprojeto/shared-lib/db';
import { FollowUp, Campaign, CampaignStep, FunnelStage, FunnelStep } from '@/app/types';

// Cache simples para campanhas
const campaignStepsCache: Record<string, { data: any[], timestamp: number }> = {};
const CACHE_TTL = 60000; // 1 minuto de TTL para o cache

// Obter workspaceId ativo da sessionStorage
function getActiveWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  
  return sessionStorage.getItem('activeWorkspaceId') || 
         localStorage.getItem('activeWorkspaceId');
}

export const followUpService = {
  // Função para buscar follow-ups
  async getFollowUps(status?: string, workspaceId?: string): Promise<FollowUp[]> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const params: Record<string, string | undefined> = { 
        status 
      };
      
      if (wsId) {
        params.workspaceId = wsId;
      }
      
      const response = await axios.get('/api/follow-up', { params });

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
  async getCampaigns(workspaceId?: string): Promise<Campaign[]> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const params: Record<string, string | undefined> = {};
      if (wsId) {
        params.workspaceId = wsId;
      }
      
      const response = await axios.get('/api/follow-up/campaigns', { params });

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
  async getCampaign(campaignId: string, workspaceId?: string): Promise<Campaign> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
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
        },
        params: {
          t: timestamp,
          cb: cacheBuster,
          workspaceId: wsId
        }
      };

      const response = await axios.get(
        `/api/follow-up/campaigns/${campaignId}`,
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
  async getFunnelStages(campaignId?: string, workspaceId?: string): Promise<FunnelStage[]> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      // Adicionar timestamp para evitar cache
      const timestamp = new Date().getTime();
      
      // Parâmetros da requisição
      const params: Record<string, string> = { t: timestamp.toString() };
      
      if (campaignId) params.campaignId = campaignId;
      if (wsId) params.workspaceId = wsId;
      
      // Construir URL com parâmetros
      const response = await axios.get('/api/follow-up/funnel-stages', { params });

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
  async createFunnelStage(name: string, description?: string, order?: number, campaignId?: string, workspaceId?: string): Promise<FunnelStage> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const response = await axios.post('/api/follow-up/funnel-stages', {
        name,
        description,
        order,
        campaignId,
        workspaceId: wsId
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
  async updateFunnelStage(id: string, data: { name: string, description?: string | null, order?: number, campaignId?: string, workspaceId?: string }): Promise<FunnelStage> {
    try {
      // Validação de dados básica
      if (!id || !data.name) {
        throw new Error('ID e nome são campos obrigatórios');
      }
      
      // Obter workspace do contexto se não fornecido
      if (!data.workspaceId) {
        data.workspaceId = getActiveWorkspaceId() || undefined;
      }

      console.log('🔄 Atualizando estágio do funil:', { id, ...data });

      // Adicionar timestamp para evitar cache
      const timestamp = new Date().getTime();

      // Construir payload com todos os dados necessários
      const payload = {
        id,
        name: data.name,
        description: data.description || null,
        order: data.order !== undefined ? data.order : 1,
        campaignId: data.campaignId,
        workspaceId: data.workspaceId,
        t: timestamp // Para evitar problemas de cache
      };

      console.log('📤 Payload completo:', JSON.stringify(payload, null, 2));

      // Adicionar headers específicos para garantir que não haverá problemas de cache
      const config = {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15 segundos para completar a operação
      };

      // ESTRATÉGIA 1: Tentar com método padrão
      try {
        console.log('🔄 ESTRATÉGIA 1: Enviando requisição padrão');
        const response = await axios.put('/api/follow-up/funnel-stages', payload, config);

        console.log('📥 Resposta da API:', JSON.stringify(response.data, null, 2));

        if (response.data.success) {
          // Limpar qualquer cache que possa afetar a visualização dos dados
          this.clearCampaignCache();
          return response.data.data;
        } else {
          throw new Error(response.data.error || 'Falha ao atualizar estágio do funil');
        }
      } catch (error) {
        console.error('❌ ESTRATÉGIA 1 falhou:', error);

        // ESTRATÉGIA 2: Tentar com um delay e nova tentativa
        console.log('🔄 ESTRATÉGIA 2: Tentando com delay...');

        // Esperar 2 segundos antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const retryResponse = await axios.put('/api/follow-up/funnel-stages', payload, config);

          if (retryResponse.data.success) {
            console.log('✅ ESTRATÉGIA 2 bem-sucedida!');
            this.clearCampaignCache();
            return retryResponse.data.data;
          } else {
            throw new Error(retryResponse.data.error || 'Falha ao atualizar estágio do funil (retry)');
          }
        } catch (retryError) {
          console.error('❌ ESTRATÉGIA 2 falhou:', retryError);

          // ESTRATÉGIA 3: Última chance, utilizar força bruta com request direto
          console.log('🔄 ESTRATÉGIA 3: Abordagem direta, última chance...');

          // Simplificar o payload para conter apenas os dados essenciais
          const minimalPayload = {
            id,
            name: data.name,
            description: data.description || null,
            workspaceId: data.workspaceId
          };

          try {
            const lastChanceResponse = await fetch('/api/follow-up/funnel-stages', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
              },
              body: JSON.stringify({ ...minimalPayload, campaignId: data.campaignId })
            });

            if (lastChanceResponse.ok) {
              const jsonResponse = await lastChanceResponse.json();
              console.log('✅ ESTRATÉGIA 3 bem-sucedida!');
              this.clearCampaignCache();
              return jsonResponse.data;
            } else {
              throw new Error(`Código de status: ${lastChanceResponse.status}`);
            }
          } catch (lastError) {
            console.error('❌ TODAS AS ESTRATÉGIAS FALHARAM:', lastError);
            throw new Error('Falha completa ao atualizar estágio do funil após múltiplas tentativas');
          }
        }
      }
    } catch (error: any) {
      console.error('❌ ERRO FATAL AO ATUALIZAR ESTÁGIO DO FUNIL:', error);

      // Formatar mensagem de erro
      const errorMessage = error.response?.data?.error || error.message || 'Erro desconhecido ao atualizar estágio do funil';

      // Limpar cache de qualquer forma, para evitar dados inconsistentes
      this.clearCampaignCache();

      throw new Error(errorMessage);
    }
  },

  // Função para excluir um estágio do funil
  async deleteFunnelStage(id: string, workspaceId?: string): Promise<boolean> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const params: Record<string, string> = { id };
      if (wsId) params.workspaceId = wsId;
      
      const response = await axios.delete('/api/follow-up/funnel-stages', { 
        params
      });

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
  async getFunnelSteps(stageId: string, workspaceId?: string): Promise<FunnelStep[]> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const params: Record<string, string> = { stageId };
      if (wsId) params.workspaceId = wsId;
      
      const response = await axios.get('/api/follow-up/funnel-steps', { params });

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
  async updateStep(stepId: string, data: Partial<FunnelStep>, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
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
        auto_respond: data.auto_respond,
        workspaceId: wsId
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
  async deleteStep(stepId: string, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const params: Record<string, string> = { id: stepId };
      if (wsId) params.workspaceId = wsId;
      
      const response = await axios.delete('/api/follow-up/funnel-steps', { params });

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
  async getCampaignSteps(campaignId?: string, workspaceId?: string): Promise<CampaignStep[]> {
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
      const wsId = workspaceId || getActiveWorkspaceId();
      
      // Adicionar timestamp e cache buster para forçar atualização
      const timestamp = new Date().getTime();
      const cacheBuster = typeof window !== 'undefined' ?
        window.sessionStorage.getItem('cache_bust') || timestamp : timestamp;

      console.log(`Buscando campanha ${campaignId} (t=${timestamp}, cb=${cacheBuster})`);

      // Forçar carregamento sem cache
      const config = {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        params: {
          t: timestamp,
          cb: cacheBuster,
          workspaceId: wsId
        }
      };

      const response = await axios.get(
        `/api/follow-up/campaigns/${campaignId}`,
        config
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch campaign');
      }

      const campaignData = response.data.data;
      const formattedCampaignSteps = campaignData.steps || [];

      campaignStepsCache[cacheKey] = {
        data: formattedCampaignSteps,
        timestamp: now
      };

      return formattedCampaignSteps;
    } catch (error) {
      console.error('Error fetching campaign steps:', error);
      throw error;
    }
  },

  // Método para limpar o cache quando necessário (após atualizações)
  clearCampaignCache(campaignId?: string) {
    console.log(`⚡ LIMPEZA DE CACHE INICIADA - ${campaignId ? `campanha: ${campaignId}` : "todas as campanhas"}`);

    // Contador para tracking da operação
    let cacheEntriesCleared = 0;

    // 1. Limpar cache local de steps da campanha
    if (campaignId) {
      // Limpar apenas a campanha específica
      const cacheKey = `campaign-steps-${campaignId}`;
      if (campaignStepsCache[cacheKey]) {
        delete campaignStepsCache[cacheKey];
        cacheEntriesCleared++;
      }
    } else {
      // Limpar todas as entradas do cache
      cacheEntriesCleared = Object.keys(campaignStepsCache).length;

      // Resetar objeto completamente
      Object.keys(campaignStepsCache).forEach(key => {
        delete campaignStepsCache[key];
      });
    }

    // 2. Forçar recarregamento de recursos do browser
    if (typeof window !== 'undefined') {
      try {
        console.log("🔄 Limpando cache do navegador e forçando recarregamento");

        // Atualizar timestamp na sessionStorage para evitar cache
        const timestamp = new Date().getTime();
        window.sessionStorage.setItem('cache_bust', timestamp.toString());

        // Limpar localStorage específico também (se existir)
        if (campaignId) {
          const campaignCacheKey = `campaign-data-${campaignId}`;
          if (localStorage.getItem(campaignCacheKey)) {
            localStorage.removeItem(campaignCacheKey);
            cacheEntriesCleared++;
          }
        }

        // Estratégia adicional para forçar recargas
        if (typeof window.fetch === 'function') {
          // Fazer uma chamada simples às APIs para limpar qualquer cache do lado do cliente
          const purgeUrls = [
            `/api/follow-up/funnel-stages?t=${timestamp}`,
            `/api/follow-up/campaigns?t=${timestamp}`
          ];

          if (campaignId) {
            purgeUrls.push(`/api/follow-up/campaigns/${campaignId}?t=${timestamp}`);
          }

          // Executar fetches silenciosos para limpar cache
          purgeUrls.forEach(url => {
            fetch(url, {
              method: 'HEAD',
              headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            }).catch(e => { }); // Ignorar erros
          });
        }
      } catch (cacheError) {
        console.warn("⚠️ Erro ao limpar cache do navegador:", cacheError);
        // Continuar mesmo se houver erro
      }
    }

    console.log(`✅ LIMPEZA DE CACHE CONCLUÍDA - ${cacheEntriesCleared} entradas removidas`);
  },

  // Função para cancelar um follow-up
  async cancelFollowUp(followUpId: string, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const response = await axios.post('/api/follow-up/cancel', {
        followUpId,
        workspaceId: wsId
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
  async removeClient(clientId: string, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const response = await axios.post('/api/follow-up/remove-client', {
        clientId,
        workspaceId: wsId
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
  async moveClientToStage(followUpId: string, stageId: string, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const response = await axios.put(`/api/follow-up/${followUpId}/move-stage`, {
        stageId,
        workspaceId: wsId
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
  async createFollowUp(clientId: string, campaignId: string, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      const response = await axios.post('/api/follow-up', {
        clientId,
        campaignId,
        workspaceId: wsId
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

  

  // Função para criar um novo passo
  async createStep(data: any, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      console.log('Criando novo passo com dados:', data);
      // Verificar se o passo contém campaign_id
      if (!data.campaign_id && data.funnel_stage_id) {
        console.log('Adicionando campaign_id ao passo...');
        // Buscar o estágio para determinar a campanha
        const stages = await this.getFunnelStages(undefined, wsId);
        const stage = stages.find(s => s.id === data.funnel_stage_id);
        if (stage && stage.campaignId) {
          data.campaign_id = stage.campaignId;
          console.log(`Adicionado campaign_id: ${data.campaign_id} ao passo`);
        }
      }
      
      // Adicionar o workspace_id
      data.workspaceId = wsId;

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
  },
  
  // Função para criar nova campanha
  async createCampaign(data: any, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      
      if (!wsId) {
        throw new Error('Workspace ID é necessário para criar uma campanha');
      }
      
      // Adicionar workspaceId aos dados
      const campaignData = {
        ...data,
        workspaceId: wsId
      };
      
      const response = await axios.post('/api/follow-up/campaigns', campaignData);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create campaign');
      }
      
      return response.data.data;
    } catch (error) {
      console.error('Error creating campaign:', error);
      throw error;
    }
  },

  // Função para atualizar uma campanha
  async updateCampaign(campaignId: string, formData: any, workspaceId?: string): Promise<any> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      if (!wsId) {
        throw new Error('Workspace ID é necessário para atualizar uma campanha');
      }
      
      // Adicionar workspaceId aos dados
      const campaignData = {
        ...formData,
        workspaceId: wsId
      };
      
      console.log('Enviando dados formatados para atualização:', JSON.stringify(campaignData, null, 2));
      const response = await axios.put(`/api/follow-up/campaigns/${campaignId}`, campaignData);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update campaign');
      }
      
      this.clearCampaignCache(campaignId);
      return response.data.data;
    } catch (error) {
      console.error('Error updating campaign:', error);
      throw error;
    }
  },

  // NOVA FUNÇÃO: Excluir uma campanha
  async deleteCampaign(campaignId: string, workspaceId?: string): Promise<boolean> {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      if (!wsId) {
        throw new Error('Workspace ID é necessário para excluir uma campanha');
      }

      console.log(`Tentando excluir campanha ${campaignId} do workspace ${wsId}`);

      // A API espera o workspaceId como query param ou no body, dependendo da implementação
      // Vamos passar como query param por segurança
      const response = await axios.delete(`/api/follow-up/campaigns/${campaignId}`, {
        params: { workspaceId: wsId }
        // ou data: { workspaceId: wsId } se a API esperar no body
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao excluir campanha');
      }

      // Limpar cache se necessário (depende da implementação do getCampaigns)
      // this.clearCampaignCache(); // Descomentar se tiver cache

      console.log(`Campanha ${campaignId} excluída com sucesso.`);
      return true;
    } catch (error) {
      console.error(`Erro ao excluir campanha ${campaignId}:`, error);
      // Lançar o erro para que a UI possa tratá-lo
      if (axios.isAxiosError(error) && error.response) {
         throw new Error(error.response.data?.error || error.response.data?.message || 'Erro na API ao excluir campanha');
      } else if (error instanceof Error) {
         throw error;
      } else {
         throw new Error('Erro desconhecido ao excluir campanha');
      }
    }
  },

  
};

export default followUpService;