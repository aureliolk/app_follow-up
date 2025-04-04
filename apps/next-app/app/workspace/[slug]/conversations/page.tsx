// apps/next-app/app/workspace/[slug]/conversations/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWorkspace } from '@/context/workspace-context';
import { useFollowUp } from '@/context/follow-up-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConversationList from './components/ConversationList';
import ConversationDetail from './components/ConversationDetail';
import type { ClientConversation } from '@/app/types';

export default function ConversationsPage() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { selectedConversation, selectConversation } = useFollowUp(); // Obtém do contexto
  const [conversations, setConversations] = useState<ClientConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- CORREÇÃO NO useCallback ---
  const fetchConversations = useCallback(async (wsId: string) => {
    if (!workspaceLoading) { setIsLoading(true); }
    setError(null);
    console.log(`[ConversationsPage] Fetching conversations for workspace: ${wsId}`);
    try {
      const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
        '/api/conversations', { params: { workspaceId: wsId } }
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Falha ao carregar conversas da API.');
      }
      const fetchedConversations = response.data.data;
      console.log(`[ConversationsPage] ${fetchedConversations.length} conversas carregadas.`);
      setConversations(fetchedConversations);

      // A lógica de seleção acontece aqui, mas não depende de estar no useCallback
      const currentSelectedId = selectedConversation?.id; // Pega o ID atual *antes* de chamar selectConversation
      if (!currentSelectedId && fetchedConversations.length > 0) {
          console.log("[ConversationsPage] Auto-selecting first conversation:", fetchedConversations[0].id);
          selectConversation(fetchedConversations[0]);
      } else if (currentSelectedId) {
          const updatedSelected = fetchedConversations.find(c => c.id === currentSelectedId);
          if (!updatedSelected) {
              console.log("[ConversationsPage] Previously selected conversation not found in new list, deselecting.");
              selectConversation(null); // Desmarca se não existe mais
          } else if (JSON.stringify(updatedSelected) !== JSON.stringify(selectedConversation)) {
               // Opcional: Atualiza se os dados mudaram (evita loop se os dados forem idênticos)
               console.log("[ConversationsPage] Updating selected conversation data:", updatedSelected.id);
               selectConversation(updatedSelected);
          }
      }

    } catch (err: any) {
        console.error("[ConversationsPage] Erro ao buscar conversas:", err);
        const message = err.response?.data?.error || err.message || 'Erro ao buscar conversas.';
        setError(message);
        setConversations([]);
        selectConversation(null); // Desmarca em caso de erro
    } finally {
        if (!workspaceLoading) { setIsLoading(false); }
    }
  // <<< REMOVER selectedConversation e selectConversation das dependências >>>
  // A função ainda os acessa do escopo, mas sua referência ficará estável.
  }, [workspaceLoading, workspace?.id]); // Depende do workspaceId (do contexto pai) e seu loading

  // --- CORREÇÃO NO useEffect ---
  useEffect(() => {
    const wsId = workspace?.id; // Pega o ID atual do workspace

    if (wsId && !workspaceLoading) {
        console.log(`[ConversationsPage] useEffect triggered: Fetching for wsId ${wsId}`);
        fetchConversations(wsId);
    } else if (!workspaceLoading && !workspace) {
         console.log("[ConversationsPage] useEffect triggered: Workspace not available.");
         setIsLoading(false);
         setError(workspaceError || 'Workspace não disponível ou acesso negado.');
         setConversations([]);
         selectConversation(null);
    } else if (workspaceLoading) {
        console.log("[ConversationsPage] useEffect triggered: Workspace is loading.");
        setIsLoading(true);
        setConversations([]);
        selectConversation(null);
    }
    // <<< A dependência principal é o workspace.id (ou workspace inteiro) e seu loading >>>
    // fetchConversations agora é estável e não precisa estar aqui se for chamado apenas com base no workspace.id
  }, [workspace?.id, workspaceLoading, workspaceError, selectConversation, fetchConversations]); // Mantenha fetchConversations e selectConversation aqui se precisar garantir que a versão mais recente deles seja usada caso MUDEM (o que não deve acontecer com a correção no useCallback)


  // --- Renderização (Mantida) ---
  if (isLoading || workspaceLoading) { return <LoadingSpinner message="Carregando..." /> }
  const displayError = error || workspaceError;
  if (displayError) { return <ErrorMessage message={displayError} /> }

  return (
    <div className="flex h-full">
      {/* Coluna Esquerda */}
      <div className="w-full md:w-1/3 lg:w-1/4 border-r border-border overflow-y-auto bg-card/50 dark:bg-background">
        <ConversationList
          conversations={conversations}
          onSelectConversation={selectConversation}
          selectedConversationId={selectedConversation?.id}
        />
         {!isLoading && conversations.length === 0 && !error && (
            <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada.
             </div>
         )}
      </div>
      {/* Coluna Direita */}
      <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
        <ConversationDetail />
      </div>
    </div>
  );
}