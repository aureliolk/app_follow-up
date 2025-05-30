import React from 'react';
import { ClientConversation } from '@/app/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react"; // Import the User icon
import { TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tooltip } from '@/components/ui/tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';

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
  const isAiPaused = conversation.is_ai_active === false; // Determine if AI is paused

  return (
    <>
      <div
        className={cn(
          'p-3 cursor-pointer hover:bg-accent flex items-start space-x-3 border-b border-border relative',
          isSelected && 'bg-primary-light',
          unreadCount > 0 && 'bg-secondary'
        )}
        onClick={() => onSelect(conversation)}
      >
        {unreadCount > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full" />
        )}
        <Avatar className="h-10 w-10 flex-shrink-0 border border-border">
          <AvatarFallback className={cn(isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {conversation.client?.name?.charAt(0)?.toUpperCase() || 'C'}
          </AvatarFallback>
        </Avatar>

        <div className="flex-grow overflow-hidden">
          <div className="flex justify-between items-center mb-0.5">
            <div className="flex items-center min-w-0">
              <h3
                className={cn(
                  "font-semibold text-sm truncate",
                  isSelected ? "text-primary" : "text-foreground",
                  unreadCount > 0 && !isSelected ? "font-bold" : ""
                )}
                title={conversation.client?.name || 'Sem título'}
              >
                {conversation.client?.name || 'Sem título'}
              </h3>
              {!conversation.is_ai_active && (
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
            <span className={cn("text-xs text-muted-foreground flex-shrink-0 ml-2", unreadCount > 0 && !isSelected ? "text-blue-400 font-medium" : "")}>
              {conversation.last_message_at
                ? new Date(conversation.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--:--'}
            </span>
          </div>
          <p className={cn("text-xs text-muted-foreground truncate leading-snug", unreadCount > 0 && !isSelected ? "text-foreground/80" : "")}>
            {/* {conversation.last_message?.sender_type === 'CLIENT' && <span className="font-medium">Você</span>}
            {conversation.last_message?.sender_type === 'AI' && <span className="font-medium">IA</span>}
            {conversation.last_message?.sender_type === 'SYSTEM' && <span className="font-medium">Sistema</span>}
            {conversation.last_message?.sender_type === 'AGENT' && <span className="font-medium">Agente</span>}
            {conversation.last_message?.sender_type === 'AUTOMATION' && <span className="font-medium">Automação</span>} */}
            {conversation.last_message?.content || 'Nenhuma mensagem'}
          </p>
          {/* <p className="text-xs text-muted-foreground truncate leading-snug">
        {convo.id}
      </p> */}
        </div>

        {/* <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className={cn(
              "truncate text-sm font-semibold",
              isSelected ? "text-primary" : "text-foreground"
            )}>
              {conversation.client?.name || 'Sem título'}
              {isAiPaused && ( // Conditionally render the User icon
                <User className="ml-2 h-4 w-4 text-muted-foreground inline-block" />
              )}
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
        </div> */}
      </div>
      
      {/* <button
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
          <AvatarFallback className={cn(isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {getInitials(clientName)}
          </AvatarFallback>
        </Avatar>

        
      </button> */}
      
    </>
  );
};
