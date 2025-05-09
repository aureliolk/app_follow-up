// context/client-context.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { useWorkspace } from './workspace-context'; // Para obter workspaceId padrão
import type { Client, ClientFormData } from '../app/types'; // Importar tipos

// Definição da resposta da API para clientes (com paginação)
interface ClientsApiResponse {
  data: Client[];
  hasMore: boolean;
  total?: number;
  page?: number;
  limit?: number;
}

// Tipo para o valor do Contexto
interface ClientContextType {
  clients: Client[];
  loadingClients: boolean;
  isLoadingMoreClients: boolean; // Para o spinner de "carregar mais"
  clientsError: string | null;
  hasMoreClients: boolean; // Indica se há mais clientes para carregar
  fetchClients: (workspaceId: string, searchTerm?: string, page?: number, limit?: number, append?: boolean) => Promise<void>; // Modificado
  createClient: (data: ClientFormData, workspaceId?: string) => Promise<Client>;
  updateClient: (clientId: string, data: ClientFormData, workspaceId?: string) => Promise<Client>;
  deleteClient: (clientId: string, workspaceId?: string) => Promise<void>;
  clearClientsError: () => void;
}

// Criação do Contexto
const ClientContext = createContext<ClientContextType | undefined>(undefined);

// Hook de Acesso ao Contexto
export const useClient = (): ClientContextType => {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClient deve ser usado dentro de um ClientProvider');
  }
  return context;
};

// Função auxiliar para obter workspaceId (do contexto ou storage)
const getContextWorkspaceId = (workspaceCtx: any, providedId?: string): string | null => {
    if (providedId) return providedId;
    if (workspaceCtx?.workspace?.id) return workspaceCtx.workspace.id;
    if (typeof window !== 'undefined') return sessionStorage.getItem('activeWorkspaceId');
    return null;
};


// Provider Component
export const ClientProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const workspaceContext = useWorkspace(); // Usar o contexto do workspace
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false); // Loading principal (primeira carga/nova busca)
  const [isLoadingMoreClients, setIsLoadingMoreClients] = useState(false); // Loading para paginação
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [hasMoreClients, setHasMoreClients] = useState(true); // Estado para controlar paginação

  const clearClientsError = useCallback(() => setClientsError(null), []);

  // Função para buscar clientes com paginação e busca
  const fetchClients = useCallback(async (
    providedWorkspaceId?: string, 
    searchTerm: string = '',
    page: number = 1,
    limit: number = 20, // Default limit
    append: boolean = false // Se true, anexa aos clientes existentes
  ): Promise<void> => {
    const wsId = getContextWorkspaceId(workspaceContext, providedWorkspaceId);
    if (!wsId) {
      const errorMsg = 'Workspace ID não encontrado para buscar clientes.';
      console.error("fetchClients Error:", errorMsg);
      setClientsError(errorMsg);
      setClients([]);
      setHasMoreClients(false);
      setLoadingClients(false);
      setIsLoadingMoreClients(false);
      return;
    }

    console.log(`ClientContext: Fetching clients for workspace ${wsId}, search: "${searchTerm}", page: ${page}, limit: ${limit}, append: ${append}`);
    
    if (append) {
      setIsLoadingMoreClients(true);
    } else {
      setLoadingClients(true); // Loading principal para nova busca ou primeira página
      setClients([]); // Limpa clientes atuais se não for para anexar (nova busca/página 1)
      setHasMoreClients(true); // Reseta hasMoreClients em uma nova busca
    }
    setClientsError(null);

    try {
      const params = new URLSearchParams({
        workspaceId: wsId,
        search: searchTerm,
        page: String(page),
        limit: String(limit),
      });
      const response = await axios.get<ClientsApiResponse>(`/api/clients?${params.toString()}`);
      
      // A API agora deve retornar um objeto com { data: Client[], hasMore: boolean }
      const { data: fetchedClientsList, hasMore } = response.data;

      console.log(`ClientContext: Fetched ${fetchedClientsList.length} clients. HasMore: ${hasMore}`);
      
      if (append) {
        setClients(prevClients => [...prevClients, ...fetchedClientsList]);
      } else {
        setClients(fetchedClientsList);
      }
      setHasMoreClients(hasMore);

    } catch (error: any) {
      console.error('ClientContext: Error fetching clients:', error);
      const message = error.response?.data?.error || error.message || 'Erro ao buscar clientes';
      setClientsError(message);
      // Em caso de erro, considera que não há mais clientes para evitar loops
      setHasMoreClients(false); 
      // Não limpar clients aqui para não apagar o que já foi carregado em caso de erro no "load more"
    } finally {
      setLoadingClients(false);
      setIsLoadingMoreClients(false);
    }
  }, [workspaceContext]); 


  // Função para criar cliente
  const createClient = useCallback(async (data: ClientFormData, workspaceId?: string): Promise<Client> => {
     const wsId = getContextWorkspaceId(workspaceContext, workspaceId);
     if (!wsId) {
        throw new Error('Workspace ID é necessário para criar um cliente');
     }
     console.log(`ClientContext: Creating client in workspace ${wsId}`);
     setClientsError(null); // Limpa erro antes de tentar
     try {
        const clientData = { ...data, workspaceId: wsId };
        const response = await axios.post('/api/clients', clientData);
        if (!response.data.success) {
            throw new Error(response.data.error || 'Falha ao criar cliente');
        }
        const newClient = response.data.data;
        console.log(`ClientContext: Client created ${newClient.id}. Refreshing list...`);
        // Atualiza a lista localmente ou busca novamente
        // fetchClients(wsId); // Comentado para evitar recarga total. Adicionar na lista é melhor.
        // Ao criar um novo cliente, idealmente ele deveria aparecer no topo.
        // Se estivermos paginando, uma recarga da primeira página pode ser necessária ou adicionar localmente.
        setClients(prev => [newClient, ...prev]); 
        // TODO: Considerar se a paginação/busca ativa deve ser resetada ou a primeira página recarregada.
        // Por ora, apenas adiciona ao topo da lista atual.
        return newClient;
     } catch (error: any) {
        console.error('ClientContext: Error creating client:', error);
        const message = error.response?.data?.error || error.message || 'Erro ao criar cliente';
        setClientsError(message);
        throw new Error(message);
     }
  }, [workspaceContext, fetchClients]);

  // Função para atualizar cliente
  const updateClient = useCallback(async (clientId: string, data: ClientFormData, workspaceId?: string): Promise<Client> => {
     const wsId = getContextWorkspaceId(workspaceContext, workspaceId);
     if (!wsId) {
         throw new Error('Workspace ID é necessário para atualizar um cliente');
     }
     console.log(`ClientContext: Updating client ${clientId} in workspace ${wsId}`);
     setClientsError(null);
     try {
        const clientData = { ...data, workspaceId: wsId }; // Inclui workspaceId para validação na API
        const response = await axios.put(`/api/clients/${clientId}`, clientData);
         if (!response.data.success) {
            throw new Error(response.data.error || 'Falha ao atualizar cliente');
        }
        const updatedClient = response.data.data;
        console.log(`ClientContext: Client updated ${updatedClient.id}. Refreshing list...`);
         // Atualiza a lista localmente ou busca novamente
        // fetchClients(wsId); // Comentado.
        setClients(prev => prev.map(c => c.id === clientId ? updatedClient : c));
        // TODO: Se a ordem/filtros forem afetados, uma recarga da view atual pode ser necessária.
        return updatedClient;
     } catch (error: any) {
        console.error('ClientContext: Error updating client:', error);
        const message = error.response?.data?.error || error.message || 'Erro ao atualizar cliente';
        setClientsError(message);
        throw new Error(message);
     }
  }, [workspaceContext, fetchClients]);

  // Função para excluir cliente
  const deleteClient = useCallback(async (clientId: string, workspaceId?: string): Promise<void> => {
     const wsId = getContextWorkspaceId(workspaceContext, workspaceId);
     if (!wsId) {
        throw new Error('Workspace ID é necessário para excluir um cliente');
     }
     console.log(`ClientContext: Deleting client ${clientId} from workspace ${wsId}`);
     setClientsError(null);
     try {
        const response = await axios.delete(`/api/clients/${clientId}?workspaceId=${wsId}`);
         if (!response.data.success) {
            throw new Error(response.data.error || 'Falha ao excluir cliente');
        }
        console.log(`ClientContext: Client deleted ${clientId}. Refreshing list...`);
         // Atualiza a lista localmente ou busca novamente
        // fetchClients(wsId); // Comentado.
        setClients(prev => prev.filter(c => c.id !== clientId));
        // TODO: Após deletar, a contagem total muda, o que pode afetar a paginação.
        // Uma recarga da view atual ou ajuste na paginação pode ser necessário.
     } catch (error: any) {
        console.error('ClientContext: Error deleting client:', error);
        const message = error.response?.data?.error || error.message || 'Erro ao excluir cliente';
        setClientsError(message);
        throw new Error(message);
     }
  }, [workspaceContext, fetchClients]);


  // Valores do contexto
  const contextValue: ClientContextType = {
    clients,
    loadingClients,
    isLoadingMoreClients, // Adicionado
    clientsError,
    hasMoreClients, // Adicionado
    fetchClients,
    createClient,
    updateClient,
    deleteClient,
    clearClientsError,
  };

  return (
    <ClientContext.Provider value={contextValue}>
      {children}
    </ClientContext.Provider>
  );
};