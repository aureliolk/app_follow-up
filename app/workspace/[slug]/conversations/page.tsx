// apps/next-app/app/workspace/[slug]/conversations/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { useConversationContext } from '@/context/ConversationContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConversationList from './components/ConversationList';
import ConversationDetail from './components/ConversationDetail';
import type { ClientConversation } from '@/app/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ConversationsPage() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useWorkspace();
  const {
    conversations,
    loadingConversations,
    conversationsError,
    selectedConversation,
    selectConversation,
    fetchConversations,
    updateOrAddConversationInList
  } = useConversationContext();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const wsId = workspace?.id;
    if (wsId && !workspaceLoading) {
      const currentFilter = 'ATIVAS';
      console.log(`[ConversationsPage] useEffect (initial): Fetching via context for wsId ${wsId} with filter ${currentFilter}`);
      fetchConversations(currentFilter, wsId);
    }
  }, [workspace?.id, workspaceLoading, fetchConversations]);

  useEffect(() => {
    const wsId = workspace?.id;

    if (wsId && !workspaceLoading) {
      console.log(`[ConversationsPage] SSE Effect Setup: Conectando para Workspace ${wsId}`);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(`/api/workspaces/${wsId}/subscribe`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data);
          console.log('[ConversationsPage] SSE Message Received:', eventData);

          // Chamar fetchConversations quando uma nova mensagem (ou atualização) chegar para QUALQUER conversa
          if (eventData.type === 'new_message' || eventData.type === 'conversation_updated') {
            console.log(`[ConversationsPage] SSE Triggering fetchConversations due to event type: ${eventData.type}`);
            // Usar o workspaceId atual para garantir que o fetch use o ID correto,
            // especialmente se o workspace mudar rapidamente (improvável, mas seguro)
            if (wsId) {
              fetchConversations('ATIVAS', wsId); // Ou o filtro atual, se relevante
            } else {
              console.warn('[ConversationsPage] SSE: Tentando chamar fetchConversations sem wsId.');
            }
          }

        } catch (error) { console.error("[ConversationsPage] SSE: Erro ao processar mensagem:", error); }
      };

      eventSource.onerror = (error) => {
        console.error("[ConversationsPage] SSE Error:", error);
        eventSource.close();
        eventSourceRef.current = null;
      };

      eventSource.onopen = () => { console.log(`[ConversationsPage] SSE Connection OPENED para Workspace ${wsId}`); };

      return () => {
        console.log(`[ConversationsPage] SSE Effect Cleanup: Fechando conexão SSE para Workspace ${wsId}`);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };
    }
    else if (eventSourceRef.current) {
      console.log("[ConversationsPage] SSE Effect Cleanup: Workspace ID indisponível, fechando conexão SSE.");
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

  }, [workspace?.id, workspaceLoading, fetchConversations]);

  const handleSelectConversation = useCallback((conversation: ClientConversation | null) => {
    selectConversation(conversation);
  }, [selectConversation]);

  const isLoading = loadingConversations || workspaceLoading;
  const displayError = conversationsError || workspaceError;

  if (isLoading && conversations.length === 0) {
    return <LoadingSpinner message="Carregando conversas..." />
  }
  if (displayError) {
    return <ErrorMessage message={displayError} />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-grow overflow-hidden">
        <div className="w-full md:w-1/3 lg:w-1/4 border-r border-border overflow-y-auto bg-card/50 dark:bg-background flex-shrink-0">
          <ConversationList
            conversations={conversations}
            onSelectConversation={handleSelectConversation}
            selectedConversationId={selectedConversation?.id}
          />
          {!isLoading && conversations.length === 0 && !displayError && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma conversa ativa encontrada.
            </div>
          )}
        </div>

        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
          <div className="text-xs text-muted-foreground">
            ID da conversa: {selectedConversation?.id ?? 'Nenhuma selecionada'}
          </div>
          <ConversationDetail />
        </div>
      </div>
    </div>
  );
}