// apps/next-app/app/workspace/[slug]/conversations/[[...conversationId]]/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import { useConversationContext } from '@/context/ConversationContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConversationList from '../components/ConversationList';
import ConversationDetail from '../components/ConversationDetail';
import type { ClientConversation } from '@/app/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AiFilterType = 'all' | 'human' | 'ai';

export default function ConversationsPage() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useWorkspace();
  const {
    conversations,
    loadingConversations,
    conversationsError,
    selectedConversation,
    selectConversation,
    fetchConversations
  } = useConversationContext();

  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();

  const [aiFilter, setAiFilter] = useState<AiFilterType>('all');

  const urlConversationId = Array.isArray(params.conversationId) && params.conversationId.length > 0
    ? params.conversationId[0]
    : null;

  useEffect(() => {
    const wsId = workspace?.id;
    if (wsId && !workspaceLoading) {
      const currentFilter = 'ATIVAS';
      console.log(`[ConversationsPage] useEffect (initial): Fetching via context for wsId ${wsId} with filter ${currentFilter}`);
      fetchConversations(currentFilter, wsId);
    }
  }, [workspace?.id, workspaceLoading, fetchConversations]);

  useEffect(() => {
    if (conversations.length > 0 && !loadingConversations) {
      if (urlConversationId) {
        const conversationFromUrl = conversations.find(c => c.id === urlConversationId);
        if (conversationFromUrl && selectedConversation?.id !== urlConversationId) {
          console.log(`[ConversationsPage] Selecting conversation from URL: ${urlConversationId}`);
          selectConversation(conversationFromUrl);
        } else if (!conversationFromUrl) {
          console.warn(`[ConversationsPage] Conversation with ID ${urlConversationId} not found in list. Clearing selection.`);
          selectConversation(null);
          const basePath = `/workspace/${workspace?.id}/conversations`;
          if (pathname !== basePath) router.push(basePath);
        }
      } else if (selectedConversation) {
        // If no ID in URL but a conversation is selected (e.g. from previous state), clear it
        // This might happen if user navigates back from a selected conversation URL
        // selectConversation(null); // Or keep it, depending on desired UX
      }
    }
  }, [urlConversationId, conversations, loadingConversations, selectConversation, selectedConversation, workspace?.id, router, pathname]);

  const handleSelectConversation = useCallback((conversation: ClientConversation | null) => {
    selectConversation(conversation);
    if (!conversation) {
        const basePath = `/workspace/${workspace?.id}/conversations`;
        if (pathname !== basePath && workspace?.id) {
            router.push(basePath);
        }
    }
  }, [selectConversation, router, pathname, workspace?.id]);

  const isLoading = loadingConversations || workspaceLoading;
  const displayError = conversationsError || workspaceError;

  if (isLoading && conversations.length === 0) {
    return <LoadingSpinner message="Carregando conversas..." />
  }
  if (displayError) {
    return <ErrorMessage message={displayError} />
  }

  const filteredConversations = conversations.filter(convo => {
    if (aiFilter === 'human') {
      return convo.is_ai_active === false;
    }
    if (aiFilter === 'ai') {
      return convo.is_ai_active === true;
    }
    return true; 
  });

  const baseConversationsPath = `/workspace/${workspace?.id}/conversations`;

  // Calcular contagens para os filtros
  const countAll = conversations.length;
  const countHuman = conversations.filter(convo => convo.is_ai_active === false).length;
  const countAi = conversations.filter(convo => convo.is_ai_active === true).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-grow overflow-hidden">
        <div className="w-full md:w-1/3 lg:w-1/4 border-r border-border overflow-y-auto bg-card/50 dark:bg-background flex-shrink-0">
          <div className="p-2 border-b border-border">
            <div className="flex space-x-1">
              <Button
                variant={aiFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('all')}
                className="flex-1"
              >
                Todos ({countAll})
              </Button>
              <Button
                variant={aiFilter === 'human' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('human')}
                className="flex-1"
              >
                Humanos ({countHuman})
              </Button>
              <Button
                variant={aiFilter === 'ai' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('ai')}
                className="flex-1"
              >
                IA ({countAi})
              </Button>
            </div>
          </div>
          <ConversationList
            conversations={filteredConversations}
            onSelectConversation={handleSelectConversation}
            selectedConversationId={selectedConversation?.id || urlConversationId}
            basePath={baseConversationsPath} 
          />
        </div>

        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
          <ConversationDetail 
            // Pass conversationId from URL to ConversationDetail if needed for direct loading
            // conversationIdFromUrl={urlConversationId} // Example, if ConversationDetail can fetch its own data
          />
        </div>
      </div>
    </div>
  );
}

