// apps/next-app/app/workspace/[slug]/conversations/components/ConversationList.tsx
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ClientConversation } from '@/app/types';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface ConversationListProps {
  conversations: ClientConversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversation: ClientConversation) => void;
}

export default function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
}: ConversationListProps) {

  // const { unreadConversationIds } = useFollowUp();
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set()); // Placeholder

  useEffect(() => {
    console.log('[ConversationList] Unread IDs atualizado:', unreadConversationIds);
  }, [unreadConversationIds]);

  // Função auxiliar para obter iniciais
  const getInitials = (name?: string | null): string => {
    if (!name) return '?';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  return (
    <div className="flex flex-col">
      {conversations.map((convo) => {
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
            key={convo.id}
            onClick={() => onSelectConversation(convo)}
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
                <h3 className={cn("font-semibold text-sm truncate", isActive ? "text-primary" : "text-foreground", hasUnread && !isActive ? "font-bold" : "")}>
                  {clientName}
                </h3>
                <span className={cn("text-xs text-muted-foreground flex-shrink-0 ml-2", hasUnread && !isActive ? "text-blue-400 font-medium" : "")}>
                  {lastMessageTime}
                </span>
              </div>
              <p className={cn("text-xs text-muted-foreground truncate leading-snug", hasUnread && !isActive ? "text-foreground/80" : "")}>
                 {senderPrefix && <span className="font-medium">{senderPrefix}</span>}
                 {lastMessageText}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}