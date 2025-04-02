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
import { useSession, SessionContextValue } from 'next-auth/react'; // Importar SessionContextValue se precisar tipar useSession
import axios from 'axios';

// Definindo um tipo mais preciso para os dados de atualização
type WorkspaceUpdateData = {
  name?: string;
  slug?: string;
  lumibot_account_id?: string | null;
  lumibot_api_token?: string | null; // Note: O token só deve ser enviado se for alterado
  ai_default_system_prompt?: string | null;
  ai_model_preference?: string | null;
};

// Tipo Workspace (incluindo campos de integração/IA e usando Date)
type Workspace = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: Date; // Usar Date
  updated_at: Date; // Usar Date
  owner?: {
    id: string;
    name: string | null;
    email: string;
  };
  _count?: {
    members: number;
  };
  lumibot_account_id?: string | null;
  lumibot_api_token?: string | null; // Não populado pelo GET
  ai_model_preference?: string | null;
  ai_default_system_prompt?: string | null;
};

// Tipo para o valor do Contexto
type WorkspaceContextType = {
  workspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean; // Loading geral para a UI
  error: string | null;
  switchWorkspace: (workspaceSlug: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  updateWorkspace: (id: string, data: WorkspaceUpdateData) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  clearError: () => void;
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
  const { data: session, status }: SessionContextValue = useSession(); // Tipagem opcional
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  // Estados Internos
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentSlugRef = useRef<string | null>(null);

  // Atualiza a ref do slug quando params muda
  useEffect(() => {
    currentSlugRef.current = params?.slug as string | null ?? null;
    console.log(`Slug Ref updated: ${currentSlugRef.current}`);
  }, [params?.slug]);

  // Função para limpar erros
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // --- Extrair valores primitivos estáveis da sessão ---
  const userId = session?.user?.id;
  const userIsSuperAdmin = !!session?.user?.isSuperAdmin; // Converte para boolean

  // --- useEffect para BUSCAR A LISTA de workspaces ---
  useEffect(() => {
    // Usar as variáveis userId e userIsSuperAdmin definidas fora
    if (status === 'loading') {
      console.log("List Effect: Session loading, setting loading true.");
      setIsLoadingList(true); // Mantém loading da lista ativo
      setWorkspaces([]); // Garante lista vazia enquanto carrega
      return;
    }
    if (status === 'unauthenticated' || !userId) {
      console.log("List Effect: Unauthenticated or no userId, clearing list and stopping loading.");
      setWorkspaces([]);
      setIsLoadingList(false);
      setWorkspace(null); // Limpa também o workspace ativo
      setError(null);     // Limpa erros
      return;
    }

    // Se autenticado e com userId
    let isMounted = true;
    console.log("List Effect: Authenticated (userId:", userId, "isSuperAdmin:", userIsSuperAdmin,"), fetching list...");
    setIsLoadingList(true);
    setError(null); // Limpa erro antes de buscar

    const fetchList = async () => {
      const endpoint = userIsSuperAdmin ? '/api/workspaces/all' : '/api/workspaces';
      try {
        const response = await axios.get<Workspace[]>(endpoint, { headers: { 'Cache-Control': 'no-cache' } });
        if (!isMounted) return;
        const fetchedWorkspaces = response.data.map(ws => ({
          ...ws,
          created_at: new Date(ws.created_at),
          updated_at: new Date(ws.updated_at),
        }));
        console.log('List Effect: Fetched', fetchedWorkspaces.length, 'workspaces');
        setWorkspaces(fetchedWorkspaces); // Atualiza o estado da lista
      } catch (err: any) {
        console.error('List Effect: Error fetching list -', err);
        const message = err.response?.data?.message || err.message || 'Falha ao carregar workspaces';
        if (isMounted) setError(message);
        if (isMounted) setWorkspaces([]);
      } finally {
        if (isMounted) setIsLoadingList(false); // Finaliza o loading da *lista*
      }
    };

    fetchList();

    return () => { isMounted = false; console.log("List Effect: Cleanup.") };

  // Depende apenas de status, userId e userIsSuperAdmin (estáveis após login)
  }, [status, userId, userIsSuperAdmin]);


  // --- useEffect para DEFINIR O WORKSPACE ATUAL ---
  useEffect(() => {
    const slug = currentSlugRef.current;
    console.log(`Current Wks Effect: Path=${pathname}, Slug=${slug}, List Loading=${isLoadingList}, List Size=${workspaces.length}`);

    // Se a lista ainda está carregando, espera
    if (isLoadingList) {
      console.log("Current Wks Effect: List loading, waiting...");
      setIsLoadingCurrent(true); // Indica que está dependente da lista
      setWorkspace(null);      // Garante que não há workspace antigo
      return;
    }

    // Se a lista já carregou (mesmo que vazia)
    setIsLoadingCurrent(true); // Inicia a tentativa de definir o workspace atual

    if (!slug || !pathname?.startsWith('/workspace/')) {
      console.log("Current Wks Effect: No slug or not on /workspace route, clearing active workspace.");
      setWorkspace(null);
      if (typeof window !== 'undefined') sessionStorage.removeItem('activeWorkspaceId');
      setError(null); // Limpa erro se saiu da rota de workspace
    } else {
      const found = workspaces.find(w => w.slug === slug);
      if (found) {
        console.log(`Current Wks Effect: Found workspace: ${found.name}`);
        setWorkspace({
            ...found,
            created_at: new Date(found.created_at),
            updated_at: new Date(found.updated_at),
        });
        if (typeof window !== 'undefined') sessionStorage.setItem('activeWorkspaceId', found.id);
        // setError(null); // Não limpa erro aqui, pode haver erro da lista
      } else {
        // A lista carregou, mas o slug não foi encontrado
        console.warn(`Current Wks Effect: Slug '${slug}' not found in the loaded list. Setting error.`);
        // Só define erro se não houver um erro anterior da lista
        setError(prevError => prevError || `Workspace "${slug}" não encontrado ou acesso negado.`);
        setWorkspace(null);
        if (typeof window !== 'undefined') sessionStorage.removeItem('activeWorkspaceId');
      }
    }
    setIsLoadingCurrent(false); // Termina o processo de definir o workspace atual

  // Depende da lista, pathname e do estado de loading da lista
  }, [workspaces, pathname, isLoadingList, setError, setWorkspace]); // Removido params?.slug


  // --- Funções de Ação (Mutations) ---

  // Função para trocar de workspace
  const switchWorkspace = useCallback((workspaceSlug: string) => {
    const targetWorkspace = workspaces.find(w => w.slug === workspaceSlug);
    if (!targetWorkspace) {
      setError('Workspace não encontrado para troca');
      return;
    }
    console.log(`Switching to workspace: ${targetWorkspace.name}`);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('activeWorkspaceId', targetWorkspace.id);
    }
    setWorkspace({
        ...targetWorkspace,
        created_at: new Date(targetWorkspace.created_at),
        updated_at: new Date(targetWorkspace.updated_at),
    });
    router.push(`/workspace/${workspaceSlug}`);
  }, [workspaces, router]);

  // Função para criar workspace
  const createWorkspace = useCallback(async (name: string): Promise<Workspace> => {
    console.log(`createWorkspace: Creating '${name}'`);
    setError(null);
    // setIsLoadingList(true); // Pode indicar loading se quiser
    try {
      const response = await axios.post<Workspace>('/api/workspaces', { name });
      const newWorkspaceData = response.data;
      const newWorkspace = {
          ...newWorkspaceData,
          created_at: new Date(newWorkspaceData.created_at),
          updated_at: new Date(newWorkspaceData.updated_at),
      };
      // Atualiza a lista localmente
      setWorkspaces(prev => [...prev, newWorkspace]);
      console.log(`createWorkspace: Success - ID: ${newWorkspace.id}.`);
      // Poderia chamar refreshWorkspaces aqui se a API não retornar todos os dados necessários
      return newWorkspace;
    } catch (err: any) {
      console.error('createWorkspace: Error -', err);
      const message = err.response?.data?.message || err.message || 'Falha ao criar workspace';
      setError(message);
      throw new Error(message);
    } finally {
       // setIsLoadingList(false);
    }
  }, []); // Sem dependências externas diretas que mudam frequentemente

  // Função para atualizar workspace
  const updateWorkspace = useCallback(async (id: string, data: WorkspaceUpdateData): Promise<Workspace> => {
    console.log(`updateWorkspace: Updating ${id} with:`, data);
    setError(null);
    // setIsLoadingCurrent(true); // Pode indicar loading
    try {
      const response = await axios.patch<Workspace>(`/api/workspaces/${id}`, data);
      const updatedWorkspaceData = response.data;
      const updatedWorkspace = {
          ...updatedWorkspaceData,
          created_at: new Date(updatedWorkspaceData.created_at),
          updated_at: new Date(updatedWorkspaceData.updated_at),
      };

      // Atualiza a lista geral
      setWorkspaces(prev =>
        prev.map(w => (w.id === id ? { ...w, ...updatedWorkspace } : w))
      );

      // Atualiza o workspace ativo se for o caso
      if (workspace?.id === id) {
        console.log("updateWorkspace: Updating active workspace state.");
        setWorkspace(prev => prev ? { ...prev, ...updatedWorkspace } : null);
      }

      console.log(`updateWorkspace: Success - ${id}.`);
      // Poderia chamar refreshWorkspaces aqui

      // Redireciona se o slug mudou
      if (data.slug && data.slug !== workspace?.slug) {
         console.log(`updateWorkspace: Slug changed to ${data.slug}, redirecting...`);
        router.push(`/workspace/${data.slug}`);
      }
      return updatedWorkspace;
    } catch (err: any) {
      console.error(`updateWorkspace: Error updating ${id} -`, err);
      const message = err.response?.data?.message || err.message || 'Falha ao atualizar workspace';
      setError(message);
      throw new Error(message);
    } finally {
       // setIsLoadingCurrent(false);
    }
  }, [workspace, router, setWorkspace, setWorkspaces]); // Adicionado setWorkspace e setWorkspaces

  // Função para deletar workspace
  const deleteWorkspace = useCallback(async (id: string): Promise<void> => {
    console.log(`deleteWorkspace: Deleting ${id}`);
    setError(null);
    try {
      await axios.delete(`/api/workspaces/${id}`);
      const wasCurrentWorkspace = workspace?.id === id;

      // Atualiza a lista
      setWorkspaces(prev => prev.filter(w => w.id !== id));
      // Limpa o workspace atual se foi ele o deletado
      if (wasCurrentWorkspace) {
        setWorkspace(null);
        if (typeof window !== 'undefined') sessionStorage.removeItem('activeWorkspaceId');
      }
      console.log(`deleteWorkspace: Success - ${id}.`);
      // Poderia chamar refreshWorkspaces aqui

      // Redireciona se o workspace ativo foi deletado
      if (wasCurrentWorkspace) {
        router.push('/workspaces');
      }
    } catch (err: any) {
      console.error(`deleteWorkspace: Error deleting ${id} -`, err);
      const message = err.response?.data?.message || err.message || 'Falha ao excluir workspace';
      setError(message);
      throw new Error(message);
    }
  }, [workspace, router, setWorkspace, setWorkspaces]); // Adicionado setWorkspace e setWorkspaces


  // Função para refresh manual/programático
   const refreshWorkspaces = useCallback(async (): Promise<void> => {
       console.log("refreshWorkspaces: Triggered.");
       setIsLoadingList(true);
       setIsLoadingCurrent(true); // Indica que ambos podem mudar
       setError(null);
       const currentSlug = currentSlugRef.current;

       // Re-executa a lógica de busca da lista
       const isSuperAdmin = session?.user?.isSuperAdmin;
       const endpoint = isSuperAdmin ? '/api/workspaces/all' : '/api/workspaces';
       try {
           const response = await axios.get<Workspace[]>(endpoint, { headers: { 'Cache-Control': 'no-cache' } });
           const list = response.data.map(ws => ({
                ...ws,
                created_at: new Date(ws.created_at),
                updated_at: new Date(ws.updated_at),
            }));
           setWorkspaces(list || []);

           // Re-avalia o workspace atual com a nova lista
            if (!currentSlug || !pathname?.startsWith('/workspace/')) {
                setWorkspace(null);
                if (typeof window !== 'undefined') sessionStorage.removeItem('activeWorkspaceId');
            } else {
                const found = list.find(w => w.slug === currentSlug);
                if (found) {
                    setWorkspace({...found, created_at: new Date(found.created_at), updated_at: new Date(found.updated_at)});
                    if (typeof window !== 'undefined') sessionStorage.setItem('activeWorkspaceId', found.id);
                } else {
                    setError(`Workspace "${currentSlug}" não encontrado ou acesso negado.`);
                    setWorkspace(null);
                    if (typeof window !== 'undefined') sessionStorage.removeItem('activeWorkspaceId');
                }
            }

       } catch (err: any) {
           console.error("refreshWorkspaces: Error", err);
           const message = err.response?.data?.message || err.message || 'Falha ao atualizar workspaces';
           setError(message);
           setWorkspaces([]); // Limpa tudo em caso de erro no refresh
           setWorkspace(null);
       } finally {
           setIsLoadingList(false);
           setIsLoadingCurrent(false);
       }
   }, [pathname, session?.user?.isSuperAdmin]); // Dependências estáveis


  // Combina os loadings para a UI
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
    clearError
  };

  // Renderiza o Provider
  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};