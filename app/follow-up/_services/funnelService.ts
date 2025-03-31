// /app/follow-up/_services/funnelService.ts
'use client';

import { useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { 
  FunnelStage, 
  FunnelStep,
  FunnelStageCreate, 
  FunnelStageUpdate,
  mapStepToApi,
  mapApiToStep
} from '../_types/schema';

export const useFunnelStages = () => {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStages = useCallback(async (campaignId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = campaignId 
        ? `/api/follow-up/funnel-stages?campaignId=${campaignId}`
        : '/api/follow-up/funnel-stages';
      
      const response = await axios.get(url);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao carregar estágios');
      }
      
      setStages(result.data);
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      toast.error('Erro ao carregar estágios do funil');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createStage = async (data: FunnelStageCreate, campaignId?: string) => {
    setIsLoading(true);
    try {
      const response = await axios.post('/api/follow-up/funnel-stages', {
        ...data,
        campaignId
      });
      
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao criar estágio');
      }
      
      toast.success('Estágio criado com sucesso');
      await fetchStages(campaignId);
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar estágio';
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateStage = async (id: string, data: FunnelStageUpdate) => {
    setIsLoading(true);
    try {
      // Garantir que todos os campos obrigatórios estejam presentes
      if (!data.name) {
        toast.error('Nome do estágio é obrigatório');
        setIsLoading(false);
        return null;
      }
      
      // Log para debug
      console.log('Enviando dados para API:', {
        id, 
        name: data.name,
        description: data.description,
        order: data.order
      });
      
      const response = await axios.put('/api/follow-up/funnel-stages', {
        id,
        name: data.name,
        description: data.description,
        order: data.order
      });
      
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao atualizar estágio');
      }
      
      toast.success('Estágio atualizado com sucesso');
      await fetchStages();
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar estágio';
      console.error('Erro na atualização do estágio:', err);
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteStage = async (id: string) => {
    setIsLoading(true);
    try {
      const response = await axios.delete(`/api/follow-up/funnel-stages?id=${id}`);
      
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao excluir estágio');
      }
      
      toast.success('Estágio excluído com sucesso');
      await fetchStages();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir estágio';
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    stages,
    isLoading,
    error,
    fetchStages,
    createStage,
    updateStage,
    deleteStage
  };
};

export const useFunnelSteps = () => {
  const [steps, setSteps] = useState<FunnelStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Limpar o cache quando necessário
  const clearCache = useCallback(() => {
    // Implementação do cache se necessário
  }, []);

  const fetchSteps = useCallback(async (stageId?: string, campaignId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      let url;
      
      if (stageId) {
        // Buscar passos de um estágio específico
        url = `/api/follow-up/funnel-steps?stageId=${stageId}`;
      } else if (campaignId) {
        // Buscar passos de uma campanha específica
        url = `/api/follow-up/campaigns/${campaignId}`;
      } else {
        throw new Error('É necessário fornecer um ID de estágio ou campanha');
      }
      
      const response = await axios.get(url);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao carregar passos');
      }
      
      // Processar os dados com base na origem
      let processedSteps: FunnelStep[];
      
      if (stageId) {
        // API de passos de estágio retorna diretamente os passos
        processedSteps = result.data.map(mapApiToStep);
      } else {
        // API de campanha retorna a campanha com os passos
        const campaignSteps = result.data.steps;
        
        // Verificar se steps é string e tentar fazer parse
        if (typeof campaignSteps === 'string') {
          try {
            const parsedSteps = JSON.parse(campaignSteps);
            processedSteps = Array.isArray(parsedSteps) ? parsedSteps : [];
          } catch (e) {
            processedSteps = [];
          }
        } else {
          processedSteps = Array.isArray(campaignSteps) ? campaignSteps : [];
        }
      }
      
      setSteps(processedSteps);
      return processedSteps;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      console.error('Erro ao buscar passos:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createStep = async (data: FunnelStep) => {
    setIsLoading(true);
    try {
      // Converter para o formato da API
      const apiData = mapStepToApi(data);
      
      const response = await axios.post('/api/follow-up/funnel-steps', apiData);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao criar passo');
      }
      
      toast.success('Passo criado com sucesso');
      clearCache();
      return mapApiToStep(result.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar passo';
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateStep = async (id: string, data: Partial<FunnelStep>) => {
    setIsLoading(true);
    try {
      // Converter para o formato da API
      const apiData = {
        ...mapStepToApi({ id, ...data } as FunnelStep)
      };
      
      console.log('Enviando dados para updateStep na rota correta:', apiData);
      
      // Usar a rota correta para atualização de passos
      const response = await axios.put('/api/follow-up/funnel-steps', apiData);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao atualizar passo');
      }
      
      toast.success('Passo atualizado com sucesso');
      clearCache();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar passo';
      console.error('Erro detalhado na atualização do passo:', err);
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteStep = async (id: string) => {
    setIsLoading(true);
    try {
      const response = await axios.delete(`/api/follow-up/funnel-steps?id=${id}`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao excluir passo');
      }
      
      toast.success('Passo excluído com sucesso');
      clearCache();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir passo';
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    steps,
    isLoading,
    error,
    fetchSteps,
    createStep,
    updateStep,
    deleteStep
  };
};