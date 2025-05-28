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
        'p-3 cursor-pointer hover:bg-accent flex items-start space-x-3 border-b border-border relative', // Reverted to p-3
        isSelected && 'bg-primary-light', // Selected background remains primary-light (light orange/peach)
        unreadCount > 0 && 'bg-secondary' // Unread background is now secondary (light grey/blue)
      )}
      onClick={() => onSelect(conversation)}
    >
      {unreadCount > 0 && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full" />
      )}
      <Avatar className="h-10 w-10 flex-shrink-0"> {/* Reverted avatar positioning */}
        <AvatarFallback>{conversation.client?.name?.charAt(0)?.toUpperCase() || 'C'}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0"> {/* Reverted content padding */}
        <div className="flex items-center justify-between">
          <h4 className={cn(
            "truncate text-sm font-semibold",
            isSelected ? "text-primary" : "text-foreground" // Name color changes to primary when selected
          )}>
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
