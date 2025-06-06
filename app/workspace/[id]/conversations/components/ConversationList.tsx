// apps/next-app/app/workspace/[slug]/conversations/components/ConversationList.tsx
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ClientConversation } from '@/app/types';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useConversationContext } from '@/context/ConversationContext';
import { User } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRouter, usePathname } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface ConversationListProps {
  conversations: ClientConversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversation: ClientConversation) => void;
  basePath: string;
  loadMoreConversations: () => void;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
}

export default function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  basePath,
  loadMoreConversations,
  hasMoreConversations,
  isLoadingMoreConversations,
}: ConversationListProps) {
  const { unreadConversationIds } = useConversationContext();
  const router = useRouter();
  const observer = useRef<IntersectionObserver | null>(null);

  const lastElementRef = useCallback((node: HTMLButtonElement | null) => {
    if (isLoadingMoreConversations) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreConversations) {
        loadMoreConversations();
      }
    });
    if (node) observer.current.observe(node);
  }, [isLoadingMoreConversations, hasMoreConversations, loadMoreConversations]);

  const getInitials = (name?: string | null): string => {
    if (!name) return '?';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`.toUpperCase();
  };

  if (!conversations || conversations.length === 0) {
    return <div className="p-4 text-center text-muted-foreground text-sm">Nenhuma conversa encontrada.</div>;
  }

  return (
    <div className="overflow-y-auto h-full">
      {conversations.map((convo, index) => {
        if (!convo || !convo.id) {
          console.error('[ConversationList] Found conversation with missing ID:', convo);
          return null;
        }

        const isActive = convo.id === selectedConversationId;
        const hasUnread = unreadConversationIds.has(convo.id);

        const clientName = convo.client?.name || convo.client?.phone_number || 'Desconhecido';
        const lastMessageText = convo.last_message?.content || 'Nenhuma mensagem ainda.';
        const lastMessageTime = convo.last_message?.timestamp
          ? formatDistanceToNow(new Date(convo.last_message.timestamp), { addSuffix: true, locale: ptBR })
          : convo.created_at ? formatDistanceToNow(new Date(convo.created_at), { addSuffix: true, locale: ptBR }) : '';
        const senderPrefix = convo.last_message?.sender_type === 'AI' ? 'IA: ' : (convo.last_message?.sender_type === 'SYSTEM' ? 'Sistema: ' : '');

        return (
          <button
            ref={conversations.length === index + 1 ? lastElementRef : null}
            key={convo.id}
            onClick={() => {
              onSelectConversation(convo);
              const newPath = `${basePath}/${convo.id}`;
              router.push(newPath, { scroll: false });
            }}
            className={cn(
              'relative w-full text-left px-4 py-3 border-b border-border cursor-pointer transition-colors duration-150 flex items-start gap-3',
              isActive
                ? 'bg-primary/10 dark:bg-primary/20'
                : 'hover:bg-accent/50 dark:hover:bg-white/5',
              hasUnread && !isActive ? 'bg-blue-500/5' : ''
            )}
          >
            {hasUnread && !isActive && (
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" title="Mensagem não lida"></span>
            )}

            <Avatar className="h-10 w-10 flex-shrink-0 border border-border">
              {/* <AvatarImage src={convo.client?.avatarUrl} alt={clientName} /> */}
              <AvatarFallback className={cn(isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {getInitials(clientName)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-grow overflow-hidden">
              <div className="flex justify-between items-center mb-0.5">
                <div className="flex items-center min-w-0">
                  <h3
                    className={cn(
                      "font-semibold text-sm truncate",
                      isActive ? "text-primary" : "text-foreground",
                      hasUnread && !isActive ? "font-bold" : ""
                    )}
                    title={clientName}
                  >
                    {clientName}
                  </h3>
                  {!convo.is_ai_active && (
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <User className="h-3.5 w-3.5 text-muted-foreground ml-1.5 flex-shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>IA Pausada (Atendimento Humano)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <span className={cn("text-xs text-muted-foreground flex-shrink-0 ml-2", hasUnread && !isActive ? "text-blue-400 font-medium" : "")}> 
                  {lastMessageTime}
                </span>
              </div>
              <p className={cn("text-xs text-muted-foreground truncate leading-snug", hasUnread && !isActive ? "text-foreground/80" : "")}>
                 {senderPrefix && <span className="font-medium">{senderPrefix}</span>}
                 {lastMessageText}
              </p>
              {/* <p className="text-xs text-muted-foreground truncate leading-snug">
                {convo.id}
              </p> */}
            </div>
          </button>
        );
      })}
      {isLoadingMoreConversations && (
        <div className="flex justify-center items-center py-4">
          <LoadingSpinner message="Carregando mais conversas..." />
        </div>
      )}
      {!isLoadingMoreConversations && !hasMoreConversations && conversations.length > 0 && (
        <div className="text-center text-muted-foreground py-4 text-sm">
          Fim da lista de conversas.
        </div>
      )}
    </div>
  );
}