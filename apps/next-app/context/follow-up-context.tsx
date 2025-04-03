'use client'; 

// context/follow-up-context.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { useWorkspace } from '@/apps/next-app/context/workspace-context';

// Utilitário para obter o workspace ativo do sessionStorage
const getActiveWorkspaceId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('activeWorkspaceId');
};

// Definição dos tipos
interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  created_at: string;
  // Campos de IA
  ai_prompt_product_name?: string | null;
  ai_prompt_target_audience?: string | null;
  ai_prompt_pain_point?: string | null;
  ai_prompt_main_benefit?: string | null;
  ai_prompt_tone_of_voice?: string | null;
  ai_prompt_extra_instructions?: string | null;
  ai_prompt_cta_link?: string | null;
  ai_prompt_cta_text?: string | null;
  // Campos opcionais para listagem
  stepsCount?: number;
  activeFollowUps?: number;
}

interface FollowUp {
  id: string;
  campaign_id: string;
  client_id: string;
  status: string;
  started_at: string;
  // ... outros campos relevantes
}

interface FollowUpContextType {
  // Estado
  campaigns: Campaign[];
  loadingCampaigns: boolean;
  campaignsError: string | null;
  selectedCampaign: Campaign | null;
  loadingSelectedCampaign: boolean;
  followUps: FollowUp[];
  loadingFollowUps: boolean;
  followUpsError: string | null;
  
  // Operações de campanhas
  fetchCampaigns: (workspaceId?: string) => Promise<Campaign[]>;
  fetchCampaign: (campaignId: string, workspaceId?: string) => Promise<Campaign>;
  createCampaign: (data: Partial<Campaign>, workspaceId?: string) => Promise<Campaign>;
  updateCampaign: (campaignId: string, data: Partial<Campaign>, workspaceId?: string) => Promise<Campaign>;
  deleteCampaign: (campaignId: string, workspaceId?: string) => Promise<void>;
  
  // Operações de follow-ups
  fetchFollowUps: (status?: string, workspaceId?: string) => Promise<FollowUp[]>;
  fetchFollowUp: (followUpId: string) => Promise<FollowUp>;
  createFollowUp: (data: Partial<FollowUp>, workspaceId?: string) => Promise<FollowUp>;
  updateFollowUp: (followUpId: string, data: Partial<FollowUp>) => Promise<FollowUp>;
  
  // Cache utilities
  clearCampaignCache: (campaignId?: string) => void;
  clearFollowUpCache: (followUpId?: string) => void;
}

// Criação do contexto
const FollowUpContext = createContext<FollowUpContextType | undefined>(undefined);

// Provider Component
export const FollowUpProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Estados
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [loadingSelectedCampaign, setLoadingSelectedCampaign] = useState(false);
  
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [followUpsError, setFollowUpsError] = useState<string | null>(null);
  
  // Cache para evitar requisições duplicadas
  const [campaignCache, setCampaignCache] = useState<Record<string, Campaign>>({});
  const [followUpCache, setFollowUpCache] = useState<Record<string, FollowUp>>({});
  
  // Função para buscar campanhas
  const fetchCampaigns = useCallback(async (workspaceId?: string): Promise<Campaign[]> => {
    try {
      setLoadingCampaigns(true);
      setCampaignsError(null);

      const wsId = workspaceId || getActiveWorkspaceId();
      if (!wsId) {
        throw new Error('Workspace ID é necessário para buscar campanhas');
      }
      
      const response = await axios.get(`/api/follow-up/campaigns?workspaceId=${wsId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao buscar campanhas');
      }
      
      const fetchedCampaigns = response.data.data;
      setCampaigns(fetchedCampaigns);
      
      // Atualizar cache
      const newCache = { ...campaignCache };
      fetchedCampaigns.forEach((campaign: Campaign) => {
        newCache[campaign.id] = campaign;
      });
      setCampaignCache(newCache);
      
      return fetchedCampaigns;
    } catch (error: any) {
      console.error('Error fetching campaigns:', error);
      const message = error.message || 'Erro ao buscar campanhas';
      setCampaignsError(message);
      throw error;
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);
  
  // Função para buscar campanha específica
  const fetchCampaign = useCallback(async (campaignId: string, workspaceId?: string): Promise<Campaign> => {
    try {
      setLoadingSelectedCampaign(true);
      
      // Verificar cache primeiro
      if (campaignCache[campaignId]) {
        setSelectedCampaign(campaignCache[campaignId]);
        return campaignCache[campaignId];
      }
      
      const wsId = workspaceId || getActiveWorkspaceId();
      if (!wsId) {
        throw new Error('Workspace ID é necessário para buscar campanha');
      }
      
      const response = await axios.get(`/api/follow-up/campaigns/${campaignId}?workspaceId=${wsId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao buscar campanha');
      }
      
      const campaign = response.data.data;
      setSelectedCampaign(campaign);
      
      // Atualizar cache
      setCampaignCache(prev => ({
        ...prev,
        [campaignId]: campaign
      }));
      
      return campaign;
    } catch (error: any) {
      console.error(`Error fetching campaign ${campaignId}:`, error);
      throw error;
    } finally {
      setLoadingSelectedCampaign(false);
    }
  }, [campaignCache]);
  
  // Função para criar campanha
  const createCampaign = useCallback(async (data: Partial<Campaign>, workspaceId?: string): Promise<Campaign> => {
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
        throw new Error(response.data.error || 'Falha ao criar campanha');
      }
      
      const newCampaign = response.data.data;
      
      // Atualizar estado e cache
      setCampaigns(prev => [newCampaign, ...prev]);
      setCampaignCache(prev => ({
        ...prev,
        [newCampaign.id]: newCampaign
      }));
      
      return newCampaign;
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      throw error;
    }
  }, []);
  
  // Função para atualizar campanha
  const updateCampaign = useCallback(async (campaignId: string, data: Partial<Campaign>, workspaceId?: string): Promise<Campaign> => {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      if (!wsId) {
        throw new Error('Workspace ID é necessário para atualizar uma campanha');
      }
      
      // Adicionar workspaceId aos dados
      const campaignData = {
        ...data,
        workspaceId: wsId
      };
      
      const response = await axios.put(`/api/follow-up/campaigns/${campaignId}`, campaignData);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao atualizar campanha');
      }
      
      const updatedCampaign = response.data.data;
      
      // Atualizar estado e cache
      setCampaigns(prev => 
        prev.map(campaign => 
          campaign.id === campaignId ? updatedCampaign : campaign
        )
      );
      
      setCampaignCache(prev => ({
        ...prev,
        [campaignId]: updatedCampaign
      }));
      
      if (selectedCampaign?.id === campaignId) {
        setSelectedCampaign(updatedCampaign);
      }
      
      return updatedCampaign;
    } catch (error: any) {
      console.error(`Error updating campaign ${campaignId}:`, error);
      throw error;
    }
  }, [selectedCampaign]);
  
  // Função para excluir campanha
  const deleteCampaign = useCallback(async (campaignId: string, workspaceId?: string): Promise<void> => {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      if (!wsId) {
        throw new Error('Workspace ID é necessário para excluir uma campanha');
      }
      
      const response = await axios.delete(`/api/follow-up/campaigns/${campaignId}?workspaceId=${wsId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao excluir campanha');
      }
      
      // Atualizar estado e cache
      setCampaigns(prev => prev.filter(campaign => campaign.id !== campaignId));
      
      // Remover do cache
      setCampaignCache(prev => {
        const newCache = { ...prev };
        delete newCache[campaignId];
        return newCache;
      });
      
      if (selectedCampaign?.id === campaignId) {
        setSelectedCampaign(null);
      }
    } catch (error: any) {
      console.error(`Error deleting campaign ${campaignId}:`, error);
      throw error;
    }
  }, [selectedCampaign]);
  
  // Função para buscar follow-ups
  const fetchFollowUps = useCallback(async (status?: string, workspaceId?: string): Promise<FollowUp[]> => {
    try {
      setLoadingFollowUps(true);
      setFollowUpsError(null);
      
      const wsId = workspaceId || getActiveWorkspaceId();
      if (!wsId) {
        throw new Error('Workspace ID é necessário para buscar follow-ups');
      }
      
      // Construir URL com parâmetros de consulta
      let url = `/api/follow-up?workspaceId=${wsId}`;
      if (status) {
        url += `&status=${status}`;
      }
      
      const response = await axios.get(url);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao buscar follow-ups');
      }
      
      const fetchedFollowUps = response.data.data;
      setFollowUps(fetchedFollowUps);
      
      // Atualizar cache
      const newCache = { ...followUpCache };
      fetchedFollowUps.forEach((followUp: FollowUp) => {
        newCache[followUp.id] = followUp;
      });
      setFollowUpCache(newCache);
      
      return fetchedFollowUps;
    } catch (error: any) {
      console.error('Error fetching follow-ups:', error);
      const message = error.message || 'Erro ao buscar follow-ups';
      setFollowUpsError(message);
      throw error;
    } finally {
      setLoadingFollowUps(false);
    }
  }, [followUpCache]);
  
  // Função para buscar follow-up específico
  const fetchFollowUp = useCallback(async (followUpId: string): Promise<FollowUp> => {
    try {
      // Verificar cache primeiro
      if (followUpCache[followUpId]) {
        return followUpCache[followUpId];
      }
      
      const response = await axios.get(`/api/follow-up/${followUpId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao buscar follow-up');
      }
      
      const followUp = response.data.data;
      
      // Atualizar cache
      setFollowUpCache(prev => ({
        ...prev,
        [followUpId]: followUp
      }));
      
      return followUp;
    } catch (error: any) {
      console.error(`Error fetching follow-up ${followUpId}:`, error);
      throw error;
    }
  }, [followUpCache]);
  
  // Função para criar follow-up
  const createFollowUp = useCallback(async (data: Partial<FollowUp>, workspaceId?: string): Promise<FollowUp> => {
    try {
      const wsId = workspaceId || getActiveWorkspaceId();
      if (!wsId) {
        throw new Error('Workspace ID é necessário para criar um follow-up');
      }
      
      // Adicionar workspaceId aos dados
      const followUpData = {
        ...data,
        workspaceId: wsId
      };
      
      const response = await axios.post('/api/follow-up', followUpData);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao criar follow-up');
      }
      
      const newFollowUp = response.data.data;
      
      // Atualizar estado e cache
      setFollowUps(prev => [newFollowUp, ...prev]);
      setFollowUpCache(prev => ({
        ...prev,
        [newFollowUp.id]: newFollowUp
      }));
      
      return newFollowUp;
    } catch (error: any) {
      console.error('Error creating follow-up:', error);
      throw error;
    }
  }, []);
  
  // Função para atualizar follow-up
  const updateFollowUp = useCallback(async (followUpId: string, data: Partial<FollowUp>): Promise<FollowUp> => {
    try {
      const response = await axios.put(`/api/follow-up/${followUpId}`, data);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao atualizar follow-up');
      }
      
      const updatedFollowUp = response.data.data;
      
      // Atualizar estado e cache
      setFollowUps(prev => 
        prev.map(followUp => 
          followUp.id === followUpId ? updatedFollowUp : followUp
        )
      );
      
      setFollowUpCache(prev => ({
        ...prev,
        [followUpId]: updatedFollowUp
      }));
      
      return updatedFollowUp;
    } catch (error: any) {
      console.error(`Error updating follow-up ${followUpId}:`, error);
      throw error;
    }
  }, []);
  
  // Funções para limpar cache
  const clearCampaignCache = useCallback((campaignId?: string) => {
    if (campaignId) {
      setCampaignCache(prev => {
        const newCache = { ...prev };
        delete newCache[campaignId];
        return newCache;
      });
    } else {
      setCampaignCache({});
    }
  }, []);
  
  const clearFollowUpCache = useCallback((followUpId?: string) => {
    if (followUpId) {
      setFollowUpCache(prev => {
        const newCache = { ...prev };
        delete newCache[followUpId];
        return newCache;
      });
    } else {
      setFollowUpCache({});
    }
  }, []);
  
  // Valores do contexto
  const contextValue: FollowUpContextType = {
    // Estado
    campaigns,
    loadingCampaigns,
    campaignsError,
    selectedCampaign,
    loadingSelectedCampaign,
    followUps,
    loadingFollowUps,
    followUpsError,
    
    // Operações de campanhas
    fetchCampaigns,
    fetchCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    
    // Operações de follow-ups
    fetchFollowUps,
    fetchFollowUp,
    createFollowUp,
    updateFollowUp,
    
    // Cache utilities
    clearCampaignCache,
    clearFollowUpCache,
    
  };
  
  return (
    <FollowUpContext.Provider value={contextValue}>
      {children}
    </FollowUpContext.Provider>
  );
};

// Hook para facilitar o uso do contexto
export const useFollowUp = () => {
  const context = useContext(FollowUpContext);
  if (context === undefined) {
    throw new Error('useFollowUp deve ser usado dentro de um FollowUpProvider');
  }
  return context;
};

// Exportação padrão do Provider
export default FollowUpProvider;