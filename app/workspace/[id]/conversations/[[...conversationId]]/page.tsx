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
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONVERSATIONS_PER_PAGE = 20;

type AiFilterType = 'all' | 'human' | 'ai';

export default function ConversationsPage() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useWorkspace();
  const {
    conversations,
    loadingConversations,
    isLoadingMoreConversations,
    hasMoreConversations,
    conversationsError,
    selectedConversation,
    selectConversation,
    fetchConversations,
    loadMoreConversations,
    conversationCounts
  } = useConversationContext();

  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();

  const [aiFilter, setAiFilter] = useState<AiFilterType>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const urlConversationId = Array.isArray(params.conversationId) && params.conversationId.length > 0
    ? params.conversationId[0]
    : null;

  useEffect(() => {
    const wsId = workspace?.id;
    if (wsId && !workspaceLoading) {
      setCurrentPage(1);
      fetchConversations(
        'ATIVAS',
        wsId,
        1,
        CONVERSATIONS_PER_PAGE,
        false,
        aiFilter,
        debouncedSearchTerm,
        false
      );
    }
  }, [workspace?.id, workspaceLoading, aiFilter, debouncedSearchTerm]);

  useEffect(() => {
    if (conversations.length > 0 && !loadingConversations) {
      if (urlConversationId) {
        const conversationFromUrl = conversations.find(c => c.id === urlConversationId);
        if (conversationFromUrl && selectedConversation?.id !== urlConversationId) {
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

  const loadMore = () => {
    if (!loadingConversations && !isLoadingMoreConversations && hasMoreConversations && workspace) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchConversations(
        'ATIVAS',
        workspace.id,
        nextPage,
        CONVERSATIONS_PER_PAGE,
        true,
        aiFilter,
        debouncedSearchTerm
      );
    }
  };

  const isLoading = loadingConversations || workspaceLoading;
  const displayError = conversationsError || workspaceError;

  if (isLoading && conversations.length === 0) {
    return <LoadingSpinner message="Carregando conversas..." />
  }
  if (displayError) {
    return <ErrorMessage message={displayError} />
  }

  const baseConversationsPath = `/workspace/${workspace?.id}/conversations`;

  // Contagens para os filtros (vindas do contexto)
  const { all: countAll, human: countHuman, ai: countAi } = conversationCounts;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-grow overflow-hidden">
        <div className="w-full md:w-1/3 lg:w-1/4 border-r border-border bg-card/50 dark:bg-background flex-shrink-0">
          <div className="p-2 border-b border-border">
            <div className="flex space-x-1">
              <Button
                variant={aiFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('all')}
                className="flex-1 flex items-center justify-center"
              >
                Todos
                <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                  {countAll}
                </span>
              </Button>
              <Button
                variant={aiFilter === 'human' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('human')}
                className="flex-1 flex items-center justify-center"
              >
                Humanos
                <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                  {countHuman}
                </span>
              </Button>
              <Button
                variant={aiFilter === 'ai' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAiFilter('ai')}
                className="flex-1 flex items-center justify-center"
              >
                IA
                <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                  {countAi}
                </span>
              </Button>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar por nome, telefone ou tag"
                className="pl-8"
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
          </div>
          <ConversationList
            conversations={conversations}
            onSelectConversation={handleSelectConversation}
            selectedConversationId={selectedConversation?.id || urlConversationId}
            basePath={baseConversationsPath}
            loadMoreConversations={loadMore}
            hasMoreConversations={hasMoreConversations}
            isLoadingMoreConversations={isLoadingMoreConversations}
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

