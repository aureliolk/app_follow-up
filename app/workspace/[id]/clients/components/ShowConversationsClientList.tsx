'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Loader2, MessageCircle } from 'lucide-react';
import { getConversationsByClientId } from '@/lib/actions/conversationActions'; // Import the Server Action
import type { ClientConversation } from '@/app/types'; // Import the Conversation type
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShowConversationsClientListProps {
  clientId: string;
  workspaceId: string;
}

export default function ShowConversationsClientList({
  clientId,
  workspaceId,
}: ShowConversationsClientListProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ClientConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true);
      setError(null);
      const result = await getConversationsByClientId(clientId);
      if (result.success) {
        setConversations(result.data);
      } else {
        setError((result as { success: false; error: string }).error);
      }
      setLoading(false);
    };

    if (clientId) {
      fetchConversations();
    }
  }, [clientId]); // Re-fetch if clientId changes

  const handleConversationClick = (conversationId: string) => {
    router.push(`/workspace/${workspaceId}/conversations/${conversationId}`);
  };

  return (
    <Card className="border p-4">

      <CardContent className="p-4">
        {loading && (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando conversas...</span>
          </div>
        )}

        {error && !loading && (
          <div className="p-6 text-center text-destructive">
            Erro ao carregar conversas: {error}
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            Nenhuma conversa encontrada para este cliente.
          </div>
        )}

        {!loading && !error && conversations.length > 0 && (
          <div className="border">
            {conversations.map((conv, index) => (
              <div key={conv.id} className="mb-2 last:mb-0">
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full flex items-center justify-between px-6 py-5 rounded-none",
                    "hover:bg-accent",
                  )}
                  onClick={() => handleConversationClick(conv.id)}
                >
                  <div className="flex items-center space-x-3">
                    <MessageCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="text-left flex-1">
                      <p className="text-sm font-semibold text-foreground mb-1">
                         {/* Displaying channel or a placeholder */}
                         {conv.channel || (conv.last_message?.content ? '' : '-')} 
                      </p>

                      {conv.last_message?.content && (
                         <p className="text-sm text-muted-foreground text-wrap mb-2">
                            {conv.last_message.content} {/* Message snippet conditionally visible */}
                         </p>
                      )}

                      <div className={cn(
                         "text-xs flex flex-wrap gap-x-3", // Base styling for status/activity line
                         // Conditional styling for status color
                         conv.status === 'ACTIVE' ? 'text-green-600 dark:text-green-400' :
                         conv.status === 'CLOSED' ? 'text-muted-foreground' : // Use muted-foreground for CLOSED
                         'text-amber-600 dark:text-amber-400' // Default for other statuses
                       )}>
                         <span className={cn(
                            "font-medium mr-3", // Make status text bold and add right margin
                            conv.status === 'CLOSED' ? 'text-muted-foreground' : '', // Ensure muted-foreground color for CLOSED
                         )}>Status: {conv.status}</span>
                         <span className="text-muted-foreground">
                            Última atividade:
                            {conv.last_message_at
                              ? ` ${formatDistanceToNowStrict(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })}`
                              : conv.created_at
                              ? ` ${formatDistanceToNowStrict(new Date(conv.created_at), { addSuffix: true, locale: ptBR })}`
                              : ' N/A'}
                         </span>
                      </div>
                    </div>
                  </div>
                  {/* Could add an arrow icon here if desired */}
                  {/* <ChevronRight className="h-4 w-4 text-muted-foreground" /> */}
                </Button>
                {index < conversations.length - 1 && <Separator className="last:hidden" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 