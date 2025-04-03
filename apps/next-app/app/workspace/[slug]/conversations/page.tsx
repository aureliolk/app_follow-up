// apps/next-app/app/workspace/[slug]/conversations/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWorkspace } from '@/context/workspace-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConversationList from './components/ConversationList';
import ConversationDetail from './components/ConversationDetail';
import type { ClientConversation } from '@/app/types'; // Importa o tipo de conversa para a lista

export default function ConversationsPage() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [conversations, setConversations] = useState<ClientConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ClientConversation | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Inicia como true para carregamento inicial
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async (wsId: string) => {
    // Só define loading true se já não estiver carregando o workspace
    if (!workspaceLoading) {
        setIsLoading(true);
    }
    setError(null); // Limpa erro anterior
    console.log(`[ConversationsPage] Buscando conversas para workspace: ${wsId}`);
    try {
      const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
        '/api/conversations', // Rota da API
        { params: { workspaceId: wsId } }
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Falha ao carregar conversas da API.');
      }
      console.log(`[ConversationsPage] ${response.data.data.length} conversas carregadas.`);
      setConversations(response.data.data);

    } catch (err: any) {
      console.error("[ConversationsPage] Erro ao buscar conversas:", err);
      const message = err.response?.data?.error || err.message || 'Erro ao buscar conversas.';
      setError(message);
      setConversations([]); // Limpa em caso de erro
    } finally {
       // Só termina o loading se o workspace também já carregou
      if (!workspaceLoading) {
         setIsLoading(false);
      }
    }
  }, [workspaceLoading]); // Depende do workspaceLoading para evitar race condition

  useEffect(() => {
    // Se workspace estiver pronto e tiver ID, busca as conversas
    if (workspace?.id && !workspaceLoading) {
        fetchConversations(workspace.id);
    } else if (!workspaceLoading && !workspace) {
         // Se terminou de carregar workspace e não encontrou, para o loading da página e mostra erro
         setIsLoading(false);
         setError(workspaceError || 'Workspace não disponível ou acesso negado.');
         setConversations([]); // Garante que a lista está vazia
    } else if (workspaceLoading) {
        // Se o workspace ainda está carregando, mantém o loading da página ativo
        setIsLoading(true);
        setConversations([]); // Limpa conversas enquanto workspace carrega
    }
     // Cleanup: Pode cancelar requisições axios se necessário
    // return () => { controller?.abort(); };
  }, [workspace?.id, workspaceLoading, workspaceError, fetchConversations]);

  const handleSelectConversation = (conversation: ClientConversation) => {
    console.log("[ConversationsPage] Conversa selecionada:", conversation.id);
    setSelectedConversation(conversation);
  };

  // --- Renderização Condicional ---
  // Mostra loading se a página ou o workspace estiverem carregando
  if (isLoading || workspaceLoading) {
    return (
        <div className="flex justify-center items-center h-[calc(100vh-var(--header-height,10rem))] p-6">
             <LoadingSpinner message="Carregando dados..." />
        </div>
    );
  }

  // Mostra erro da página ou do workspace
  const displayError = error || workspaceError;
  if (displayError) {
      return (
          <div className="p-6">
              <ErrorMessage message={displayError} onDismiss={() => setError(null)} />
          </div>
      );
  }

  // Renderização principal (Layout de 2 colunas)
  return (
    <div className="flex h-full"> {/* Ajusta altura descontando header e footer do workspace */}
      {/* Coluna Esquerda - Lista */}
      <div className="w-full md:w-1/3 lg:w-1/4 border-r border-border overflow-y-auto bg-card/50 dark:bg-background"> {/* Fundo ligeiramente diferente */}
        <ConversationList
          conversations={conversations}
          onSelectConversation={handleSelectConversation}
          selectedConversationId={selectedConversation?.id}
        />
         {/* Mostra mensagem se a lista estiver vazia APÓS o loading */}
         {!isLoading && conversations.length === 0 && !error && (
             <div className="p-4 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada neste workspace.
             </div>
         )}
      </div>

      {/* Coluna Direita - Detalhes */}
      <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
        {/* Passa a conversa selecionada */}
        <ConversationDetail conversation={selectedConversation} />
      </div>
    </div>
  );
}