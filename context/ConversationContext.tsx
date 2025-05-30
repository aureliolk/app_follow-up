// context/ConversationContext.tsx


'use client';

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
    useMemo,
    useEffect,
    Dispatch,
    SetStateAction
} from 'react';
import type {
    Message,
    ClientConversation,
    ActiveFollowUpInfo,
} from '@/app/types';
import { useWorkspace } from '@/context/workspace-context';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { sendWhatsappTemplateAction } from '@/lib/actions/whatsappActions';
import { setConversationAIStatus } from '@/lib/actions/conversationActions';
import useWorkspacePusher from '@/hooks/useWorkspacePusher';
import {
    fetchConversationsApi,
    fetchConversationMessagesApi,
} from '@/lib/services/conversationApi';

// --- Helper Function --- //
const getActiveWorkspaceId = (workspaceCtx: any, providedId?: string): string | null => {
    if (providedId) return providedId;
    if (workspaceCtx?.workspace?.id) return workspaceCtx.workspace.id;
    console.warn("[ConversationContext] Could not determine active Workspace ID from context.");
    return null;
};

function getMessageTypeFromMime(mimeType: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT'; // Default
}

// --- Tipagem do Contexto de Conversa (Estado) --- //
interface SendTemplateDataType {
    name: string;
    language: string;
    variables: Record<string, string>;
    body: string;
}

interface ConversationContextType {
    // Estados
    conversations: ClientConversation[];
    loadingConversations: boolean;
    isLoadingMoreConversations: boolean;
    hasMoreConversations: boolean;
    conversationsError: string | null;
    selectedConversation: ClientConversation | null;
    selectedConversationMessages: Message[];
    loadingSelectedConversationMessages: boolean;
    isLoadingMoreMessages: boolean;
    hasMoreMessages: boolean;
    selectedConversationError: string | null;
    messageCache: Record<string, Message[]>;
    unreadConversationIds: Set<string>;
    setUnreadConversationIds: Dispatch<SetStateAction<Set<string>>>;
    isSendingMessage: boolean;
    isTogglingAIStatus: boolean;
    isPusherConnected: boolean;
    loadingPusherConfig: boolean;
    totalCountAll: number;
    totalCountHuman: number;
    totalCountAi: number;

    // Funções de Busca/Seleção
    fetchConversations: (filter: string, workspaceId: string, page: number, pageSize: number, append?: boolean) => Promise<void>;
    fetchConversationMessages: (conversationId: string, page: number, pageSize: number, append?: boolean, orderBy?: 'asc' | 'desc') => Promise<Message[]>;
    loadMoreConversations: () => void;
    loadMoreMessages: () => void;
    selectConversation: (conversation: ClientConversation | null) => void;
    clearMessagesError: () => void;

    // Handlers para serem chamados pelo WebSocketProvider
    handleRealtimeNewMessage: (message: Message) => void;
    handleRealtimeStatusUpdate: (data: { id: string; status: string; channel_message_id?: string; errorMessage?: string }) => void;
    handleRealtimeAIStatusUpdate: (data: { conversationId: string; is_ai_active: boolean }) => void;
    handleRealtimeConversationUpdate: (data: { id: string; activeFollowUp?: ActiveFollowUpInfo | null }) => void;
    // handleRealtimeContentUpdate: (data: any) => void;

    // Funções de Ação Direta no Contexto
    selectConversationForClient: (clientId: string, workspaceId: string) => Promise<ClientConversation | null>;

    // Ações do Usuário
    sendManualMessage: (conversationId: string, content: string, workspaceId?: string, isPrivateNote?: boolean) => Promise<void>;
    sendTemplateMessage: (conversationId: string, templateData: SendTemplateDataType) => Promise<void>;
    sendMediaMessage: (conversationId: string, file: File) => Promise<void>;
    toggleAIStatus: (conversationId: string, currentStatus: boolean) => Promise<void>;

    // Nova função para remover conversa pela ID do cliente
    removeConversationByClientId: (clientId: string) => void;
}

// --- Criação do Contexto --- //
const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

// --- Componente Provider (Estado) --- //
export const ConversationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const workspaceContext = useWorkspace();
    const { data: session } = useSession();

    // --- Estados ---
    const [conversations, setConversations] = useState<ClientConversation[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [conversationsError, setConversationsError] = useState<string | null>(null);
    const [selectedConversation, setSelectedConversation] = useState<ClientConversation | null>(null);
    const [selectedConversationMessages, setSelectedConversationMessages] = useState<Message[]>([]);
    const [loadingSelectedConversationMessages, setLoadingSelectedConversationMessages] = useState(false);
    const [selectedConversationError, setSelectedConversationError] = useState<string | null>(null);
    const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});
    const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [isTogglingAIStatus, setIsTogglingAIStatus] = useState(false);
    const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
    const [hasMoreConversations, setHasMoreConversations] = useState(true);
    const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [currentConversationsPage, setCurrentConversationsPage] = useState(1);
    const [currentMessagesPage, setCurrentMessagesPage] = useState(1);
    const [currentFilter, setCurrentFilter] = useState('ATIVAS');
    const [totalCountAll, setTotalCountAll] = useState(0);
    const [totalCountHuman, setTotalCountHuman] = useState(0);
    const [totalCountAi, setTotalCountAi] = useState(0);


    // --- Efeito para Carregar Estado Inicial de Não Lidos do Local Storage ---
    useEffect(() => {
      const wsId = workspaceContext.workspace?.id;
      if (wsId) {
        const storageKey = `unreadConversationIds_${wsId}`;
        try {
          const storedUnread = localStorage.getItem(storageKey);
          if (storedUnread) {
            const parsedIds = JSON.parse(storedUnread);
            if (Array.isArray(parsedIds)) {
              setUnreadConversationIds(new Set(parsedIds));
            } else {
              console.warn('[ConversationContext] Invalid data found in Local Storage for unread IDs. Resetting.');
              localStorage.removeItem(storageKey);
              setUnreadConversationIds(new Set());
            }
          }
        } catch (error) {
          console.error('[ConversationContext] Error reading unread IDs from Local Storage:', error);
          setUnreadConversationIds(new Set());
        }
      } else {
        setUnreadConversationIds(new Set());
      }
    }, [workspaceContext.workspace?.id]);

    // --- Efeito para Salvar Estado de Não Lidos no Local Storage ---
    useEffect(() => {
      const wsId = workspaceContext.workspace?.id;
      if (wsId) {
        const storageKey = `unreadConversationIds_${wsId}`;
        try {
          const idsToStore = Array.from(unreadConversationIds);
          localStorage.setItem(storageKey, JSON.stringify(idsToStore));
        } catch (error) {
          console.error('[ConversationContext] Error saving unread IDs to Local Storage:', error);
        }
      }
    }, [unreadConversationIds, workspaceContext.workspace?.id]);


    // --- Funções de Busca/Seleção ---
    const fetchConversationMessages = useCallback(async (
        conversationId: string,
        page: number = 1,
        pageSize: number = 20,
        append: boolean = false,
        orderBy?: 'asc' | 'desc'
    ): Promise<Message[]> => {
        if (!append && messageCache[conversationId]) {
             setSelectedConversationMessages(messageCache[conversationId]);
             setLoadingSelectedConversationMessages(false);
            return messageCache[conversationId];
        }
        if (append) {
            setIsLoadingMoreMessages(true);
        } else {
            setLoadingSelectedConversationMessages(true);
            setCurrentMessagesPage(page);
            setHasMoreMessages(true);
        }
        setSelectedConversationError(null);
        try {
            const offset = (page - 1) * pageSize;
            let fetchedMessages: Message[];
            let hasMore: boolean;

            if (!append) {
                // Initial load: Fetch most recent messages in DESC order from API
                // API should return the LAST 'pageSize' messages when orderBy is 'desc' and offset is 0
                // Temporarily log the parameters being passed to the API function
                console.log(`[ConversationContext] fetchConversationMessages: Initial load API call params - conversationId: ${conversationId}, offset: 0, limit: ${pageSize}, orderBy: desc`);
                const result = await fetchConversationMessagesApi(conversationId, 0, pageSize, 'desc');
                fetchedMessages = result.data;
                hasMore = result.hasMore;

            } else {
                // Load more (append): Fetch older messages in ASC order from API
                // Use the existing offset logic
                // Temporarily log the parameters being passed to the API function
                console.log(`[ConversationContext] fetchConversationMessages: Append load API call params - conversationId: ${conversationId}, offset: ${offset}, limit: ${pageSize}, orderBy: asc`);
                const result = await fetchConversationMessagesApi(conversationId, offset, pageSize, 'asc');
                fetchedMessages = result.data;
                hasMore = result.hasMore;
            }

            if (append) {
                setMessageCache(prev => {
                    const currentMessages = prev[conversationId] || [];
                    const combined = [...fetchedMessages, ...currentMessages];
                    const uniqueMessagesMap = new Map(combined.map(item => [item.id, item]));
                    return { ...prev, [conversationId]: Array.from(uniqueMessagesMap.values()) };
                });
                setSelectedConversationMessages(prev => {
                    const combined = [...fetchedMessages, ...prev];
                    const uniqueMessagesMap = new Map(combined.map(item => [item.id, item]));
                    return Array.from(uniqueMessagesMap.values());
                });
            } else {
                // Initial load: Use fetchedMessages directly (already DESC from API) and store in cache
                // This order is correct for the UI rendering from bottom up.
                setMessageCache(prev => ({ ...prev, [conversationId]: fetchedMessages }));
                setSelectedConversationMessages(fetchedMessages);
            }
            setHasMoreMessages(hasMore);
            return fetchedMessages;
        } catch (err: any) {
            const message = err.message || 'Erro ao buscar mensagens.';
            console.error(`[ConversationContext] Erro ao buscar mensagens para ${conversationId}:`, err);
            setSelectedConversationError(message);
            if (!append) setSelectedConversationMessages([]);
            toast.error(`Erro ao buscar mensagens: ${message}`);
            setHasMoreMessages(false);
            return [];
        } finally {
            setLoadingSelectedConversationMessages(false);
            setIsLoadingMoreMessages(false);
        }
    }, [messageCache, setMessageCache, setSelectedConversationMessages, setLoadingSelectedConversationMessages, setSelectedConversationError]);

    const loadMoreMessages = useCallback(() => {
        if (isLoadingMoreMessages || !hasMoreMessages || !selectedConversation) return;
        const nextPage = currentMessagesPage + 1;
        // For loading more (append), we want OLDER messages, so keep orderBy: 'asc' implicit or explicit
        fetchConversationMessages(selectedConversation.id, nextPage, 20, true, 'asc'); // Explicitly request ASC for append
        setCurrentMessagesPage(nextPage);
    }, [isLoadingMoreMessages, hasMoreMessages, selectedConversation, currentMessagesPage, fetchConversationMessages]);

    const selectConversation = useCallback((conversation: ClientConversation | null) => {
        const newConversationId = conversation?.id ?? null;
        const currentConversationId = selectedConversation?.id ?? null;
        
        if (newConversationId === currentConversationId) return;

        // Limpar estado anterior
        setSelectedConversation(conversation);
        setSelectedConversationMessages([]);
        setSelectedConversationError(null);
        setLoadingSelectedConversationMessages(false);
        setCurrentMessagesPage(1);
        setHasMoreMessages(true);
        
        // Marcar como lida
        if (conversation && unreadConversationIds.has(conversation.id)) {
            setUnreadConversationIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(conversation.id);
                return newSet;
            });
        }

        // CORREÇÃO: Buscar mensagens se houver conversa
        if (conversation) {
            fetchConversationMessages(conversation.id, 1, 20, false, 'desc');
        }
    }, [selectedConversation?.id, fetchConversationMessages, setUnreadConversationIds, unreadConversationIds]);

     const fetchConversations = useCallback(async (
        filter: string = 'ATIVAS',
        workspaceId?: string,
        page: number = 1,
        pageSize: number = 20,
        append: boolean = false,
     ) => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            setConversationsError("Workspace ID não encontrado.");
            setConversations([]);
            selectConversation(null);
            return;
        }
        
        if (append) {
            setIsLoadingMoreConversations(true);
        } else {
            setLoadingConversations(true);
            setCurrentConversationsPage(page);
            setHasMoreConversations(true);
            setCurrentFilter(filter);
        }
        setConversationsError(null);
        
        try {
            const { data: fetchedData, hasMore, totalCounts } = await fetchConversationsApi(filter, wsId, page, pageSize);
            
            if (append) {
                // CORREÇÃO: Append sem mexer na seleção
                setConversations(prev => [...prev, ...fetchedData]);
            } else {
                setConversations(fetchedData);
                console.log(`[ConversationContext] fetchConversations: Setting total counts from API: All=${totalCounts.all}, Human=${totalCounts.human}, AI=${totalCounts.ai}`);
                setTotalCountAll(totalCounts.all);
                setTotalCountHuman(totalCounts.human);
                setTotalCountAi(totalCounts.ai);
            }
            setHasMoreConversations(hasMore);

            // CORREÇÃO: Só alterar seleção se não for append
            if (!append) {
                const currentSelectedId = selectedConversation?.id;
                const listHasSelected = fetchedData.some(c => c.id === currentSelectedId);

                if (!currentSelectedId && fetchedData.length > 0) {
                    selectConversation(fetchedData[0]);
                } else if (currentSelectedId && !listHasSelected && fetchedData.length === 0) {
                    selectConversation(null);
                }
            }

        } catch (err: any) {
            console.error("[ConversationContext] Erro ao buscar conversas:", err);
            const message = err.message || 'Erro ao buscar conversas.';
            setConversationsError(message);
            if (!append) {
                setConversations([]);
                selectConversation(null);
            }
            toast.error(message);
        } finally {
            setLoadingConversations(false);
            setIsLoadingMoreConversations(false);
        }
    }, [workspaceContext.workspace?.id, selectedConversation?.id, selectConversation]);

    const loadMoreConversations = useCallback(() => {
        if (isLoadingMoreConversations || !hasMoreConversations) return;
        const nextPage = currentConversationsPage + 1;
        fetchConversations(currentFilter, undefined, nextPage, 20, true);
        setCurrentConversationsPage(nextPage);
    }, [isLoadingMoreConversations, hasMoreConversations, currentConversationsPage, fetchConversations, currentFilter]);

    const clearMessagesError = useCallback(() => {
        setSelectedConversationError(null);
    }, []);

    // --- Handlers (precisam estar declarados antes do useEffect do Pusher) ---
    const updateOrAddOptimisticallyInList = useCallback((message: Message) => {
        setConversations(prev => {
            const conversationId = message.conversation_id;
            const existingIndex = prev.findIndex(c => c.id === conversationId);
            let newList = [...prev];
            if (existingIndex !== -1) {
                const updatedConvo = {
                    ...newList[existingIndex],
                    last_message: message,
                    last_message_timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString(),
                    status: 'ACTIVE',
                };
                newList.splice(existingIndex, 1);
                newList.unshift(updatedConvo);
            } else {
                 const clientInfo = message.metadata as any;
                 const partialClient = {
                     id: clientInfo?.clientId || 'unknown',
                     name: clientInfo?.clientName || 'Novo Contato',
                     phone_number: clientInfo?.clientPhone || '',
                 };
                const newOptimisticConvo: ClientConversation = {
                    id: conversationId,
                    workspace_id: workspaceContext.workspace?.id || 'unknown',
                    client_id: partialClient.id,
                    channel: (message.metadata as any)?.channel || 'WHATSAPP_EVOLUTION',
                    status: 'ACTIVE',
                    is_ai_active: true,
                    last_message_at: message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_message: message,
                    last_message_timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString(),
                    client: partialClient,
                    channel_conversation_id: null,
                    metadata: null,
                    activeFollowUp: null,
                };
                newList.unshift(newOptimisticConvo);
            }
            return newList;
        });
    }, [workspaceContext.workspace?.id]);

    const handleRealtimeNewMessage = useCallback((message: Message) => {
        if (!message || !message.id || !message.conversation_id) {
              return;
         }

        setMessageCache(prevCache => {
            const current = prevCache[message.conversation_id] || [];
            if (current.some(m => m.id === message.id)) {
                return prevCache;
            }
            const newMessages = [
                ...current.filter(m => !m.id.startsWith('optimistic-')),
                message
            ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return { ...prevCache, [message.conversation_id]: newMessages };
        });

        if (selectedConversation?.id === message.conversation_id) {
            setSelectedConversationMessages(prev => {
                if (prev.some(m => m.id === message.id)) {
                    return prev;
                }
                const updatedMessages = [
                    ...prev.filter(m => !m.id.startsWith('optimistic-')),
                    message
                ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                return updatedMessages;
            });
        }
        updateOrAddOptimisticallyInList(message);
        if (selectedConversation?.id !== message.conversation_id) {
            setUnreadConversationIds(prev => new Set(prev).add(message.conversation_id));
        }
    }, [selectedConversation, messageCache, updateOrAddOptimisticallyInList, setUnreadConversationIds]);

    const handleRealtimeStatusUpdate = useCallback((data: { 
        id: string; 
        status: string; 
        channel_message_id?: string; 
        errorMessage?: string 
    }) => {
        console.log(`[Status Update] Received data:`, data);

        // Atualizar mensagens selecionadas
        setSelectedConversationMessages(prevMessages => {
            const updatedMessages = prevMessages.map(msg => {
                if (msg.id === data.id) {
                    console.log(`[Status Update] Matched message in selectedConversationMessages: ${msg.id}. Updating status to ${data.status}`);
                    return {
                        ...msg,
                        status: data.status,
                        channel_message_id: data.channel_message_id || msg.channel_message_id,
                        errorMessage: data.errorMessage || msg.errorMessage
                    };
                }
                return msg;
            });
            // If no direct match by ID, try matching by provider_message_id if data.channel_message_id is present
            if (!updatedMessages.some(msg => msg.id === data.id) && data.channel_message_id) {
                console.log(`[Status Update] No direct ID match. Trying to match by channel_message_id: ${data.channel_message_id}`);
                return prevMessages.map(msg => {
                    if (msg.provider_message_id === data.channel_message_id) {
                        console.log(`[Status Update] Matched message by provider_message_id: ${msg.id}. Updating status to ${data.status}`);
                        return {
                            ...msg,
                            status: data.status,
                            channel_message_id: data.channel_message_id || msg.channel_message_id,
                            errorMessage: data.errorMessage || msg.errorMessage
                        };
                    }
                    return msg;
                });
            }
            return updatedMessages;
        });

        // Atualizar cache também
        setMessageCache(prevCache => {
            const updatedCache = { ...prevCache };
            Object.keys(updatedCache).forEach(conversationId => {
                updatedCache[conversationId] = updatedCache[conversationId].map(msg => {
                    if (msg.id === data.id) {
                        console.log(`[Status Update] Matched message in cache for conv ${conversationId}: ${msg.id}. Updating status to ${data.status}`);
                        return {
                            ...msg,
                            status: data.status,
                            channel_message_id: data.channel_message_id || msg.channel_message_id,
                            errorMessage: data.errorMessage || msg.errorMessage
                        };
                    }
                    // If no direct match by ID, try matching by provider_message_id if data.channel_message_id is present
                    if (data.channel_message_id && msg.provider_message_id === data.channel_message_id) {
                        console.log(`[Status Update] Matched message in cache by provider_message_id for conv ${conversationId}: ${msg.id}. Updating status to ${data.status}`);
                        return {
                            ...msg,
                            status: data.status,
                            channel_message_id: data.channel_message_id || msg.channel_message_id,
                            errorMessage: data.errorMessage || msg.errorMessage
                        };
                    }
                    return msg;
                });
            });
            return updatedCache;
        });

        // Atualizar timestamp da conversa
        if (selectedConversation?.id) {
            setConversations(prev =>
                prev.map(conv =>
                    conv.id === selectedConversation.id 
                        ? { ...conv, last_message_at: new Date().toISOString() } 
                        : conv
                )
            );
        }
    }, [selectedConversation?.id, setConversations, setMessageCache]);

    const handleRealtimeAIStatusUpdate = useCallback((data: { conversationId: string; is_ai_active: boolean }) => {
        const { conversationId, is_ai_active } = data;
        console.log(`[Realtime AI Status Update] Received for conversation ${conversationId}, new status: ${is_ai_active}`);

        setConversations(prevConversations => {
            const updatedConversations = prevConversations.map(conv => {
                if (conv.id === conversationId) {
                    console.log(`[Realtime AI Status Update] Updating conversation ${conv.id} from is_ai_active: ${conv.is_ai_active} to ${is_ai_active}`);
                    return { ...conv, is_ai_active: is_ai_active };
                }
                return conv;
            });

            // Recalculate counts
            let newTotalAll = updatedConversations.length;
            let newTotalHuman = updatedConversations.filter(c => c.is_ai_active === false).length;
            let newTotalAi = updatedConversations.filter(c => c.is_ai_active === true).length;

            console.log(`[Realtime AI Status Update] Recalculated counts based on conversations array (length: ${updatedConversations.length}): All=${newTotalAll}, Human=${newTotalHuman}, AI=${newTotalAi}`);

            setTotalCountAll(newTotalAll);
            setTotalCountHuman(newTotalHuman);
            setTotalCountAi(newTotalAi);

            return updatedConversations;
        });

        if (selectedConversation?.id === conversationId) {
            setSelectedConversation(prev => prev ? { ...prev, is_ai_active: is_ai_active } : null);
        }

    }, [selectedConversation?.id, setConversations, setTotalCountAll, setTotalCountHuman, setTotalCountAi]);

    const handleRealtimeConversationUpdate = useCallback((data: { 
        id: string; 
        activeFollowUp?: ActiveFollowUpInfo | null;
        client?: ClientConversation['client']; // Add client info for new conversations
        conversation?: Omit<ClientConversation, 'client' | 'activeFollowUp' | 'last_message' | 'last_message_timestamp'>; // Add conversation info for new conversations
    }) => {
        const { id, activeFollowUp, client, conversation } = data;
        console.log(`[Realtime Conversation Update] Received for conversation ${id}, activeFollowUp:`, activeFollowUp, 'client:', client, 'conversation:', conversation);

        setConversations(prevConversations => {
            // Sempre filtrar para garantir que não haja duplicatas e que a ordem seja mantida
            let updatedConversations = prevConversations.filter(conv => conv.id !== id);

            if (client && conversation) { // Processar se houver dados de cliente e conversa
                const newConvo: ClientConversation = {
                    ...conversation,
                    workspace_id: workspaceContext.workspace?.id || 'unknown',
                    client_id: client.id, // Garante que client_id é populado
                    client: client,
                    activeFollowUp: activeFollowUp || null,
                    last_message: null, // No message in this event, will be added by new_message event
                    last_message_timestamp: new Date(conversation.last_message_at).toISOString(), // Ensure ISO string
                    status: conversation.status, // Explicitly set status
                };
                
                updatedConversations.unshift(newConvo); // Adicionar a nova/atualizada no início
                console.log(`[Realtime Conversation Update] Processed conversation ${id}. New list length: ${updatedConversations.length}`);

                // REMOVIDO: Lógica de incremento de contadores aqui.
                // Os contadores serão recalculados por um useEffect separado.
            } else {
                console.warn(`[Realtime Conversation Update] Conversation ${id} data incomplete or not found in previous list. Skipping add/update.`);
            }
            return updatedConversations;
        });

        // Also update the selected conversation if it's the one being updated
        if (selectedConversation?.id === id) {
            setSelectedConversation(prev => {
                if (!prev) return null;
                const updated = { 
                    ...prev, 
                    ...(activeFollowUp !== undefined && { activeFollowUp }),
                    ...(conversation && { 
                        status: conversation.status,
                        channel: conversation.channel,
                        last_message_at: new Date(conversation.last_message_at).toISOString(), // Ensure ISO string
                        is_ai_active: conversation.is_ai_active,
                    }),
                    ...(client && { client: { ...prev.client, ...client } }),
                    // Garantir que o client_id do selectedConversation também seja atualizado se for uma nova conversa
                    ...(client && !prev.client_id && { client_id: client.id })
                };
                console.log(`[Realtime Conversation Update] Updated selected conversation ${id}:`, updated);
                return updated;
            });
        }
    }, [selectedConversation?.id, setConversations, setSelectedConversation]);

    // --- Ações do Usuário ---
    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string, isPrivateNote?: boolean) => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            toast.error("Workspace ID não encontrado para enviar a mensagem.");
            return;
        }

        // Optimistic update
        const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const newMessage: Message = {
            id: tempId,
            conversation_id: conversationId,
            sender_type: 'AGENT', // Assuming manual message is from an agent
            message_type: 'TEXT', // Corrected property name
            content: content,
            timestamp: new Date().toISOString(),
            status: 'SENDING', // Status de envio
            privates_notes: isPrivateNote || false, // Corrected property name
            channel_message_id: null,
            provider_message_id: null,
            metadata: null,
        };

        // Add optimistic message to UI immediately
        setMessageCache(prev => {
            const currentMessages = prev[conversationId] || [];
            return { ...prev, [conversationId]: [...currentMessages, newMessage] };
        });
        setSelectedConversationMessages(prev => [...prev, newMessage]);
        // Temporarily disable input while sending
        setIsSendingMessage(true); // Set sending state to true

        try {
            const response = await axios.post(`/api/conversations/${conversationId}/messages`, {
                content,
                isPrivateNote: isPrivateNote || false,
                workspaceId: wsId,
            });

            const sentMessage = response.data; // Assuming the API returns the final message object

            // Replace optimistic message with the actual sent message
            setMessageCache(prev => {
                const currentMessages = prev[conversationId] || [];
                const updatedMessages = currentMessages.map(msg => msg.id === tempId ? sentMessage : msg);
                return { ...prev, [conversationId]: updatedMessages };
            });
            setSelectedConversationMessages(prev => prev.map(msg => msg.id === tempId ? sentMessage : msg));

            // Update the conversation in the list with the new last message
            handleRealtimeNewMessage(sentMessage); // Reuse realtime handler to update list

            return sentMessage; // Return the actual message object
        } catch (error: any) {
            console.error('[ConversationContext] Erro ao enviar mensagem manual:', error);
            toast.error("Falha ao enviar mensagem.");

            // Update status of optimistic message to FAILED
            const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
            setMessageCache(prev => {
                const currentMessages = prev[conversationId] || [];
                const updatedMessages = currentMessages.map(msg => msg.id === tempId ? { ...msg, status: 'FAILED', errorMessage: errorMessage } : msg);
                return { ...prev, [conversationId]: updatedMessages };
            });
            setSelectedConversationMessages(prev => prev.map(msg => msg.id === tempId ? { ...msg, status: 'FAILED', errorMessage: errorMessage } : msg));

            throw error; // Re-throw to allow calling component to handle
        } finally {
            // Re-enable input after sending attempt
            setIsSendingMessage(false); // Reset sending state to false
        }
    }, [workspaceContext.workspace?.id, setMessageCache, setSelectedConversationMessages, handleRealtimeNewMessage]);

    const sendTemplateMessage = useCallback(async (conversationId: string, templateData: SendTemplateDataType) => {
        const wsId = getActiveWorkspaceId(workspaceContext);
        if (!wsId) {
            toast.error("Workspace ID não encontrado para enviar o template.");
            return;
        }
        if (!conversationId) {
            toast.error("Conversa não selecionada para enviar o template.");
            return;
        }

        setIsSendingMessage(true); // Set sending state to true

        try {
            // Assuming sendWhatsappTemplateAction handles the API call and returns success/failure
            console.log("LOG PARA O ID CONVERSA", conversationId)
            const result = await sendWhatsappTemplateAction({
                conversationId: conversationId,
                templateName: templateData.name,
                templateLanguage: templateData.language,
                variables: Object.entries(templateData.variables).reduce((acc, [key, value]) => {
                    // WhatsApp API expects 1-based index for variables in components
                    const whatsappKey = (parseInt(key, 10)).toString(); // Ensure key is a number string
                     if (!isNaN(parseInt(key, 10))) {
                         acc[whatsappKey] = value;
                     } else {
                          console.warn(`[ConversationContext] Skipping non-numeric template variable key: ${key}`);
                     }
                    return acc;
                }, {} as Record<string, string>),
                templateBody: templateData.body,
                 clientId: selectedConversation?.client_id || '',
                 workspaceId: wsId,
            });

            if (result.success) {
                toast.success("Template enviado!");
                // O Pusher deve lidar com a adição da mensagem ao UI
            } else {
                // Ação falhou antes mesmo de tentar enviar (ex: validação no server action)
                const errorMessage = result.error || "Falha ao enviar template.";
                console.error("[ConversationContext] Erro no Server Action de template:", result.error);
                toast.error(errorMessage);
            }
        } catch (error: any) {
            // Erro inesperado durante a execução do server action
            const errorMessage = error.message || "Erro inesperado ao enviar template.";
            console.error("[ConversationContext] Erro inesperado ao enviar template:", error);
            toast.error(errorMessage);
        } finally {
            setIsSendingMessage(false); // Reset sending state to false
        }
    }, [workspaceContext, selectedConversation]);

    const sendMediaMessage = useCallback(async (conversationId: string, file: File) => {
        const wsId = getActiveWorkspaceId(workspaceContext);
        if (!wsId) {
            toast.error("Workspace ID não encontrado para enviar a mídia.");
            return;
        }
        if (!conversationId) {
            toast.error("Conversa não selecionada para enviar a mídia.");
            return;
        }
        if (!file) {
            toast.error("Nenhum arquivo selecionado.");
            return;
        }

        setIsSendingMessage(true); // Set sending state to true
        // Note: isUploading prop in InputArea is separate and can be managed there
        // if a separate upload indicator is needed alongside sending.
        // For simplicity, we'll use isSendingMessage to cover both here.

        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversationId', conversationId);
        formData.append('workspaceId', wsId);

        try {
            // Assuming this endpoint handles the media upload and message creation
            const response = await axios.post<{ success: boolean; message?: Message; error?: string }>(`/api/conversations/${conversationId}/media`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (response.data.success && response.data.message) {
                 // O Pusher deve lidar com a adição da mensagem ao UI
                console.log("[ConversationContext] Mídia enviada com sucesso. Mensagem criada:", response.data.message);
                // toast.success("Mídia enviada!"); // Opcional, UI pode mostrar indicador
            } else {
                const errorMessage = response.data.error || "Falha ao enviar mídia pela API.";
                console.error("[ConversationContext] Erro na API de envio de mídia:", errorMessage);
                toast.error(`Falha ao enviar mídia: ${errorMessage}`);
                 throw new Error(errorMessage); // Re-throw to be caught by the finally block
            }
        } catch (error: any) {
            console.error("[ConversationContext] Erro inesperado ao enviar mídia:", error);
            const errorMessage = error.message || "Erro inesperado ao enviar mídia.";
            toast.error(errorMessage);
             throw error; // Re-throw to be caught by the finally block
        } finally {
            setIsSendingMessage(false); // Reset sending state to false
        }
    }, [workspaceContext]);

    const toggleAIStatus = useCallback(async (conversationId: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;

        const wsId = getActiveWorkspaceId(workspaceContext);
        if (!wsId) {
            console.error("[ConversationContext] Workspace ID não encontrado para toggleAIStatus.");
            toast.error("Erro crítico: Workspace não identificado ao tentar alterar status da IA.");
            setConversations(prev =>
                prev.map(conv =>
                    conv.id === conversationId ? { ...conv, is_ai_active: currentStatus } : conv
                )
            );
            if (selectedConversation?.id === conversationId) {
                setSelectedConversation(prev => prev ? { ...prev, is_ai_active: currentStatus } : null);
            }
            return;
        }

        setConversations(prev =>
            prev.map(conv =>
                conv.id === conversationId ? { ...conv, is_ai_active: newStatus } : conv
            )
        );
        if (selectedConversation?.id === conversationId) {
            setSelectedConversation(prev => prev ? { ...prev, is_ai_active: newStatus } : null);
        }

        try {
            const success = await setConversationAIStatus(conversationId, newStatus, wsId);

            if (success) {
                   console.log(`[ConversationContext] Server action setConversationAIStatus executada com sucesso para ${conversationId} (novo status: ${newStatus}). Evento Redis deve atualizar estado final.`);
                 toast.success(`IA ${newStatus ? 'ativada' : 'desativada'} para esta conversa.`);
            } else {
                   console.error(`[ConversationContext] Server action setConversationAIStatus retornou falha para ${conversationId}. Revertendo estado otimista.`);
                  toast.error(`Falha ao ${newStatus ? 'ativar' : 'desativar'} IA. Tente novamente.`);
                   setConversations(prev =>
                       prev.map(conv =>
                           conv.id === conversationId ? { ...conv, is_ai_active: currentStatus } : conv
                       )
                   );
                   if (selectedConversation?.id === conversationId) {
                       setSelectedConversation(prev => prev ? { ...prev, is_ai_active: currentStatus } : null);
                   }
            }

        } catch (error: any) {
            console.error(`[ConversationContext] Erro ao chamar server action setConversationAIStatus para ${conversationId}:`, error);
            toast.error(`Erro ao ${newStatus ? 'ativar' : 'desativar'} IA: ${error.message || 'Erro desconhecido'}`);
               setConversations(prev =>
                   prev.map(conv =>
                       conv.id === conversationId ? { ...conv, is_ai_active: currentStatus } : conv
                   )
               );
               if (selectedConversation?.id === conversationId) {
                   setSelectedConversation(prev => prev ? { ...prev, is_ai_active: currentStatus } : null);
               }
        }
    }, [workspaceContext, selectedConversation?.id, setConversations, setSelectedConversation]);

    const selectConversationForClient = useCallback(async (clientId: string, workspaceId: string): Promise<ClientConversation | null> => {
        if (!clientId || !workspaceId) {
             toast.error("Não foi possível selecionar a conversa: dados incompletos.");
            return null;
        }
         setLoadingSelectedConversationMessages(true);
         setSelectedConversationError(null);

        try {
             const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
                 '/api/conversations', 
                 { params: { workspaceId, clientId, status: 'ALL' } }
             );

             let conversationToSelect: ClientConversation | null = null;

             if (response.data.success && response.data.data && response.data.data.length > 0) {
                   conversationToSelect = response.data.data.sort((a,b) =>
                       new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
                   )[0];
             } else {
                   console.warn(`[ConversationContext] Nenhuma conversa encontrada via API para cliente ${clientId}. Tentando buscar no cache de conversas.`);
                   const cachedConversation = conversations.find(c => c.client_id === clientId && c.workspace_id === workspaceId);
                   if (cachedConversation) {
                       conversationToSelect = cachedConversation;
                   } else {
                       console.warn(`[ConversationContext] Nenhuma conversa encontrada para cliente ${clientId} (nem API, nem cache).`);
                        toast.error("Nenhuma conversa ativa encontrada para este cliente.");
                        setLoadingSelectedConversationMessages(false);
                        return null;
                   }
             }

             if (conversationToSelect) {
                  selectConversation(conversationToSelect);
                 return conversationToSelect;
             }
             setLoadingSelectedConversationMessages(false);
             return null;

        } catch (error: any) {
            console.error(`[ConversationContext] Erro ao buscar/selecionar conversa para cliente ${clientId}:`, error);
            toast.error(`Erro ao carregar conversa: ${error.message || 'Erro desconhecido'}`);
            setLoadingSelectedConversationMessages(false);
            return null;
        }
    }, [selectConversation, conversations, setLoadingSelectedConversationMessages, setSelectedConversationError]);

    const { isConnected: isPusherConnected, loadingConfig: loadingPusherConfig } = useWorkspacePusher(
        workspaceContext.workspace?.id,
        {
            onNewMessage: handleRealtimeNewMessage,
            onStatusUpdate: handleRealtimeStatusUpdate,
            onAIStatusUpdate: handleRealtimeAIStatusUpdate,
            onConversationUpdate: handleRealtimeConversationUpdate,
        }
    );

    // Implementação da nova função
    const removeConversationByClientId = useCallback((clientId: string) => {
        setConversations(prevConversations =>
            prevConversations.filter(conv => conv.client?.id !== clientId)
        );
         // Opcional: se a conversa removida for a selecionada, deselecionar
         if (selectedConversation?.client?.id === clientId) {
             setSelectedConversation(null);
         }
    }, [selectedConversation]); // Adicionar selectedConversation como dependência

    // --- Valor do Contexto ---
    const contextValue = useMemo(() => ({
        conversations,
        loadingConversations,
        isLoadingMoreConversations,
        hasMoreConversations,
        conversationsError,
        selectedConversation,
        selectedConversationMessages,
        loadingSelectedConversationMessages,
        isLoadingMoreMessages,
        hasMoreMessages,
        selectedConversationError,
        messageCache,
        unreadConversationIds,
        setUnreadConversationIds,
        isSendingMessage,
        isTogglingAIStatus,
        isPusherConnected,
        loadingPusherConfig,
        totalCountAll,
        totalCountHuman,
        totalCountAi,
        fetchConversations,
        fetchConversationMessages,
        loadMoreConversations,
        loadMoreMessages,
        selectConversation,
        clearMessagesError,
        handleRealtimeNewMessage,
        handleRealtimeStatusUpdate,
        handleRealtimeAIStatusUpdate,
        handleRealtimeConversationUpdate,
        selectConversationForClient,
        sendManualMessage,
        sendTemplateMessage, sendMediaMessage, toggleAIStatus,
        removeConversationByClientId,
    }), [
        conversations, loadingConversations, isLoadingMoreConversations, hasMoreConversations, conversationsError,
        selectedConversation,
        selectedConversationMessages, loadingSelectedConversationMessages, isLoadingMoreMessages, hasMoreMessages, selectedConversationError,
        messageCache, unreadConversationIds, isSendingMessage, isTogglingAIStatus,
        isPusherConnected, loadingPusherConfig,
        fetchConversations, fetchConversationMessages, loadMoreConversations, loadMoreMessages, selectConversation, clearMessagesError,
        handleRealtimeNewMessage, handleRealtimeStatusUpdate, handleRealtimeAIStatusUpdate,
        selectConversationForClient,
        sendManualMessage,
        sendTemplateMessage, sendMediaMessage, toggleAIStatus,
        totalCountAll, totalCountHuman, totalCountAi,
        removeConversationByClientId,
    ]);

    return (
        <ConversationContext.Provider value={contextValue}>
            {children}
        </ConversationContext.Provider>
    );
};

// --- Hook Customizado ---
export const useConversationContext = (): ConversationContextType => {
    const context = useContext(ConversationContext);
    if (context === undefined) {
        throw new Error('useConversationContext must be used within a ConversationProvider');
    }
    return context;
};
