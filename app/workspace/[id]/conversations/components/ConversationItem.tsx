import React from 'react';
import { ClientConversation } from '@/app/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ConversationItemProps {
  conversation: ClientConversation;
  onSelect: (conversation: ClientConversation) => void;
  isSelected: boolean;
  basePath: string;
  unreadCount?: number;
  status?: 'online' | 'offline' | 'away';
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  onSelect,
  isSelected,
  basePath,
  unreadCount = 0,
  status
}) => {
  return (
    <div
      className={cn(
        'p-3 cursor-pointer hover:bg-accent flex items-start space-x-3 border-b border-border',
        isSelected && 'bg-accent',
        unreadCount > 0 && 'bg-blue-500/10'
      )}
      onClick={() => onSelect(conversation)}
    >
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarFallback>{conversation.client?.name?.charAt(0)?.toUpperCase() || 'C'}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className="truncate text-sm font-semibold text-foreground">
            {conversation.client?.name || 'Sem título'}
          </h4>
          <span className="text-xs text-muted-foreground">
            {conversation.updated_at
              ? new Date(conversation.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '--:--'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {conversation.last_message?.content || 'Nenhuma mensagem'}
        </p>
      </div>
    </div>
  );
};
