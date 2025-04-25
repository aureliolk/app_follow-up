// context/workspace-context.tsx
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useRef
} from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useSession, SessionContextValue } from 'next-auth/react';
import axios from 'axios';
// Importar tipos (ajuste o caminho se necessário)
import type { Workspace as PrismaWorkspace, WorkspaceAiFollowUpRule as PrismaAiFollowUpRule } from '@prisma/client'; // Importar tipos do Prisma se possível

// --- Tipos Adaptados para o Contexto ---

// Usar Date para consistência no frontend
type Workspace = Omit<PrismaWorkspace, 'created_at' | 'updated_at' | 'lumibot_api_token'> & {
  created_at: Date;
  updated_at: Date;
  ai_name?: string | null;
  // Incluir relações/contagens que a API retorna
   owner?: { id: string; name: string | null; email: string };
   _count?: { members: number };
   // Não incluímos lumibot_api_token aqui por segurança
};

// Tipo para regras, com delay_milliseconds como string (como vem da API)
type ApiFollowUpRule = Omit<PrismaAiFollowUpRule, 'delay_milliseconds' | 'created_at' | 'updated_at'> & {
  delay_milliseconds: string;
  created_at: string | Date; // Pode vir como string da API JSON
  updated_at: string | Date;
};


// Tipos para dados de criação/atualização das regras
type CreateRuleData = { delayString: string; messageContent: string };
type UpdateRuleData = Partial<CreateRuleData>;

// Tipo para dados de atualização do workspace
type WorkspaceUpdateData = {
  name?: string;
  slug?: string;
  lumibot_account_id?: string | null;
  lumibot_api_token?: string | null;
  ai_default_system_prompt?: string | null;
  ai_model_preference?: string | null;
  ai_name?: string | null;
};


// Tipo para o valor do Contexto
type WorkspaceContextType = {
  // Workspace Ativo e Lista
  workspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean; // Loading geral (combina lista e atual)
  error: string | null; // Erro geral do contexto
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>; // Refresh manual
  clearError: () => void; // Limpar erro geral

  // Operações de Workspace
  createWorkspace: (name: string) => Promise<Workspace>;
  updateWorkspace: (id: string, data: WorkspaceUpdateData) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;

  // Estado e Operações das Regras de Follow-up IA
  aiFollowUpRules: ApiFollowUpRule[];
  loadingAiFollowUpRules: boolean;
  aiFollowUpRulesError: string | null;
  fetchAiFollowUpRules: (workspaceId?: string) => Promise<void>;
  createAiFollowUpRule: (data: CreateRuleData, workspaceId?: string) => Promise<ApiFollowUpRule>;
  updateAiFollowUpRule: (ruleId: string, data: UpdateRuleData, workspaceId?: string) => Promise<ApiFollowUpRule>;
  deleteAiFollowUpRule: (ruleId: string, workspaceId?: string) => Promise<void>;
  clearAiFollowUpRulesError: () => void;
};

// Criação do Contexto
const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// Hook de Acesso ao Contexto
export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace deve ser usado dentro de um WorkspaceProvider');
  }
  return context;
};

// --- Componente Provider ---
export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { data: session, status }: SessionContextValue = useSession();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  // Estados Internos - Workspace
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentWorkspaceIdRef = useRef<string | null>(null);

  // Estados Internos - Regras de Follow-up IA
  const [aiFollowUpRules, setAiFollowUpRules] = useState<ApiFollowUpRule[]>([]);
  const [loadingAiFollowUpRules, setLoadingAiFollowUpRules] = useState(false);
  const [aiFollowUpRulesError, setAiFollowUpRulesError] = useState<string | null>(null);


  // Atualiza a ref do slug quando params muda
  useEffect(() => {
    currentWorkspaceIdRef.current = params?.id as string | null ?? null;
  }, [params?.id]);

  // --- Funções Auxiliares ---

  const clearError = useCallback(() => setError(null), []);
  const clearAiFollowUpRulesError = useCallback(() => setAiFollowUpRulesError(null), []);

  // Função interna para obter o ID do workspace ativo de forma segura
  const getActiveWorkspaceIdInternal = useCallback((providedId?: string): string | null => {
    if (providedId) return providedId;
    if (workspace?.id) return workspace.id; // Prioriza o estado atual do contexto
    const slug = currentWorkspaceIdRef.current;
    if (slug) {
        const foundInList = workspaces.find(w => w.slug === slug);
        if (foundInList) return foundInList.id;
    }
    if (typeof window !== 'undefined') {
      const storedId = sessionStorage.getItem('activeWorkspaceId');
      if (storedId) return storedId;
    }
    console.warn("getActiveWorkspaceIdInternal: Não foi possível determinar o ID do workspace ativo.");
    return null;
  }, [workspace?.id, workspaces]); // Depende do workspace e da lista


  // --- Lógica de Carregamento de Workspaces ---

  const userId = session?.user?.id;
  const userIsSuperAdmin = !!session?.user?.isSuperAdmin;

  // Buscar a LISTA de workspaces
  const fetchWorkspaceList = useCallback(async () => {
    if (status !== 'authenticated' || !userId) {
      setWorkspaces([]);
      setIsLoadingList(false);
      return;
    }

    console.log("fetchWorkspaceList: Iniciando busca...");
    setIsLoadingList(true);
    setError(null); // Limpa erro geral
    setAiFollowUpRulesError(null); // Limpa erro específico das regras
    setAiFollowUpRules([]); // Limpa regras antigas

    const endpoint = userIsSuperAdmin ? '/api/workspaces/all' : '/api/workspaces';
    try {
      const response = await axios.get<Workspace[]>(endpoint, { headers: { 'Cache-Control': 'no-cache' } });
       // Converte datas string para Date objects
      const fetchedWorkspaces = response.data.map(ws => ({
        ...ws,
        created_at: new Date(ws.created_at),
        updated_at: new Date(ws.updated_at),
      }));
      setWorkspaces(fetchedWorkspaces);
      console.log('fetchWorkspaceList: Lista carregada com', fetchedWorkspaces.length, 'workspaces.');
    } catch (err: any) {
      console.error('fetchWorkspaceList: Erro -', err);
      const message = err.response?.data?.message || err.message || 'Falha ao carregar workspaces';
      setError(message);
      setWorkspaces([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [status, userId, userIsSuperAdmin]); // Dependências estáveis

  useEffect(() => {
    fetchWorkspaceList();
  }, [fetchWorkspaceList]); // Executa ao montar e quando as dependências de fetchWorkspaceList mudarem

   // Definir o WORKSPACE ATUAL baseado na URL e na lista carregada
   useEffect(() => {
    const workspaceIdFromUrl = currentWorkspaceIdRef.current;
    console.log(`Effect Set Current Wks: ID=${workspaceIdFromUrl}, List Loading=${isLoadingList}`);

    if (isLoadingList) {
      setIsLoadingCurrent(true);
      setWorkspace(null);
      return; // Espera a lista carregar
    }

    setIsLoadingCurrent(true);
    if (!workspaceIdFromUrl || !pathname?.startsWith('/workspace/')) {
      setWorkspace(null);
      if (typeof window !== 'undefined') sessionStorage.removeItem('activeWorkspaceId');
       // Não limpa erro geral aqui, pode ser um erro da lista
    } else {
      const found = workspaces.find(w => w.id === workspaceIdFromUrl);
      if (found) {
         setWorkspace({ // Garante que as datas são objetos Date
            ...found,
            created_at: new Date(found.created_at),
            updated_at: new Date(found.updated_at),
         });
        if (typeof window !== 'undefined') sessionStorage.setItem('activeWorkspaceId', found.id);
        // Limpa erro se encontrou
        setError(null);
      } else if (!isLoadingList) { // Só define erro se a lista *já* carregou e não achou
        setError(prevError => prevError || `Workspace ID "${workspaceIdFromUrl}" não encontrado ou acesso negado.`);
        setWorkspace(null);
        if (typeof window !== 'undefined') sessionStorage.removeItem('activeWorkspaceId');
      }
    }
    setIsLoadingCurrent(false);

  }, [workspaces, pathname, isLoadingList]); // Depende da lista, do pathname e do loading da lista

  // --- Funções CRUD para WORKSPACES ---

  const switchWorkspace = useCallback((workspaceId: string) => {
    const targetWorkspace = workspaces.find(w => w.id === workspaceId);
    if (!targetWorkspace) {
      setError('Workspace não encontrado para troca (ID: ' + workspaceId + ')');
      return;
    }
    if (typeof window !== 'undefined') sessionStorage.setItem('activeWorkspaceId', targetWorkspace.id);
    setWorkspace({ // Garante datas como Date objects
        ...targetWorkspace,
        created_at: new Date(targetWorkspace.created_at),
        updated_at: new Date(targetWorkspace.updated_at),
    });
    setAiFollowUpRules([]); // Limpa regras do workspace anterior
    setAiFollowUpRulesError(null); // Limpa erros de regras
    router.push(`/workspace/${workspaceId}`);
  }, [workspaces, router]);

  const createWorkspace = useCallback(async (name: string): Promise<Workspace> => {
    console.log(`createWorkspace: Creating '${name}'`);
    setError(null);
    try {
      const response = await axios.post<Workspace>('/api/workspaces', { name });
       const newWorkspace = { // Converte datas
         ...response.data,
         created_at: new Date(response.data.created_at),
         updated_at: new Date(response.data.updated_at),
       };
      setWorkspaces(prev => [...prev, newWorkspace]);
      return newWorkspace;
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Falha ao criar workspace';
      setError(message);
      throw new Error(message);
    }
  }, []);

   const updateWorkspace = useCallback(async (id: string, data: WorkspaceUpdateData): Promise<Workspace> => {
    console.log(`updateWorkspace: Updating ${id} with:`, data);
    setError(null);
    try {
      const response = await axios.patch<Workspace>(`/api/workspaces/${id}`, data);
      const updatedData = response.data;
       const updatedWorkspace = { // Converte datas
         ...updatedData,
         created_at: new Date(updatedData.created_at),
         updated_at: new Date(updatedData.updated_at),
       };

      setWorkspaces(prev => prev.map(w => (w.id === id ? { ...w, ...updatedWorkspace } : w)));
      if (workspace?.id === id) {
        setWorkspace(prev => prev ? { ...prev, ...updatedWorkspace } : null);
      }
      if (data.slug && data.slug !== workspace?.slug) {
        router.push(`/workspace/${data.slug}`);
      }
      return updatedWorkspace;
    } catch (err: any) {
      const message = err.response?.data?.message || err.response?.data?.error || err.message || 'Falha ao atualizar workspace';
      setError(message);
      throw new Error(message);
    }
  }, [workspace, router]);

  const deleteWorkspace = useCallback(async (id: string): Promise<void> => {
    console.log(`deleteWorkspace: Deleting ${id}`);
    setError(null);
    try {
      await axios.delete(`/api/workspaces/${id}`);
      const wasCurrent = workspace?.id === id;
      setWorkspaces(prev => prev.filter(w => w.id !== id));
      if (wasCurrent) {
        setWorkspace(null);
        setAiFollowUpRules([]);
        setAiFollowUpRulesError(null);
        if (typeof window !== 'undefined') sessionStorage.removeItem('activeWorkspaceId');
        router.push('/workspaces');
      }
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Falha ao excluir workspace';
      setError(message);
      throw new Error(message);
    }
  }, [workspace, router]);

  // Refresh Manual
  const refreshWorkspaces = useCallback(async (): Promise<void> => {
      console.log("refreshWorkspaces: Triggered.");
      await fetchWorkspaceList(); // Simplesmente busca a lista novamente
  }, [fetchWorkspaceList]);

  // --- Funções CRUD para REGRAS DE FOLLOW-UP IA ---

  const fetchAiFollowUpRules = useCallback(async (providedWorkspaceId?: string): Promise<void> => {
    const wsId = getActiveWorkspaceIdInternal(providedWorkspaceId);
    if (!wsId) {
      console.warn("fetchAiFollowUpRules: Workspace ID não disponível.");
      setAiFollowUpRules([]); // Limpa se não tem ID
      return;
    }

    console.log(`fetchAiFollowUpRules: Buscando para workspace ${wsId}`);
    setLoadingAiFollowUpRules(true);
    setAiFollowUpRulesError(null);
    try {
      const response = await axios.get<{ success: boolean, data?: ApiFollowUpRule[], error?: string }>(`/api/workspaces/${wsId}/ai-followups`);
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Falha ao buscar regras de acompanhamento');
      }
      setAiFollowUpRules(response.data.data);
      console.log(`fetchAiFollowUpRules: ${response.data.data.length} regras carregadas.`);
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Erro ao buscar regras de acompanhamento.';
      console.error('fetchAiFollowUpRules: Erro -', err);
      setAiFollowUpRulesError(message);
      setAiFollowUpRules([]);
    } finally {
      setLoadingAiFollowUpRules(false);
    }
  }, [getActiveWorkspaceIdInternal]);

  const createAiFollowUpRule = useCallback(async (data: CreateRuleData, providedWorkspaceId?: string): Promise<ApiFollowUpRule> => {
    const wsId = getActiveWorkspaceIdInternal(providedWorkspaceId);
    if (!wsId) throw new Error('Workspace ID não encontrado para criar regra.');

    console.log(`createAiFollowUpRule: Criando em ${wsId}`);
    setAiFollowUpRulesError(null);
    try {
      const response = await axios.post<{ success: boolean, data: ApiFollowUpRule, error?: string }>(
          `/api/workspaces/${wsId}/ai-followups`,
          data
      );
      if (!response.data.success) throw new Error(response.data.error || 'Falha ao criar regra');
      const newRule = response.data.data;
      setAiFollowUpRules(prev => [newRule, ...prev]);
      return newRule;
    } catch (err: any) {
      const message = err.response?.data?.error || err.response?.data?.details?.[0]?.message || err.message || 'Erro ao criar regra.';
      console.error('createAiFollowUpRule: Erro -', err);
      setAiFollowUpRulesError(message);
      throw new Error(message);
    }
  }, [getActiveWorkspaceIdInternal]);

  const updateAiFollowUpRule = useCallback(async (ruleId: string, data: UpdateRuleData, providedWorkspaceId?: string): Promise<ApiFollowUpRule> => {
    const wsId = getActiveWorkspaceIdInternal(providedWorkspaceId);
    if (!wsId) throw new Error('Workspace ID não encontrado para atualizar regra.');

    console.log(`updateAiFollowUpRule: Atualizando ${ruleId} em ${wsId}`);
    setAiFollowUpRulesError(null);
    try {
       const response = await axios.put<{ success: boolean, data: ApiFollowUpRule, error?: string }>(
           `/api/workspaces/${wsId}/ai-followups/${ruleId}`,
           data
       );
      if (!response.data.success) throw new Error(response.data.error || 'Falha ao atualizar regra');
      const updatedRule = response.data.data;
      setAiFollowUpRules(prev => prev.map(r => r.id === ruleId ? updatedRule : r));
      return updatedRule;
    } catch (err: any) {
      const message = err.response?.data?.error || err.response?.data?.details?.[0]?.message || err.message || 'Erro ao atualizar regra.';
      console.error(`updateAiFollowUpRule: Erro (${ruleId}) -`, err);
      setAiFollowUpRulesError(message);
      throw new Error(message);
    }
  }, [getActiveWorkspaceIdInternal]);

  const deleteAiFollowUpRule = useCallback(async (ruleId: string, providedWorkspaceId?: string): Promise<void> => {
    const wsId = getActiveWorkspaceIdInternal(providedWorkspaceId);
    if (!wsId) throw new Error('Workspace ID não encontrado para excluir regra.');

    console.log(`deleteAiFollowUpRule: Excluindo ${ruleId} de ${wsId}`);
    setAiFollowUpRulesError(null);
    try {
       const response = await axios.delete<{ success: boolean, message?: string, error?: string }>(
           `/api/workspaces/${wsId}/ai-followups/${ruleId}`
       );
      if (!response.data.success) throw new Error(response.data.error || 'Falha ao excluir regra');
      setAiFollowUpRules(prev => prev.filter(r => r.id !== ruleId));
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Erro ao excluir regra.';
      console.error(`deleteAiFollowUpRule: Erro (${ruleId}) -`, err);
      setAiFollowUpRulesError(message);
      throw new Error(message);
    }
  }, [getActiveWorkspaceIdInternal]);


  // Combina loadings para a UI geral
  const combinedIsLoading = status === 'loading' || isLoadingList || isLoadingCurrent;

  // Valor final do Contexto
  const contextValue: WorkspaceContextType = {
    workspace,
    workspaces,
    isLoading: combinedIsLoading,
    error,
    switchWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    refreshWorkspaces,
    clearError,
    // Regras de Follow-up IA
    aiFollowUpRules,
    loadingAiFollowUpRules,
    aiFollowUpRulesError,
    fetchAiFollowUpRules,
    createAiFollowUpRule,
    updateAiFollowUpRule,
    deleteAiFollowUpRule,
    clearAiFollowUpRulesError,
  };

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};