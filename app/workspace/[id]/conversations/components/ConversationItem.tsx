import React from 'react';
import { ClientConversation } from '@/app/types';
import { cn } from '@/lib/utils';

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
        'p-3 cursor-pointer hover:bg-accent',
        isSelected && 'bg-accent'
      )}
      onClick={() => onSelect(conversation)}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="relative">
              <h4 className="truncate font-medium">
                {conversation.id || 'Sem título'}
              </h4>
              {status && (
                <span className={cn(
                  "absolute -right-2 -top-1 h-2 w-2 rounded-full",
                  status === 'online' ? 'bg-green-500' : 
                  status === 'away' ? 'bg-yellow-500' : 'bg-gray-500'
                )} />
              )}
            </div>
            {unreadCount && unreadCount > 0 && (
              <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {conversation.last_message?.content || 'Nenhuma mensagem'}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {conversation.updated_at 
            ? new Date(conversation.updated_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) 
            : '--:--'}
        </span>
      </div>
    </div>
  );
};
