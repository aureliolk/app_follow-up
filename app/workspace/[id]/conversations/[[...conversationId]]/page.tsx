'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import { useConversationContext } from '@/context/ConversationContext';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConversationDetail from '../components/ConversationDetail';
import { ConversationItem } from '../components/ConversationItem';
import type { ClientConversation } from '@/app/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CONVERSATIONS_PER_PAGE = 50;
const ITEM_HEIGHT = 64; // Reduced item height to reduce perceived spacing

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
    totalCountAll,
    totalCountHuman,
    totalCountAi,
    unreadConversationIds, // Add unreadConversationIds here
  } = useConversationContext();

  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();

  const [aiFilter, setAiFilter] = useState<AiFilterType>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const listRef = useRef(null);
  const loadingRef = useRef(false);

  const urlConversationId = Array.isArray(params.conversationId) && params.conversationId.length > 0
    ? params.conversationId[0]
    : null;

  useEffect(() => {
    const wsId = workspace?.id;
    if (wsId && !workspaceLoading) {
      const currentFilter = 'ATIVAS';
      setCurrentPage(1);
      fetchConversations(currentFilter, wsId, 1, CONVERSATIONS_PER_PAGE);
    }
  }, [workspace?.id, workspaceLoading]);

  useEffect(() => {
    if (conversations.length > 0 && !loadingConversations) {
      if (urlConversationId) {
        const conversationFromUrl = conversations.find(c => c.id === urlConversationId);
        if (conversationFromUrl && selectedConversation?.id !== urlConversationId) {
          selectConversation(conversationFromUrl);
        } else if (!conversationFromUrl) {
          selectConversation(null);
          const basePath = `/workspace/${workspace?.id}/conversations`;
          if (pathname !== basePath) router.push(basePath);
        }
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

  const loadMore = useCallback(() => {
    if (!loadingRef.current && hasMoreConversations && workspace) {
      loadingRef.current = true;
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchConversations('ATIVAS', workspace.id, nextPage, CONVERSATIONS_PER_PAGE, true)
        .finally(() => {
          loadingRef.current = false;
        });
    }
  }, [currentPage, hasMoreConversations, workspace?.id]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreConversations) {
        loadMore();
      }
    }, { threshold: 0.1 });

    if (listRef.current) {
      observer.observe(listRef.current);
    }

    return () => observer.disconnect();
  }, [hasMoreConversations, loadMore]);

  const isLoading = loadingConversations || workspaceLoading;
  const displayError = conversationsError || workspaceError;

  if (isLoading && conversations.length === 0) {
    return <LoadingSpinner message="Carregando conversas..." />
  }
  if (displayError) {
    return <ErrorMessage message={displayError} />
  }

  const filteredConversations = conversations.filter(convo => {
    if (aiFilter === 'human') return convo.is_ai_active === false;
    if (aiFilter === 'ai') return convo.is_ai_active === true;
    return true; 
  });

  const baseConversationsPath = `/workspace/${workspace?.id}/conversations`;

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
                  {totalCountAll}
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
                  {totalCountHuman}
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
                  {totalCountAi}
                </span>
              </Button>
            </div>
          </div>
          <div className="h-full">
            <AutoSizer>
              {({ height, width }) => (
                <List
                  height={height}
                  itemCount={filteredConversations.length + (hasMoreConversations ? 1 : 0)}
                  itemSize={ITEM_HEIGHT}
                  width={width}
                  itemData={{
                    conversations: filteredConversations,
                    onSelect: handleSelectConversation,
                    selectedId: selectedConversation?.id || urlConversationId,
                    basePath: baseConversationsPath,
                    isLoadingMore: isLoadingMoreConversations,
                    unreadConversationIds: unreadConversationIds // Pass unreadConversationIds
                  }}
                >
                  {({ index, style, data }) => {
                    if (index >= data.conversations.length) {
                      return (
                        <div style={style} className="flex justify-center items-center p-4" ref={listRef}>
                          {data.isLoadingMore ? <LoadingSpinner size="small" /> : null}
                        </div>
                      );
                    }
                    const conversation = data.conversations[index];
                    const isUnread = data.unreadConversationIds.has(conversation.id); // Determine if conversation is unread
                    return (
                      <div style={style}>
                        <ConversationItem
                          conversation={conversation}
                          onSelect={data.onSelect}
                          isSelected={conversation.id === data.selectedId}
                          basePath={data.basePath}
                          unreadCount={isUnread ? 1 : 0} // Pass unreadCount based on isUnread
                        />
                      </div>
                    );
                  }}
                </List>
              )}
            </AutoSizer>
          </div>
        </div>

        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
          <ConversationDetail />
        </div>
      </div>
    </div>
  );
}
