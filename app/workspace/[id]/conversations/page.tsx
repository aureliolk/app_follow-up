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

// Define a type for the filter values
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

  // State for the new AI filter
  const [aiFilter, setAiFilter] = useState<AiFilterType>('all');

  useEffect(() => {
    const wsId = workspace?.id;
    if (wsId && !workspaceLoading) {
      const currentFilter = 'ATIVAS';
      console.log(`[ConversationsPage] useEffect (initial): Fetching via context for wsId ${wsId} with filter ${currentFilter}`);
      fetchConversations(currentFilter, wsId);
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

  // Filter conversations based on aiFilter
  const filteredConversations = conversations.filter(convo => {
    if (aiFilter === 'human') {
      return convo.is_ai_active === false;
    }
    if (aiFilter === 'ai') {
      return convo.is_ai_active === true;
    }
    return true; // 'all' or any other case
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-grow overflow-hidden">
        <div className="w-full md:w-1/3 lg:w-1/4 border-r border-border overflow-y-auto bg-card/50 dark:bg-background flex-shrink-0">
          {/* Filter Buttons */}
          <div className="p-2 border-b border-border">
            <div className="flex space-x-1">
              <Button
                variant={aiFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('all')}
                className="flex-1"
              >
                Todos
              </Button>
              <Button
                variant={aiFilter === 'human' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('human')}
                className="flex-1"
              >
                Humanos
              </Button>
              <Button
                variant={aiFilter === 'ai' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('ai')}
                className="flex-1"
              >
                IA
              </Button>
            </div>
          </div>
          <ConversationList
            conversations={filteredConversations}
            onSelectConversation={handleSelectConversation}
            selectedConversationId={selectedConversation?.id}
          />
        </div>

        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
          <ConversationDetail />
        </div>
      </div>
    </div>
  );
}