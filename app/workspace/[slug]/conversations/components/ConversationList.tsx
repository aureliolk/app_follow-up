// apps/next-app/app/workspace/[slug]/conversations/components/ConversationList.tsx
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ClientConversation } from '@/app/types';
import { cn } from '@/lib/utils';

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
              'w-full text-left px-4 py-3 border-b border-border cursor-pointer transition-colors duration-150 flex items-start gap-3',
              isActive
                ? 'bg-primary/10 dark:bg-primary/20' // Destaque suave
                : 'hover:bg-accent/50 dark:hover:bg-white/5'
            )}
          >
            {/* Avatar */}
            <Avatar className="h-10 w-10 flex-shrink-0 border border-border">
              {/* <AvatarImage src={convo.client?.avatarUrl} alt={clientName} /> */} {/* Adicionar imagem se tiver */}
              <AvatarFallback className={cn(isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {getInitials(clientName)}
              </AvatarFallback>
            </Avatar>

            {/* Conteúdo */}
            <div className="flex-grow overflow-hidden">
              <div className="flex justify-between items-center mb-0.5">
                <h3 className={cn("font-semibold text-sm truncate", isActive ? "text-primary" : "text-foreground")}>
                  {clientName}
                </h3>
                <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                  {lastMessageTime}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate leading-snug">
                 {/* Adiciona prefixo para mensagens da IA/Sistema */}
                 {senderPrefix && <span className="font-medium">{senderPrefix}</span>}
                 {lastMessageText}
              </p>
               {/* Opcional: Mostrar status ou outras badges */}
               {/* <div className="mt-1">
                   <Badge variant={convo.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                       {convo.status}
                   </Badge>
               </div> */}
            </div>
          </button>
        );
      })}
    </div>
  );
}