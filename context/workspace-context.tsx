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
import { createClient, User } from '@supabase/supabase-js';
import axios from 'axios';
// Importar tipos (ajuste o caminho se necessário)
import type { Workspace as PrismaWorkspace, WorkspaceAiFollowUpRule as PrismaAiFollowUpRule } from '@prisma/client';

// Criar cliente Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  switchWorkspace: (workspaceSlug: string) => void;
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
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  // Estados Internos - Workspace
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentIdRef = useRef<string | null>(null);

  // Estados Internos - Regras de Follow-up IA
  const [aiFollowUpRules, setAiFollowUpRules] = useState<ApiFollowUpRule[]>([]);
  const [loadingAiFollowUpRules, setLoadingAiFollowUpRules] = useState(false);
  const [aiFollowUpRulesError, setAiFollowUpRulesError] = useState<string | null>(null);

  // Atualiza a ref do id quando params muda
  useEffect(() => {
    currentIdRef.current = params?.id as string | null ?? null;
  }, [params?.id]);

  // Configurar listener de autenticação do Supabase
  useEffect(() => {
    // Verificar usuário atual
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Configurar listener para mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Funções Auxiliares ---

  const clearError = useCallback(() => setError(null), []);
  const clearAiFollowUpRulesError = useCallback(() => setAiFollowUpRulesError(null), []);

  // Função interna para obter o ID do workspace ativo de forma segura
  const getActiveWorkspaceIdInternal = useCallback((providedId?: string): string | null => {
    if (providedId) return providedId;
    if (workspace?.id) return workspace.id; // Prioriza o estado atual do contexto
    const id = currentIdRef.current;
    if (id) {
        const foundInList = workspaces.find(w => w.id === id);
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

  const userId = user?.id;
  const userIsSuperAdmin = user?.app_metadata?.is_super_admin ?? false;

  // Buscar a LISTA de workspaces
  const fetchWorkspaceList = useCallback(async () => {
    if (!userId) {
      setWorkspaces([]);
      setIsLoadingList(false);
      return;
    }

    console.log("fetchWorkspaceList: Iniciando busca...");
    setIsLoadingList(true);
    setError(null); // Limpa erro geral
    setAiFollowUpRulesError(null); // Limpa erro específico das regras
    setAiFollowUpRules([]); // Limpa regras antigas

    try {
      let { data: workspaces, error } = await supabase
        .from('workspaces')
        .select(`
          *,
          owner:users!workspaces_owner_id_fkey (id, name, email),
          members:workspace_members (id)
        `);

      if (error) throw error;

      // Converte datas string para Date objects e formata contagem
      const fetchedWorkspaces = workspaces.map(ws => ({
        ...ws,
        created_at: new Date(ws.created_at),
        updated_at: new Date(ws.updated_at),
        _count: { members: ws.members?.length || 0 }
      }));

      setWorkspaces(fetchedWorkspaces);
      console.log('fetchWorkspaceList: Lista carregada com', fetchedWorkspaces.length, 'workspaces.');
    } catch (err: any) {
      console.error('fetchWorkspaceList: Erro -', err);
      const message = err.message || 'Falha ao carregar workspaces';
      setError(message);
      setWorkspaces([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [userId]); // Dependências estáveis

  useEffect(() => {
    fetchWorkspaceList();
  }, [fetchWorkspaceList]); // Executa ao montar e quando as dependências de fetchWorkspaceList mudarem

  // Definir o WORKSPACE ATUAL baseado na URL e na lista carregada
  useEffect(() => {
    const id = currentIdRef.current;
    console.log(`Effect Set Current Wks: Id=${id}, List Loading=${isLoadingList}`);

    if (isLoadingList) {
      setIsLoadingCurrent(true);
      setWorkspace(null);
      return; // Espera a lista carregar
    }

    setIsLoadingCurrent(true);
    if (!id || !pathname?.startsWith('/workspace/')) {
      setWorkspace(null);
      setIsLoadingCurrent(false);
      return;
    }

    // Procura na lista já carregada
    const found = workspaces.find(w => w.id === id);
    if (found) {
      setWorkspace(found);
      setIsLoadingCurrent(false);
      return;
    }

    // Se não encontrou e tem ID, busca do backend
    const fetchWorkspace = async () => {
      try {
        const { data: workspace, error } = await supabase
          .from('workspaces')
          .select(`
            *,
            owner:users!workspaces_owner_id_fkey (id, name, email),
            members:workspace_members (id)
          `)
          .eq('id', id)
          .single();

        if (error) throw error;

        const formattedWorkspace = {
          ...workspace,
          created_at: new Date(workspace.created_at),
          updated_at: new Date(workspace.updated_at),
          _count: { members: workspace.members?.length || 0 }
        };

        setWorkspace(formattedWorkspace);
      } catch (err: any) {
        console.error('Erro ao buscar workspace:', err);
        setError(err.message || 'Falha ao carregar workspace');
        setWorkspace(null);
      } finally {
        setIsLoadingCurrent(false);
      }
    };

    fetchWorkspace();
  }, [workspaces, isLoadingList, pathname]);

  // --- Funções CRUD para WORKSPACES ---

  // Criar novo workspace
  const createWorkspace = useCallback(async (name: string): Promise<Workspace> => {
    if (!userId) throw new Error('Usuário não autenticado');

    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      
      const { data: workspace, error } = await supabase
        .from('workspaces')
        .insert([
          { 
            name,
            slug,
            owner_id: userId,
            ai_model_preference: 'gpt-4-turbo-preview', // Valor padrão
            ai_default_system_prompt: 'Você é um assistente útil e amigável.' // Valor padrão
          }
        ])
        .select(`
          *,
          owner:users!workspaces_owner_id_fkey (id, name, email),
          members:workspace_members (id)
        `)
        .single();

      if (error) throw error;

      const newWorkspace = {
        ...workspace,
        created_at: new Date(workspace.created_at),
        updated_at: new Date(workspace.updated_at),
        _count: { members: workspace.members?.length || 0 }
      };

      setWorkspaces(prev => [...prev, newWorkspace]);
      return newWorkspace;
    } catch (err: any) {
      console.error('createWorkspace: Erro -', err);
      throw new Error(err.message || 'Falha ao criar workspace');
    }
  }, [userId]);

  // Atualizar workspace existente
  const updateWorkspace = useCallback(async (id: string, data: WorkspaceUpdateData): Promise<Workspace> => {
    if (!userId) throw new Error('Usuário não autenticado');

    try {
      const { data: workspace, error } = await supabase
        .from('workspaces')
        .update(data)
        .eq('id', id)
        .select(`
          *,
          owner:users!workspaces_owner_id_fkey (id, name, email),
          members:workspace_members (id)
        `)
        .single();

      if (error) throw error;

      const updatedWorkspace = {
        ...workspace,
        created_at: new Date(workspace.created_at),
        updated_at: new Date(workspace.updated_at),
        _count: { members: workspace.members?.length || 0 }
      };

      setWorkspaces(prev => prev.map(w => w.id === id ? updatedWorkspace : w));
      if (workspace.id === currentIdRef.current) {
        setWorkspace(updatedWorkspace);
      }

      return updatedWorkspace;
    } catch (err: any) {
      console.error('updateWorkspace: Erro -', err);
      throw new Error(err.message || 'Falha ao atualizar workspace');
    }
  }, [userId]);

  // Deletar workspace
  const deleteWorkspace = useCallback(async (id: string): Promise<void> => {
    if (!userId) throw new Error('Usuário não autenticado');

    try {
      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setWorkspaces(prev => prev.filter(w => w.id !== id));
      if (id === currentIdRef.current) {
        setWorkspace(null);
        router.push('/workspaces');
      }
    } catch (err: any) {
      console.error('deleteWorkspace: Erro -', err);
      throw new Error(err.message || 'Falha ao deletar workspace');
    }
  }, [userId, router]);

  // --- Funções para AI Follow-up Rules ---

  // Buscar regras de follow-up
  const fetchAiFollowUpRules = useCallback(async (workspaceId?: string) => {
    const activeId = getActiveWorkspaceIdInternal(workspaceId);
    if (!activeId) {
      console.warn('fetchAiFollowUpRules: Nenhum workspace ativo');
      return;
    }

    setLoadingAiFollowUpRules(true);
    setAiFollowUpRulesError(null);

    try {
      const { data: rules, error } = await supabase
        .from('workspace_ai_follow_up_rules')
        .select('*')
        .eq('workspace_id', activeId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedRules = rules.map(rule => ({
        ...rule,
        created_at: new Date(rule.created_at),
        updated_at: new Date(rule.updated_at),
        delay_milliseconds: rule.delay_milliseconds.toString()
      }));

      setAiFollowUpRules(formattedRules);
    } catch (err: any) {
      console.error('fetchAiFollowUpRules: Erro -', err);
      setAiFollowUpRulesError(err.message || 'Falha ao carregar regras de follow-up');
      setAiFollowUpRules([]);
    } finally {
      setLoadingAiFollowUpRules(false);
    }
  }, [getActiveWorkspaceIdInternal]);

  // Criar nova regra de follow-up
  const createAiFollowUpRule = useCallback(async (
    data: CreateRuleData,
    workspaceId?: string
  ): Promise<ApiFollowUpRule> => {
    const activeId = getActiveWorkspaceIdInternal(workspaceId);
    if (!activeId) throw new Error('Nenhum workspace ativo');

    try {
      const { data: rule, error } = await supabase
        .from('workspace_ai_follow_up_rules')
        .insert([{
          workspace_id: activeId,
          delay_milliseconds: parseInt(data.delayString),
          message_content: data.messageContent
        }])
        .select()
        .single();

      if (error) throw error;

      const newRule = {
        ...rule,
        created_at: new Date(rule.created_at),
        updated_at: new Date(rule.updated_at),
        delay_milliseconds: rule.delay_milliseconds.toString()
      };

      setAiFollowUpRules(prev => [...prev, newRule]);
      return newRule;
    } catch (err: any) {
      console.error('createAiFollowUpRule: Erro -', err);
      throw new Error(err.message || 'Falha ao criar regra de follow-up');
    }
  }, [getActiveWorkspaceIdInternal]);

  // Atualizar regra de follow-up existente
  const updateAiFollowUpRule = useCallback(async (
    ruleId: string,
    data: UpdateRuleData,
    workspaceId?: string
  ): Promise<ApiFollowUpRule> => {
    const activeId = getActiveWorkspaceIdInternal(workspaceId);
    if (!activeId) throw new Error('Nenhum workspace ativo');

    try {
      const updateData: any = {};
      if (data.delayString !== undefined) {
        updateData.delay_milliseconds = parseInt(data.delayString);
      }
      if (data.messageContent !== undefined) {
        updateData.message_content = data.messageContent;
      }

      const { data: rule, error } = await supabase
        .from('workspace_ai_follow_up_rules')
        .update(updateData)
        .eq('id', ruleId)
        .eq('workspace_id', activeId) // Garantia extra
        .select()
        .single();

      if (error) throw error;

      const updatedRule = {
        ...rule,
        created_at: new Date(rule.created_at),
        updated_at: new Date(rule.updated_at),
        delay_milliseconds: rule.delay_milliseconds.toString()
      };

      setAiFollowUpRules(prev => prev.map(r => r.id === ruleId ? updatedRule : r));
      return updatedRule;
    } catch (err: any) {
      console.error('updateAiFollowUpRule: Erro -', err);
      throw new Error(err.message || 'Falha ao atualizar regra de follow-up');
    }
  }, [getActiveWorkspaceIdInternal]);

  // Deletar regra de follow-up
  const deleteAiFollowUpRule = useCallback(async (
    ruleId: string,
    workspaceId?: string
  ): Promise<void> => {
    const activeId = getActiveWorkspaceIdInternal(workspaceId);
    if (!activeId) throw new Error('Nenhum workspace ativo');

    try {
      const { error } = await supabase
        .from('workspace_ai_follow_up_rules')
        .delete()
        .eq('id', ruleId)
        .eq('workspace_id', activeId); // Garantia extra

      if (error) throw error;

      setAiFollowUpRules(prev => prev.filter(r => r.id !== ruleId));
    } catch (err: any) {
      console.error('deleteAiFollowUpRule: Erro -', err);
      throw new Error(err.message || 'Falha ao deletar regra de follow-up');
    }
  }, [getActiveWorkspaceIdInternal]);

  // Função para trocar de workspace (navegação)
  const switchWorkspace = useCallback((workspaceSlug: string) => {
    router.push(`/workspace/${workspaceSlug}`);
  }, [router]);

  // Função para refresh manual da lista
  const refreshWorkspaces = useCallback(async () => {
    await fetchWorkspaceList();
  }, [fetchWorkspaceList]);

  // Combina loadings para a UI geral
  const isLoading = isLoadingList || isLoadingCurrent;

  // Valor final do Contexto
  const contextValue = {
    workspace,
    workspaces,
    isLoading,
    error,
    switchWorkspace,
    refreshWorkspaces,
    clearError,

    // Operações de Workspace
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,

    // Estado e Operações das Regras
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

export default WorkspaceProvider;