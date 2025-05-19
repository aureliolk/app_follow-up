// apps/next-app/app/workspace/[slug]/conversations/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Pusher from 'pusher-js';
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
  const pusherRef = useRef<Pusher | null>(null);

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
      if (pusherRef.current) {
        pusherRef.current.unsubscribe(`workspace-updates:${wsId}`);
        pusherRef.current.disconnect();
      }

      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      });
      pusherRef.current = pusher;
      const channel = pusher.subscribe(`workspace-updates:${wsId}`);

      const handler = () => {
        if (wsId) fetchConversations('ATIVAS', wsId);
      };

      channel.bind('new_message', handler);
      channel.bind('conversation_updated', handler);

      return () => {
        channel.unbind('new_message', handler);
        channel.unbind('conversation_updated', handler);
        pusher.unsubscribe(`workspace-updates:${wsId}`);
        pusher.disconnect();
      };
    } else if (pusherRef.current) {
      pusherRef.current.disconnect();
      pusherRef.current = null;
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
        </div>

        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
          <ConversationDetail />
        </div>
      </div>
    </div>
  );
}