// context/client-context.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { useWorkspace } from '@/context/workspace-context'; // Para obter workspaceId padrão
import type { Client, ClientFormData } from '@/app/types'; // Importar tipos

// Tipo para o valor do Contexto
interface ClientContextType {
  clients: Client[];
  loadingClients: boolean;
  clientsError: string | null;
  fetchClients: (workspaceId?: string) => Promise<Client[]>;
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
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const clearClientsError = useCallback(() => setClientsError(null), []);

  // Função para buscar clientes
  const fetchClients = useCallback(async (workspaceId?: string): Promise<Client[]> => {
    const wsId = getContextWorkspaceId(workspaceContext, workspaceId);
    if (!wsId) {
      const errorMsg = 'Workspace ID não encontrado para buscar clientes.';
      console.error("fetchClients Error:", errorMsg);
      setClientsError(errorMsg);
      setClients([]); // Limpa a lista
      setLoadingClients(false);
      return []; // Retorna array vazio em caso de erro de ID
    }

    console.log(`ClientContext: Fetching clients for workspace ${wsId}`);
    setLoadingClients(true);
    setClientsError(null);
    try {
      const response = await axios.get(`/api/clients?workspaceId=${wsId}`);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao buscar clientes');
      }
      const fetchedClients = response.data.data || [];
      console.log(`ClientContext: Fetched ${fetchedClients.length} clients.`);
      setClients(fetchedClients);
      return fetchedClients;
    } catch (error: any) {
      console.error('ClientContext: Error fetching clients:', error);
      const message = error.response?.data?.error || error.message || 'Erro ao buscar clientes';
      setClientsError(message);
      setClients([]); // Limpa a lista em caso de erro
      throw new Error(message); // Propaga o erro
    } finally {
      setLoadingClients(false);
    }
  }, [workspaceContext]); // Depende do contexto do workspace


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
        // fetchClients(wsId); // Ou adiciona localmente:
        setClients(prev => [newClient, ...prev]);
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
        // fetchClients(wsId); // Ou atualiza localmente:
        setClients(prev => prev.map(c => c.id === clientId ? updatedClient : c));
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
        // fetchClients(wsId); // Ou remove localmente:
        setClients(prev => prev.filter(c => c.id !== clientId));
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
    clientsError,
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