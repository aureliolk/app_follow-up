import React from 'react';
import { ClientConversation } from '@/app/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react"; // Import the User icon
import { TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tooltip } from '@/components/ui/tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
    <TooltipProvider delayDuration={100}>
      <div
        className={cn(
          'p-3 cursor-pointer hover:bg-accent flex items-start space-x-3 border-b border-border relative group',
          isSelected && 'bg-primary-light',
          unreadCount > 0 && 'bg-secondary',
          unreadCount > 0 && 'pl-5' // Add padding for the unread indicator
        )}
        onClick={() => onSelect(conversation)}
        role="button"
        tabIndex={0}
      >
        {unreadCount > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full" />
        )}
        <div className="relative">
          <Avatar className="h-10 w-10 flex-shrink-0 border border-border">
            <AvatarFallback className={cn(
              "text-muted-foreground",
              isSelected && "bg-primary text-primary-foreground"
            )}>
              {conversation.client?.name?.charAt(0)?.toUpperCase() || 'C'}
            </AvatarFallback>
          </Avatar>
          {status && (
            <div className={cn(
              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
              status === 'online' && 'bg-green-500',
              status === 'offline' && 'bg-red-500',
              status === 'away' && 'bg-yellow-500'
            )} />
          )}
        </div>

        <div className="flex-grow overflow-hidden">
          <div className="flex justify-between items-center mb-0.5">
            <div className="flex items-center min-w-0">
              <h3
                className={cn(
                  "font-semibold text-sm truncate",
                  isSelected ? "text-primary" : "text-foreground",
                  unreadCount > 0 && !isSelected && "font-bold"
                )}
                title={conversation.client?.name || 'Sem título'}
              >
                {conversation.client?.name || 'Sem título'}
              </h3>
              {!conversation.is_ai_active && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <User className="h-3.5 w-3.5 text-muted-foreground ml-1.5 flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>IA Pausada (Atendimento Humano)</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <span className={cn(
              "text-xs text-muted-foreground flex-shrink-0 ml-2",
              unreadCount > 0 && !isSelected && "text-blue-400 font-medium"
            )}>
              {conversation.last_message_at
                ? `${formatDistanceToNowStrict(new Date(conversation.last_message_at), { addSuffix: false, locale: ptBR })} • ${new Date(conversation.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : '--:--'}
            </span>
          </div>
          <p className={cn(
            "text-xs text-muted-foreground truncate leading-snug",
            unreadCount > 0 && !isSelected && "text-foreground/80"
          )}>
            {conversation.last_message?.content || 'Nenhuma mensagem'}
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
};

