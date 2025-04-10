// apps/next-app/app/workspace/[slug]/conversations/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useWorkspace } from '@/context/workspace-context';
import { useFollowUp } from '@/context/follow-up-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConversationList from './components/ConversationList';
import ConversationDetail from './components/ConversationDetail';
import type { ClientConversation } from '@/app/types';
import { Button } from '@/components/ui/button'; // Import Button
import { cn } from '@/lib/utils'; // Corrigido
import { useDebouncedCallback } from 'use-debounce'; // Importar debounce

export default function ConversationsPage() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { selectedConversation, selectConversation, setUnreadConversationIds } = useFollowUp();
  const [conversations, setConversations] = useState<ClientConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ATIVAS' | 'CONVERTIDAS' | 'CANCELADAS' | 'COMPLETAS'>('ATIVAS');
  const eventSourceRef = useRef<EventSource | null>(null);

  // --- fetchConversations (useCallback com dependências mínimas) ---
  // Mantemos apenas o que a *lógica interna* realmente precisa
  const fetchConversationsInternal = useCallback(async (wsId: string, filter: string, options?: { isBackgroundUpdate?: boolean }) => {
    if (!options?.isBackgroundUpdate && !workspaceLoading) {
        setIsLoading(true);
    }
    console.log(`[ConversationsPage] Fetching conversations for ws: ${wsId}, filter: ${filter}, background: ${!!options?.isBackgroundUpdate}`);
    try {
      const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
        '/api/conversations',
        { params: { workspaceId: wsId, status: filter } }
      );
       if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao carregar conversas');
       
       // Atualiza a lista de conversas
       setConversations(response.data.data);
       
       // Lógica de seleção/desseleção precisa dos valores atuais de selectedConversation e selectConversation
       // Passaremos eles como argumentos ou usaremos refs
       return response.data.data; // Retorna os dados para a lógica de seleção externa

    } catch (err: any) {
      console.error("[ConversationsPage] Erro ao buscar conversas:", err);
        const message = err.response?.data?.error || err.message || 'Erro ao buscar conversas.';
        if (!options?.isBackgroundUpdate) {
            setError(message);
            setConversations([]);
            // A seleção é tratada fora agora
            // selectConversation(null);
        } else {
            console.warn("[ConversationsPage] Erro em background fetch:", message);
        }
        throw err; // Re-throw para que o chamador possa saber
    }
      finally {
          if (!options?.isBackgroundUpdate && !workspaceLoading) {
             setIsLoading(false);
          }
       }
  }, [workspaceLoading]); // Apenas workspaceLoading como dependência estável aqui

  // Lógica de seleção/desseleção separada
  const handleFetchedData = useCallback((fetchedData: ClientConversation[]) => {
        const currentSelectedId = selectedConversation?.id;
        const listHasSelected = fetchedData.some(c => c.id === currentSelectedId);
        if (currentSelectedId && !listHasSelected) {
            selectConversation(null);
        } else if (!currentSelectedId && fetchedData.length > 0) {
            selectConversation(fetchedData[0]);
        }
  }, [selectedConversation, selectConversation]);

  // Combinar a busca e o tratamento pós-busca
  const fetchAndHandleConversations = useCallback(async (wsId: string, filter: string, options?: { isBackgroundUpdate?: boolean }) => {
      try {
          const data = await fetchConversationsInternal(wsId, filter, options);
          handleFetchedData(data);
      } catch (e) {
          // Erro já logado em fetchConversationsInternal
          // Se não for background, o erro principal e a limpeza já foram feitos
          if (!options?.isBackgroundUpdate) {
              selectConversation(null); // Garante deseleção em erro de busca principal
          }
      }
  }, [fetchConversationsInternal, handleFetchedData, selectConversation]);

  // Debounce a função de fetch para background updates vindos do SSE
  // Evita múltiplas chamadas muito rápidas se eventos chegarem juntos
  const debouncedBackgroundFetch = useDebouncedCallback(
      (wsId: string, filter: string) => {
          console.log("[ConversationsPage] Debounced background fetch triggered.");
          fetchAndHandleConversations(wsId, filter, { isBackgroundUpdate: true });
      }, 
      500 // Delay de 500ms (ajustável)
  );

  // useEffect inicial/filtro
  useEffect(() => {
    const wsId = workspace?.id;
    if (wsId && !workspaceLoading) {
        console.log(`[ConversationsPage] useEffect (initial/filter) triggered: Fetching for wsId ${wsId} with filter ${activeFilter}`);
        fetchAndHandleConversations(wsId, activeFilter);
    }
  }, [workspace?.id, workspaceLoading, workspaceError, activeFilter]);

  // useEffect SSE com dependências mínimas e refs
  const activeFilterRef = useRef(activeFilter);
  const selectedConversationRef = useRef(selectedConversation);
  const setUnreadConversationsRef = useRef(setUnreadConversationIds);
  const debouncedFetchRef = useRef(debouncedBackgroundFetch);

  useEffect(() => {
      activeFilterRef.current = activeFilter;
      selectedConversationRef.current = selectedConversation;
      setUnreadConversationsRef.current = setUnreadConversationIds;
      debouncedFetchRef.current = debouncedBackgroundFetch;
  }, [activeFilter, selectedConversation, setUnreadConversationIds, debouncedBackgroundFetch]);

  useEffect(() => {
    const wsId = workspace?.id;

    if (wsId && !workspaceLoading) {
        console.log(`[ConversationsPage] SSE Effect Setup: Conectando para Workspace ${wsId}`);
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource(`/api/workspaces/${wsId}/subscribe`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const eventData = JSON.parse(event.data);
                console.log('[ConversationsPage] SSE Message Received:', eventData);

                if (eventData.type === 'new_message' && eventData.conversationId) {
                    console.log(`[ConversationsPage] SSE: Nova mensagem detectada para Conv ${eventData.conversationId}...`);

                    // REFATORADO: Atualizar estado da lista de forma mais segura
                    setConversations(prevConversations => {
                        const convoIndex = prevConversations.findIndex(c => c.id === eventData.conversationId);
                        let updatedList = [...prevConversations];

                        const newLastMessageData = {
                           content: eventData.lastMessageContent || '...', // Obter do evento
                           timestamp: eventData.lastMessageTimestamp || new Date().toISOString(), // Obter do evento
                           sender_type: eventData.lastMessageSenderType || 'UNKNOWN', // Obter do evento
                        };

                        if (convoIndex > -1) {
                            // Conversa existente: Atualiza SÓ os campos da lista e move para o topo
                            console.log(`[ConversationsPage] SSE: Atualizando APENAS last_message da conversa existente ${eventData.conversationId}`);
                            const existingConvo = updatedList[convoIndex];
                            // Cria um NOVO objeto apenas para a atualização, mas baseado no existente
                            const updatedConvoPreview = {
                                ...existingConvo, // Mantém outras props como client, etc.
                                last_message: newLastMessageData,
                                last_message_at: new Date(newLastMessageData.timestamp),
                                // Poderia atualizar status, is_ai_active se vierem no evento também
                                status: eventData.status || existingConvo.status,
                                is_ai_active: eventData.is_ai_active ?? existingConvo.is_ai_active,
                            };
                            updatedList.splice(convoIndex, 1); // Remove da posição antiga
                            updatedList.unshift(updatedConvoPreview); // Adiciona no topo
                        } else {
                            // Nova conversa: Adiciona um objeto MÍNIMO no topo
                            // A busca completa ocorrerá se/quando o usuário clicar nela
                             console.log(`[ConversationsPage] SSE: Adicionando PREVIEW da nova conversa ${eventData.conversationId}`);
                             const newConversationPreview: ClientConversation = {
                                id: eventData.conversationId,
                                workspace_id: wsId,
                                client_id: eventData.clientId || 'unknown',
                                channel: eventData.channel || 'UNKNOWN',
                                status: eventData.status || 'ACTIVE',
                                is_ai_active: eventData.is_ai_active ?? true,
                                last_message_at: new Date(newLastMessageData.timestamp),
                                created_at: new Date(newLastMessageData.timestamp), // Aproximação
                                updated_at: new Date(newLastMessageData.timestamp),
                                client: {
                                    id: eventData.clientId || 'unknown',
                                    name: eventData.clientName || eventData.clientPhone || 'Novo Contato',
                                    phone_number: eventData.clientPhone || null,
                                },
                                last_message: newLastMessageData,
                                activeFollowUp: null, // Preview não tem detalhes de follow-up
                                metadata: {},
                            };
                             if (newConversationPreview.id !== 'unknown') { // Evita adicionar se ID for inválido
                                updatedList.unshift(newConversationPreview);
                             }
                        }
                        return updatedList;
                    });

                    // Lógica de não lidas (manter como estava, usando Ref)
                    if (eventData.conversationId && eventData.conversationId !== selectedConversationRef.current?.id) {
                        console.log(`[ConversationsPage] SSE: Marcando ${eventData.conversationId} como não lida (via Contexto Ref).`);
                        setUnreadConversationsRef.current(prev => {
                            const next = new Set(prev);
                            next.add(eventData.conversationId);
                            return next;
                        });
                    }
                } else if (eventData.type === 'conversation_updated' && eventData.conversationId) {
                     // Manter esta lógica como estava, ela parece segura (só atualiza campos)
                     console.log(`[ConversationsPage] SSE: Evento conversation_updated para ${eventData.conversationId}`);
                     setConversations(prev => prev.map(c =>
                        c.id === eventData.conversationId ? { ...c, ...eventData.changes } : c
                     ));
                }
                // Adicionar mais handlers para outros tipos de evento (ex: delete, status change)

            } catch (error) { console.error("[ConversationsPage] SSE: Erro ao processar mensagem:", error); }
        };

        eventSource.onerror = (error) => {
            console.error("[ConversationsPage] SSE Error:", error);
            eventSource.close();
            eventSourceRef.current = null;
        };

        eventSource.onopen = () => { console.log(`[ConversationsPage] SSE Connection OPENED para Workspace ${wsId}`); };

        // Cleanup
        return () => {
            console.log(`[ConversationsPage] SSE Effect Cleanup: Fechando conexão SSE para Workspace ${wsId}`);
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }
    else if (eventSourceRef.current) {
        console.log("[ConversationsPage] SSE Effect Cleanup: Workspace ID indisponível, fechando conexão SSE.");
        eventSourceRef.current.close();
        eventSourceRef.current = null;
   }

  // <<< DEPENDÊNCIAS MÍNIMAS >>> Apenas workspace.id e seu estado de loading
  }, [workspace?.id, workspaceLoading]);


  // Handler para seleção (usa refs se necessário ou context direto)
  const handleSelectConversation = useCallback((conversation: ClientConversation | null) => {
    if (conversation) {
      setUnreadConversationIds(prev => {
        if (prev.has(conversation.id)) {
          console.log(`[ConversationsPage] Limpando não lido para ${conversation.id} (via Contexto).`);
          const next = new Set(prev);
          next.delete(conversation.id);
          return next;
        }
        return prev;
      });
    }
    selectConversation(conversation);
  }, [selectConversation, setUnreadConversationIds]);

  if (isLoading || workspaceLoading) { return <LoadingSpinner message="Carregando..." /> }
  const displayError = error || workspaceError;
  if (displayError) {  return <ErrorMessage message={displayError} /> }

  const filterOptions: typeof activeFilter[] = ['ATIVAS', 'CONVERTIDAS', 'CANCELADAS', 'COMPLETAS'];

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex-shrink-0 bg-card/30 dark:bg-background">
         <div className="flex items-center space-x-2">
           <span className="text-sm font-medium text-muted-foreground">Mostrar:</span>
           {filterOptions.map(filter => (
               <Button
                   key={filter}
                   variant={activeFilter === filter ? "secondary" : "ghost"}
                   size="sm"
                   onClick={() => {
                       if (activeFilter !== filter) {
                            setActiveFilter(filter);
                            selectConversation(null);
                       }
                   }}
                   className={cn("h-8 px-3", activeFilter === filter ? "bg-primary/15 text-primary" : "text-muted-foreground")}
               >
                   {filter.charAt(0) + filter.slice(1).toLowerCase()}
               </Button>
           ))}
         </div>
      </div>

      <div className="flex flex-grow overflow-hidden">
        <div className="w-full md:w-1/3 lg:w-1/4 border-r border-border overflow-y-auto bg-card/50 dark:bg-background flex-shrink-0">
          {isLoading && conversations.length === 0 && (
             <div className="p-4"><LoadingSpinner size="small"/></div>
          )}
          <ConversationList
            conversations={conversations}
            onSelectConversation={handleSelectConversation}
            selectedConversationId={selectedConversation?.id}
          />
          {!isLoading && conversations.length === 0 && !error && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                  Nenhuma conversa encontrada para o filtro "{activeFilter.toLowerCase()}".
              </div>
          )}
        </div>

        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
          <ConversationDetail />
        </div>
      </div>
    </div>
  );
}