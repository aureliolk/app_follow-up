// context/trigger-context.tsx
'use client';

import React, { createContext, useState, useContext, useCallback, ReactNode, useEffect } from 'react';
import type { Trigger, TriggerFormData } from '@/app/types';
import { useWorkspace } from './workspace-context'; // Para obter workspaceId
import { toast } from 'react-hot-toast';

// --- Interfaces ---
interface TriggerContextType {
  triggers: Trigger[];
  loadingTriggers: boolean;
  triggersError: string | null;
  fetchTriggers: (workspaceId: string) => Promise<void>;
  createTrigger: (formData: TriggerFormData) => Promise<Trigger | null>; // Retorna o trigger criado ou null em erro
  updateTrigger: (triggerId: string, formData: TriggerFormData) => Promise<Trigger | null>; // Retorna o trigger atualizado ou null em erro
  deleteTrigger: (triggerId: string) => Promise<boolean>; // Retorna true se sucesso, false se erro
}

// --- Contexto ---
const TriggerContext = createContext<TriggerContextType | undefined>(undefined);

// --- Provider ---
interface TriggerProviderProps {
  children: ReactNode;
}

export const TriggerProvider: React.FC<TriggerProviderProps> = ({ children }) => {
  const { workspace } = useWorkspace(); // Pega o workspace atual
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState<boolean>(false);
  const [triggersError, setTriggersError] = useState<string | null>(null);

  // --- Funções CRUD (Stubs/Exemplos) ---

  const fetchTriggers = useCallback(async (workspaceId: string) => {
    if (!workspaceId) {
      setTriggersError("ID do Workspace é necessário para buscar triggers.");
      setTriggers([]);
      return;
    }
    console.log(`[TriggerContext] Fetching triggers for workspace: ${workspaceId}`);
    setLoadingTriggers(true);
    setTriggersError(null);
    try {
      // --- TODO: Implementar chamada real (API Route ou Server Action) ---
      // Exemplo com API Route:
      // const response = await fetch(`/api/workspaces/${workspaceId}/triggers`);
      // if (!response.ok) throw new Error('Falha ao buscar triggers');
      // const data: Trigger[] = await response.json();
      // setTriggers(data);

      // Simulação:
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simular delay
      // const simulatedData: Trigger[] = []; // Simular vazio
      // setTriggers(simulatedData);
      console.warn("[TriggerContext] fetchTriggers: Implementação de busca real pendente.");
      setTriggers([]); // Definir como vazio por enquanto

    } catch (err: any) {
      console.error("[TriggerContext] Error fetching triggers:", err);
      const message = err.message || "Erro desconhecido ao buscar triggers.";
      setTriggersError(message);
      setTriggers([]);
      toast.error(`Erro ao buscar triggers: ${message}`);
    } finally {
      setLoadingTriggers(false);
    }
  }, []);

  const createTrigger = useCallback(async (formData: TriggerFormData): Promise<Trigger | null> => {
    if (!workspace?.id) {
      toast.error("Workspace não encontrado para criar trigger.");
      return null;
    }
    console.log("[TriggerContext] Creating trigger:", formData);
    // setLoadingTriggers(true); // Opcional: Mostrar loading na lista durante criação?
    try {
      // --- TODO: Implementar chamada real (API Route ou Server Action) ---
      // Exemplo com Server Action:
      // const newTrigger = await createTriggerAction(workspace.id, formData);
      // fetchTriggers(workspace.id); // Re-busca a lista
      // return newTrigger;

      console.warn("[TriggerContext] createTrigger: Implementação de criação real pendente.");
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simular delay
      // Simular sucesso:
      const simulatedNewTrigger: Trigger = {
         ...formData,
         id: `new_${Date.now()}`,
         workspaceId: workspace.id,
         createdAt: new Date(),
         updatedAt: new Date(),
       };
      setTriggers(prev => [...prev, simulatedNewTrigger]); // Adiciona na UI otimisticamente?
      toast.success("Trigger criado (simulado)!");
      return simulatedNewTrigger; // Retorna o trigger simulado

    } catch (err: any) {
      console.error("[TriggerContext] Error creating trigger:", err);
      const message = err.message || "Erro desconhecido ao criar trigger.";
      setTriggersError(message); // Opcional: erro global?
      toast.error(`Erro ao criar trigger: ${message}`);
      return null;
    } finally {
      // setLoadingTriggers(false);
    }
  }, [workspace, fetchTriggers]); // fetchTriggers se precisar rebuscar

  const updateTrigger = useCallback(async (triggerId: string, formData: TriggerFormData): Promise<Trigger | null> => {
    if (!workspace?.id) {
      toast.error("Workspace não encontrado para atualizar trigger.");
      return null;
    }
    if (!triggerId) {
      toast.error("ID do Trigger é necessário para atualizar.");
      return null;
    }
    console.log(`[TriggerContext] Updating trigger ${triggerId}:`, formData);
    // setLoadingTriggers(true); // Opcional
    try {
      // --- TODO: Implementar chamada real ---
      // const updatedTrigger = await updateTriggerAction(triggerId, formData);
      // fetchTriggers(workspace.id);
      // return updatedTrigger;

      console.warn("[TriggerContext] updateTrigger: Implementação de atualização real pendente.");
      await new Promise(resolve => setTimeout(resolve, 1000));
      const simulatedUpdatedTrigger: Trigger = {
        ...formData,
        id: triggerId,
        workspaceId: workspace.id, // Manter workspaceId
        createdAt: triggers.find(t => t.id === triggerId)?.createdAt || new Date(), // Manter data original
        updatedAt: new Date(),
      };
      setTriggers(prev => prev.map(t => t.id === triggerId ? simulatedUpdatedTrigger : t));
      toast.success("Trigger atualizado (simulado)!");
      return simulatedUpdatedTrigger;

    } catch (err: any) {
      console.error(`[TriggerContext] Error updating trigger ${triggerId}:`, err);
      const message = err.message || "Erro desconhecido ao atualizar trigger.";
      setTriggersError(message);
      toast.error(`Erro ao atualizar trigger: ${message}`);
      return null;
    } finally {
      // setLoadingTriggers(false);
    }
  }, [workspace, triggers, fetchTriggers]);

  const deleteTrigger = useCallback(async (triggerId: string): Promise<boolean> => {
    if (!workspace?.id) {
      toast.error("Workspace não encontrado para excluir trigger.");
      return false;
    }
    if (!triggerId) {
       toast.error("ID do Trigger é necessário para excluir.");
       return false;
    }
    console.log(`[TriggerContext] Deleting trigger ${triggerId}`);
    // Considerar estado de loading específico para o item?
    try {
      // --- TODO: Implementar chamada real ---
      // await deleteTriggerAction(triggerId);
      // fetchTriggers(workspace.id);
      // return true;

      console.warn("[TriggerContext] deleteTrigger: Implementação de exclusão real pendente.");
      await new Promise(resolve => setTimeout(resolve, 1000));
      setTriggers(prev => prev.filter(t => t.id !== triggerId));
      toast.success("Trigger excluído (simulado)!");
      return true;

    } catch (err: any) {
      console.error(`[TriggerContext] Error deleting trigger ${triggerId}:`, err);
      const message = err.message || "Erro desconhecido ao excluir trigger.";
      setTriggersError(message);
      toast.error(`Erro ao excluir trigger: ${message}`);
      return false;
    } finally {
      // setLoadingTriggers(false);
    }
  }, [workspace, fetchTriggers]);

  // Efeito para buscar triggers quando o workspace mudar
  useEffect(() => {
    if (workspace?.id) {
      fetchTriggers(workspace.id);
    }
  }, [workspace, fetchTriggers]);

  // --- Valor do Contexto ---
  const contextValue: TriggerContextType = {
    triggers,
    loadingTriggers,
    triggersError,
    fetchTriggers,
    createTrigger,
    updateTrigger,
    deleteTrigger,
  };

  return <TriggerContext.Provider value={contextValue}>{children}</TriggerContext.Provider>;
};

// --- Hook Customizado ---
export const useTrigger = (): TriggerContextType => {
  const context = useContext(TriggerContext);
  if (context === undefined) {
    throw new Error('useTrigger must be used within a TriggerProvider');
  }
  return context;
}; 