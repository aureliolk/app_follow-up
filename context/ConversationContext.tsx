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
    SetStateAction,
    useRef
} from 'react';
import type {
    Message,
    ClientConversation,
} from '@/app/types';
import { useWorkspace } from '@/context/workspace-context';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { sendWhatsappTemplateAction } from '@/lib/actions/whatsappActions';
import { setConversationAIStatus } from '@/lib/actions/conversationActions';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';

// --- Helper Function --- //
const getActiveWorkspaceId = (workspaceCtx: any, providedId?: string): string | null => {
    if (providedId) return providedId;
    if (workspaceCtx?.workspace?.id) return workspaceCtx.workspace.id;
    console.warn("[ConversationContext] Could not determine active Workspace ID from context.");
    return null;
};

// <<< Adicionar getMessageTypeFromMime aqui >>>
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
    hasMoreConversations: boolean;
    isLoadingMoreConversations: boolean;

    // Funções de Busca/Seleção
    fetchConversations: (filter?: string, workspaceId?: string, page?: number, append?: boolean) => Promise<void>;
    loadMoreConversations: () => void;
    fetchConversationMessages: (conversationId: string, page?: number, append?: boolean) => Promise<Message[]>;
    loadMoreConversationMessages: (conversationId: string) => void;
    selectConversation: (conversation: ClientConversation | null) => void;
    clearMessagesError: () => void;

    // Handlers para serem chamados pelo WebSocketProvider
    handleRealtimeNewMessage: (message: Message) => void;
    handleRealtimeStatusUpdate: (data: any) => void;
    handleRealtimeAIStatusUpdate: (data: { conversationId: string; is_ai_active: boolean }) => void;
    // handleRealtimeContentUpdate: (data: any) => void; // Adicionar se necessário

    // Funções de Ação Direta no Contexto
    selectConversationForClient: (clientId: string, workspaceId: string) => Promise<ClientConversation | null>;

    // Ações do Usuário (Placeholders - para serem implementadas com Server Actions)
    sendManualMessage: (conversationId: string, content: string, workspaceId?: string, isPrivateNote?: boolean) => Promise<void>; 
    sendTemplateMessage: (conversationId: string, templateData: SendTemplateDataType) => Promise<void>; 
    sendMediaMessage: (conversationId: string, file: File) => Promise<void>; 
    toggleAIStatus: (conversationId: string, currentStatus: boolean) => Promise<void>;
}

// --- Criação do Contexto --- //
const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

// --- Componente Provider (Estado) --- //
export const ConversationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const workspaceContext = useWorkspace();
    const { data: session } = useSession();

    // --- Estados --- //
    const [conversations, setConversations] = useState<ClientConversation[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [conversationsError, setConversationsError] = useState<string | null>(null);
    const [selectedConversation, setSelectedConversation] = useState<ClientConversation | null>(null);
    const [selectedConversationMessages, setSelectedConversationMessages] = useState<Message[]>([]);
    const [loadingSelectedConversationMessages, setLoadingSelectedConversationMessages] = useState(false);
    const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [currentMessagePage, setCurrentMessagePage] = useState(1);
    const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [selectedConversationError, setSelectedConversationError] = useState<string | null>(null);
    const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});
    const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [isTogglingAIStatus, setIsTogglingAIStatus] = useState(false);
    const [isPusherConnected, setIsPusherConnected] = useState(false);
    const [pusherConfig, setPusherConfig] = useState<{ pusherKey: string; pusherCluster: string } | null>(null);
    const [loadingPusherConfig, setLoadingPusherConfig] = useState(true);

    const [currentPage, setCurrentPage] = useState(1);
    const [hasMoreConversations, setHasMoreConversations] = useState(true);
    const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
    const [currentFilter, setCurrentFilter] = useState('ATIVAS');

    // --- Refs para Pusher --- //
    const pusherRef = useRef<Pusher | null>(null);
    const channelRef = useRef<Channel | null>(null);

    // --- Efeito para Carregar Estado Inicial de Não Lidos do Local Storage --- //
    useEffect(() => {
      const wsId = workspaceContext.workspace?.id;
      if (wsId) {
        const storageKey = `unreadConversationIds_${wsId}`;
        try {
          const storedUnread = localStorage.getItem(storageKey);
          if (storedUnread) {
            const parsedIds = JSON.parse(storedUnread);
            if (Array.isArray(parsedIds)) {
              // console.log(`[ConversationContext] Loaded ${parsedIds.length} unread IDs from Local Storage for ${wsId}`); // DEBUG
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

    // --- Efeito para Salvar Estado de Não Lidos no Local Storage --- //
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

    // --- Efeito para Buscar Configuração Pusher da API --- //
    useEffect(() => {
      // console.log('[ConversationContext] Fetching Pusher config from API...'); // DEBUG
      setLoadingPusherConfig(true);
      axios.get<{ pusherKey: string; pusherCluster: string }>('/api/config')
        .then(response => {
          if (response.data && response.data.pusherKey && response.data.pusherCluster) {
            // console.log('[ConversationContext] Pusher config received:', response.data); // DEBUG
            setPusherConfig(response.data);
          } else {
            throw new Error('Invalid config data received from API');
          }
        })
        .catch(error => {
          const errorMsg = error.response?.data?.error || error.message || 'Failed to fetch Pusher configuration';
          console.error('[ConversationContext] Error fetching Pusher config:', errorMsg);
          toast.error(`Erro ao carregar configuração real-time: ${errorMsg}`);
          setPusherConfig(null);
        })
        .finally(() => {
          setLoadingPusherConfig(false);
        });
    }, []);

    // --- Funções de Busca/Seleção --- //
    const fetchConversationMessages = useCallback(async (
        conversationId: string,
        page: number = 1,
        append: boolean = false
    ): Promise<Message[]> => {
        if (messageCache[conversationId] && !append) {
            setSelectedConversationMessages(messageCache[conversationId]);
            setLoadingSelectedConversationMessages(false);
            return messageCache[conversationId];
        }
        if (append) {
            setIsLoadingMoreMessages(true);
        } else {
            setLoadingSelectedConversationMessages(true);
        }
        setSelectedConversationError(null);
        try {
            const response = await axios.get<{ success: boolean, data?: Message[], hasMore?: boolean, error?: string }>(
                `/api/conversations/${conversationId}/messages`,
                { params: { offset: (page - 1) * 20, limit: 20 } }
            );
            if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao carregar mensagens da API');
            const fetchedMessages = response.data.data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            setHasMoreMessages(response.data.hasMore ?? false);
            if (append) {
                setMessageCache(prev => ({ ...prev, [conversationId]: [...(prev[conversationId] || []), ...fetchedMessages] }));
                setSelectedConversationMessages(prev => [...prev, ...fetchedMessages]);
            } else {
                setMessageCache(prev => ({ ...prev, [conversationId]: fetchedMessages }));
                setSelectedConversationMessages(fetchedMessages);
            }
            return fetchedMessages;
        } catch (err: any) {
            const message = err.response?.data?.error || err.message || 'Erro ao buscar mensagens.';
            setSelectedConversationError(message);
            setSelectedConversationMessages([]);
            toast.error(`Erro ao buscar mensagens: ${message}`);
            return [];
        } finally {
            setLoadingSelectedConversationMessages(false);
            setIsLoadingMoreMessages(false);
        }
    }, [messageCache, setMessageCache, setSelectedConversationMessages, setLoadingSelectedConversationMessages, setSelectedConversationError]);

    const loadMoreConversationMessages = useCallback((conversationId: string) => {
        if (!isLoadingMoreMessages && hasMoreMessages) {
            const nextPage = currentMessagePage + 1;
            fetchConversationMessages(conversationId, nextPage, true);
            setCurrentMessagePage(nextPage);
        }
    }, [isLoadingMoreMessages, hasMoreMessages, currentMessagePage, fetchConversationMessages]);

    const selectConversation = useCallback((conversation: ClientConversation | null) => {
        const newConversationId = conversation?.id ?? null;
        const currentConversationId = selectedConversation?.id ?? null;
        if (newConversationId === currentConversationId) return;

        // console.log(`[ConversationContext] Selecting conversation: ${newConversationId}`); // DEBUG
        setSelectedConversation(conversation);
        setSelectedConversationMessages([]);
        setSelectedConversationError(null);
        setLoadingSelectedConversationMessages(false);
        setCurrentMessagePage(1);
        setHasMoreMessages(true);

        if (conversation) {
            fetchConversationMessages(conversation.id);
            setUnreadConversationIds(prev => {
                if (prev.has(conversation.id)) {
                    const newSet = new Set(prev);
                    newSet.delete(conversation.id);
                    return newSet;
                }
                return prev;
            });
        } 
    }, [selectedConversation, setUnreadConversationIds, messageCache, fetchConversationMessages]);

     const fetchConversations = useCallback(async (
        filter = 'ATIVAS',
        workspaceId?: string,
        page: number = 1,
        append: boolean = false
    ) => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            setConversationsError("Workspace ID não encontrado.");
            setConversations([]);
            selectConversation(null);
            return;
        }
        // console.log(`[ConversationContext] Fetching conversations for ws: ${wsId}, filter: ${filter}, page: ${page}`); // DEBUG
        if (append) {
            setIsLoadingMoreConversations(true);
        } else {
            setLoadingConversations(true);
            setCurrentPage(page);
        }
        setConversationsError(null);
        try {
            const response = await axios.get<{ success: boolean, data?: ClientConversation[], hasMore?: boolean, error?: string }>(
                '/api/conversations', { params: { workspaceId: wsId, status: filter, page, pageSize: 20 } }
            );
            if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao carregar conversas');
            const fetchedData = response.data.data;
            setHasMoreConversations(response.data.hasMore ?? false);
            if (append) {
                setConversations(prev => [...prev, ...fetchedData]);
            } else {
                setConversations(fetchedData);
            }
            // console.log(`[ConversationContext] Fetched ${fetchedData.length} conversations with filter ${filter}.`); // DEBUG

            // Lógica de auto-seleção
            const currentSelectedId = selectedConversation?.id;
            const listHasSelected = fetchedData.some(c => c.id === currentSelectedId);

            if (currentSelectedId && !listHasSelected) {
                 // Se a selecionada não está mais na lista (ex: mudou de status), deseleciona ou seleciona a primeira
                // console.log(`[ConversationContext] Selected conversation ${currentSelectedId} not in fetched list (${filter}). ${fetchedData.length > 0 ? 'Selecting first.' : 'Deselecting.'}`); // DEBUG
                 selectConversation(fetchedData.length > 0 ? fetchedData[0] : null);
            } else if (!currentSelectedId && fetchedData.length > 0) {
                // Se nada estava selecionado e a lista não está vazia, seleciona a primeira
                 // console.log(`[ConversationContext] No conversation selected. Selecting first: ${fetchedData[0].id}`); // DEBUG
                 selectConversation(fetchedData[0]);
            } else if (!currentSelectedId && fetchedData.length === 0) {
                 // Se nada selecionado e lista vazia, garante deseleção
                 selectConversation(null);
            }
            // Caso contrário (selecionada está na lista OU nada selecionado e lista vazia), mantém o estado atual.

        } catch (err: any) {
            console.error("[ConversationContext] Erro ao buscar conversas:", err);
            const message = err.response?.data?.error || err.message || 'Erro ao buscar conversas.';
            setConversationsError(message);
            setConversations([]);
            selectConversation(null);
            toast.error(message);
        } finally {
            setLoadingConversations(false);
            setIsLoadingMoreConversations(false);
            setCurrentFilter(filter);
        }
    }, [workspaceContext.workspace?.id, selectedConversation?.id, selectConversation]);

    const loadMoreConversations = useCallback(() => {
        if (!loadingConversations && !isLoadingMoreConversations && hasMoreConversations) {
            const nextPage = currentPage + 1;
            fetchConversations(currentFilter, undefined, nextPage, true);
            setCurrentPage(nextPage);
        }
    }, [loadingConversations, isLoadingMoreConversations, hasMoreConversations, currentPage, currentFilter, fetchConversations]);

    const clearMessagesError = useCallback(() => {
        setSelectedConversationError(null);
    }, []);

    // --- Handlers (precisam estar declarados antes do useEffect do Pusher) --- //
    const updateOrAddOptimisticallyInList = useCallback((message: Message) => {
        // console.log(`[ConversationContext] updateOrAddOptimisticallyInList called for Msg ID ${message.id}`); // DEBUG
        setConversations(prev => {
            const conversationId = message.conversation_id;
            const existingIndex = prev.findIndex(c => c.id === conversationId);
            let newList = [...prev];
            if (existingIndex !== -1) {
                // console.log(`[ConversationContext] Updating existing conversation ${conversationId}`); // DEBUG
                const updatedConvo = {
                    ...newList[existingIndex],
                    last_message: message,
                    last_message_timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString(),
                    status: 'ACTIVE', // Garante que está ativa ao receber msg
                };
                newList.splice(existingIndex, 1);
                newList.unshift(updatedConvo);
            } else {
                 // console.log(`[ConversationContext] Adding new optimistic conversation ${conversationId}`); // DEBUG
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
                    channel: (message.metadata as any)?.channel || 'WHATSAPP',
                    status: 'ACTIVE',
                    is_ai_active: true, // Default assumption
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
                 // Consider fetching full conversation details later?
                 // setTimeout(() => fetchConversations(undefined, workspaceContext.workspace?.id), 5000);
            }
            return newList;
        });
    }, [workspaceContext.workspace?.id]);

    const handleRealtimeNewMessage = useCallback((message: Message) => {
        if (!message || !message.id || !message.conversation_id) {
             console.warn("[ConversationContext] handleRealtimeNewMessage received invalid message structure:", message);
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

        // Atualiza as Mensagens Selecionadas (SE for a conversa ativa)
        if (selectedConversation?.id === message.conversation_id) {
            setSelectedConversationMessages(prev => {
                // Evita duplicados no estado selecionado
                if (prev.some(m => m.id === message.id)) {
                    return prev; // Retorna o estado anterior sem adicionar
                }
                // Adiciona nova mensagem e remove otimistas
                const updatedMessages = [
                    ...prev.filter(m => !m.id.startsWith('optimistic-')),
                    message
                ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                return updatedMessages; // Retorna o novo estado com a mensagem adicionada
            });
        }
        updateOrAddOptimisticallyInList(message);
        if (selectedConversation?.id !== message.conversation_id) {
            setUnreadConversationIds(prev => new Set(prev).add(message.conversation_id));
        }
    }, [selectedConversation, messageCache, updateOrAddOptimisticallyInList, setUnreadConversationIds]);

    const handleRealtimeStatusUpdate = useCallback((data: any) => {
         const { messageId, conversation_id, newStatus, providerMessageId, errorMessage } = data;
         if (!messageId || !conversation_id || !newStatus) {
             console.warn("[ConversationContext] handleRealtimeStatusUpdate received invalid data structure in payload:", data);
             return;
         }

         setMessageCache(prevCache => {
             const conversationMessages = prevCache[conversation_id];
             if (!conversationMessages) return prevCache;

             const messageIndex = conversationMessages.findIndex(m => m.id === messageId || (providerMessageId && m.provider_message_id === providerMessageId));
             if (messageIndex === -1) return prevCache;

             const updatedMessages = [...conversationMessages];
             const updatedMessage = {
                 ...updatedMessages[messageIndex],
                 status: newStatus,
                 provider_message_id: providerMessageId || updatedMessages[messageIndex].provider_message_id,
                 error_message: errorMessage || null,
             };
             updatedMessages[messageIndex] = updatedMessage;
             return { ...prevCache, [conversation_id]: updatedMessages };
         });

         if (selectedConversation?.id === conversation_id) {
             setSelectedConversationMessages(prev => {
                 const messageIndex = prev.findIndex(m => m.id === messageId || (providerMessageId && m.provider_message_id === providerMessageId));
                 if (messageIndex === -1) return prev;

                 const updatedMessages = [...prev];
                 const updatedMessage = {
                     ...updatedMessages[messageIndex],
                     status: newStatus,
                     provider_message_id: providerMessageId || updatedMessages[messageIndex].provider_message_id,
                     error_message: errorMessage || null,
                 };
                 updatedMessages[messageIndex] = updatedMessage;
                 return updatedMessages;
             });
         }
         // Atualiza o status na lista geral de conversas se necessário (ex: para mostrar "falha" na lista)
         setConversations(prev => prev.map(conv => {
             if (conv.id === conversation_id && conv.last_message?.id === messageId) {
                 return {
                     ...conv,
                     last_message_status: newStatus,
                 };
             }
             return conv;
         }));
    }, [selectedConversation, messageCache, setMessageCache, setSelectedConversationMessages, setConversations]);

    // NEW HANDLER FUNCTION for AI status updates from Pusher
    const handleRealtimeAIStatusUpdate = useCallback((data: { conversationId: string; is_ai_active: boolean }) => {
        const { conversationId, is_ai_active } = data;
        console.log(`[ConversationContext] Received 'ai_status_updated' event via Pusher. Conv ID: ${conversationId}, New AI Status: ${is_ai_active}`);

        setConversations(prev =>
            prev.map(conv =>
                conv.id === conversationId ? { ...conv, is_ai_active: is_ai_active } : conv
            )
        );

        if (selectedConversation?.id === conversationId) {
            setSelectedConversation(prev => prev ? { ...prev, is_ai_active: is_ai_active } : null);
        }

        // Opcional: Adicionar um toast ou log para confirmar a atualização via Pusher
        // toast.info(`Status da IA atualizado para conversa ${conversationId} via evento.`);

    }, [selectedConversation?.id]);

    // --- Ações do Usuário (precisam estar declaradas antes do useEffect do Pusher) --- //
    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string, isPrivateNote: boolean = false) => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            toast.error("Não foi possível determinar o workspace ativo.");
            return;
        }
        if (!content.trim()) {
            toast.error("A mensagem não pode estar vazia.");
            return;
        }

        // Otimista: Adicionar mensagem localmente
        const optimisticId = `optimistic-${Date.now()}`;
        const optimisticMessage: Message = {
            id: optimisticId,
            conversation_id: conversationId,
            sender_type: 'AGENT',
            content: content,
            timestamp: new Date().toISOString(),
            status: 'PENDING',
            message_type: 'TEXT',
            channel_message_id: null,
            metadata: { senderName: session?.user?.name || 'Agente' },
            media_url: null,
            media_mime_type: null,
            media_filename: null,
            provider_message_id: null,
        };

        // Adiciona à lista de mensagens selecionadas (se for a conversa atual)
        if (selectedConversation?.id === conversationId) {
            setSelectedConversationMessages(prev => [...prev, optimisticMessage]);
        }
        // Adiciona ao cache
        setMessageCache(prevCache => ({
            ...prevCache,
            [conversationId]: [...(prevCache[conversationId] || []), optimisticMessage]
        }));

        setIsSendingMessage(true);
        try {
            // console.log(`[ConversationContext] Sending manual message to conv ${conversationId}. Content: ${content}`); // DEBUG
            const response = await axios.post<{ success: boolean, message?: Message, error?: string }>(
                `/api/conversations/${conversationId}/messages`,
                { content, isPrivateNote }
            );

            if (!response.data.success || !response.data.message) {
                throw new Error(response.data.error || 'Falha ao enviar mensagem pela API');
            }

            const sentMessage = response.data.message;
            // console.log(`[ConversationContext] Manual message sent successfully. Server Msg ID: ${sentMessage.id}`); // DEBUG

            // A lista de conversas será atualizada pelo SSE/WebSocket `handleRealtimeNewMessage`
            // que deve ser acionado pelo Redis publish na API route.
            toast.success("Mensagem enviada!");

        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message || 'Erro desconhecido ao enviar mensagem.';
            console.error("[ConversationContext] Erro ao enviar mensagem manual:", errorMsg);
            toast.error(`Falha ao enviar: ${errorMsg}`);

            // Atualizar mensagem otimista para FALHOU
             const updateStateWithError = () => {
                 console.log(`[ConversationContext] Updating optimistic message ${optimisticId} to FAILED status.`);
                // Apenas atualiza o status, já que errorMessage não parece existir no tipo Message
                const failedMessage = { ...optimisticMessage, status: 'FAILED' } as Message;
                if (selectedConversation?.id === conversationId) {
                    setSelectedConversationMessages(prev =>
                        prev.map(m => m.id === optimisticId ? failedMessage : m)
                    );
                }
                 setMessageCache(prevCache => {
                     const current = prevCache[conversationId] || [];
                     return {
                         ...prevCache,
                         [conversationId]: current.map(m => m.id === optimisticId ? failedMessage : m)
                     };
                 });
             };
             updateStateWithError();

        } finally {
            setIsSendingMessage(false);
        }
    }, [workspaceContext, selectedConversation, session]);

    const sendTemplateMessage = useCallback(async (conversationId: string, templateData: SendTemplateDataType) => {
        const wsId = getActiveWorkspaceId(workspaceContext, undefined);
        const currentClientId = selectedConversation?.client_id;

        if (!wsId || !currentClientId) {
            toast.error("Workspace ou Cliente não selecionado corretamente.");
            return;
        }
        if (!templateData || !templateData.name || !templateData.language || !templateData.body) {
            toast.error("Dados do template incompletos.");
            return;
        }

        // Renderiza o template localmente para UI otimista
        let renderedContent = templateData.body;
        try {
            Object.entries(templateData.variables || {})
              .sort(([keyA], [keyB]) => parseInt(keyA) - parseInt(keyB)) // Garante ordem numérica {{1}}, {{2}}...
              .forEach(([key, value]) => {
                const placeholder = `{{\s*${key}\s*}}`; 
                renderedContent = renderedContent.replace(new RegExp(placeholder, 'g'), value || '');
              });
        } catch (renderError) {
            console.error("[ConversationContext] Erro ao renderizar template para UI otimista:", renderError);
            // Usa corpo não renderizado como fallback na UI otimista
            renderedContent = `(Template: ${templateData.name}) ${templateData.body}`;
        }

        // Otimista: Adicionar mensagem localmente
        const optimisticId = `optimistic-${Date.now()}`;
        const optimisticMessage: Message = {
            id: optimisticId,
            conversation_id: conversationId,
            sender_type: 'AGENT', // Templates são geralmente enviados por agentes/sistema
            content: renderedContent, // Usa o conteúdo renderizado localmente
            timestamp: new Date().toISOString(),
            status: 'SENDING',
            message_type: 'TEMPLATE', // Tipo específico
            channel_message_id: null,
            metadata: { 
                senderName: session?.user?.name || 'Sistema',
                templateName: templateData.name,
                templateLanguage: templateData.language,
             }, 
            media_url: null,
            media_mime_type: null,
            media_filename: null,
            provider_message_id: null,
        };

        // Adiciona otimista ao estado
        if (selectedConversation?.id === conversationId) {
            setSelectedConversationMessages(prev => [...prev, optimisticMessage]);
        }
        setMessageCache(prevCache => ({
            ...prevCache,
            [conversationId]: [...(prevCache[conversationId] || []), optimisticMessage]
        }));

        setIsSendingMessage(true);
        try {
            console.log(`[ConversationContext] Calling sendWhatsappTemplateAction for conv ${conversationId}, template: ${templateData.name}`);
            
            const result = await sendWhatsappTemplateAction({
                conversationId: conversationId,
                workspaceId: wsId,
                clientId: currentClientId,
                templateName: templateData.name,
                templateLanguage: templateData.language,
                variables: templateData.variables || {},
                templateBody: templateData.body, // Passa o body original para a action renderizar também
            });

            if (!result.success) {
                throw new Error(result.error || 'Falha ao enviar template via Server Action');
            }

            console.log(`[ConversationContext] Template action successful. Provider Msg ID (WAMID): ${result.messageId}`);
            toast.success("Template enviado!");
            
            // A atualização final da mensagem (com status correto e ID real) 
            // deve vir pelo evento SSE/WebSocket (`handleRealtimeNewMessage` e `handleRealtimeStatusUpdate`)
            // Opcional: atualizar o WAMID na mensagem otimista se necessário imediatamente
            setMessageCache(prevCache => {
                 const current = prevCache[conversationId] || [];
                 return {
                     ...prevCache,
                     [conversationId]: current.map(m => 
                         m.id === optimisticId 
                         ? { ...m, provider_message_id: result.messageId || null, status: 'SENT' } // Atualiza WAMID e status otimista
                         : m
                     )
                 };
             });
             if (selectedConversation?.id === conversationId) {
                 setSelectedConversationMessages(prev => prev.map(m => 
                     m.id === optimisticId 
                     ? { ...m, provider_message_id: result.messageId || null, status: 'SENT' } // Atualiza WAMID e status otimista
                     : m
                 ));
             }

        } catch (err: any) {
            const errorMsg = err.message || 'Erro desconhecido ao enviar template.';
            console.error("[ConversationContext] Erro ao enviar template:", errorMsg);
            toast.error(`Falha ao enviar: ${errorMsg}`);

            // Atualizar mensagem otimista para FALHOU
             const updateStateWithError = () => {
                const failedMessage = { ...optimisticMessage, status: 'FAILED' } as Message;
                if (selectedConversation?.id === conversationId) {
                    setSelectedConversationMessages(prev =>
                        prev.map(m => m.id === optimisticId ? failedMessage : m)
                    );
                }
                 setMessageCache(prevCache => {
                     const current = prevCache[conversationId] || [];
                     return {
                         ...prevCache,
                         [conversationId]: current.map(m => m.id === optimisticId ? failedMessage : m)
                     };
                 });
             };
             updateStateWithError();
        } finally {
            setIsSendingMessage(false);
        }
    }, [workspaceContext, selectedConversation, session]);

    const sendMediaMessage = useCallback(async (conversationId: string, file: File) => {
        const wsId = getActiveWorkspaceId(workspaceContext, undefined);
        if (!wsId || !conversationId || !file) {
            toast.error("Dados insuficientes para enviar mídia.");
            return;
        }
        
        // --- Otimista: Adicionar mensagem localmente --- 
        const optimisticId = `optimistic-${Date.now()}`;
        const messageType = getMessageTypeFromMime(file.type);
        // Conteúdo otimista simplificado para mídia:
        // Apenas o nome do remetente, a UI deve indicar que é mídia.
        const optimisticContent = `*${session?.user?.name || 'Agente'}*`; 
        
        // Opcional: Criar URL local para preview imediato (imagem/video)
        let localPreviewUrl: string | null = null;
        if (messageType === 'IMAGE' || messageType === 'VIDEO' || messageType === 'AUDIO') { // <<< Inclui AUDIO aqui se quisermos tentar preview local
            try {
                localPreviewUrl = URL.createObjectURL(file);
            } catch (e) {
                console.warn("Não foi possível criar URL de objeto para preview:", e);
            }
        }

        const optimisticMessage: Message = {
            id: optimisticId,
            conversation_id: conversationId,
            sender_type: 'AGENT',
            content: (messageType !== 'AUDIO' && messageType !== 'IMAGE' && messageType !== 'VIDEO' && messageType !== 'DOCUMENT') ? `[Enviando ${file.name}]` : null, // <<< Usar placeholder só se tipo for desconhecido, senão null
            timestamp: new Date().toISOString(),
            status: 'SENDING',
            message_type: messageType, 
            channel_message_id: null,
            metadata: { 
                senderName: session?.user?.name || 'Agente',
                originalFilename: file.name,
                mimeType: file.type,
                size: file.size,
                // Poderia adicionar o optimisticContent aqui se necessário em outro lugar
             }, 
            media_url: localPreviewUrl, // Usa URL local para preview, se disponível
            media_mime_type: file.type,
            media_filename: file.name,
            provider_message_id: null,
        };

        // Adiciona otimista ao estado
        if (selectedConversation?.id === conversationId) {
            setSelectedConversationMessages(prev => [...prev, optimisticMessage]);
        }
        setMessageCache(prevCache => ({
            ...prevCache,
            [conversationId]: [...(prevCache[conversationId] || []), optimisticMessage]
        }));
        // --- Fim da Lógica Otimista ---
        
        setIsSendingMessage(true); // Usar o mesmo estado de loading por simplicidade
        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversationId', conversationId);
        formData.append('workspaceId', wsId);

        try {
            console.log(`[ConversationContext] Uploading media file ${file.name} for conv ${conversationId}`);
            
            const response = await axios.post<{ success: boolean, data?: Message, error?: string }>(
                `/api/attachments`,
                formData, 
                { 
                    headers: { 'Content-Type': 'multipart/form-data' } 
                }
            );

            if (!response.data.success || !response.data.data) {
                throw new Error(response.data.error || 'Falha ao fazer upload da mídia');
            }

            const createdMessage = response.data.data;
            console.log(`[ConversationContext] Media upload successful. DB Message ID: ${createdMessage.id}`);
            toast.success("Arquivo enviado!");

            // A API já criou a mensagem e publicou no Redis/SSE.
            // O handleRealtimeNewMessage deve receber a `createdMessage` e substituir a otimista.
            // Revogar URL local se foi criada para liberar memória
            if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
            }

        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message || 'Erro desconhecido ao enviar mídia.';
            console.error("[ConversationContext] Erro ao enviar mídia:", errorMsg);
            toast.error(`Falha ao enviar ${messageType.toLowerCase()}: ${errorMsg}`);
            
            // Revogar URL local se foi criada
             if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
             }

            // Atualizar mensagem otimista para FALHOU
             const updateStateWithError = () => {
                 const failedMessage = { ...optimisticMessage, status: 'FAILED', media_url: null } as Message;
                 if (selectedConversation?.id === conversationId) {
                     setSelectedConversationMessages(prev =>
                         prev.map(m => m.id === optimisticId ? failedMessage : m)
                     );
                 }
                 setMessageCache(prevCache => {
                     const current = prevCache[conversationId] || [];
                     return {
                         ...prevCache,
                         [conversationId]: current.map(m => m.id === optimisticId ? failedMessage : m)
                     };
                 });
             };
             updateStateWithError();
        } finally {
            setIsSendingMessage(false);
        }
    }, [workspaceContext, selectedConversation, session]);

    const toggleAIStatus = useCallback(async (conversationId: string, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        console.log(`[ConversationContext] Toggling AI status for conv ${conversationId} from ${currentStatus} to ${newStatus}`);

        const wsId = getActiveWorkspaceId(workspaceContext);
        if (!wsId) {
            console.error("[ConversationContext] Workspace ID não encontrado para toggleAIStatus.");
            toast.error("Erro crítico: Workspace não identificado ao tentar alterar status da IA.");
            // Reverter otimismo se wsId não for encontrado, pois a action não será chamada
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

        // Otimista (opcional, mas bom para UI responsiva)
        // Atualiza o estado local ANTES da chamada da action
        setConversations(prev =>
            prev.map(conv =>
                conv.id === conversationId ? { ...conv, is_ai_active: newStatus } : conv
            )
        );
        if (selectedConversation?.id === conversationId) {
            setSelectedConversation(prev => prev ? { ...prev, is_ai_active: newStatus } : null);
        }

        try {
            // A CHAMADA QUE PRECISA SER ATUALIZADA
            // Adicionar wsId à chamada da action
            const success = await setConversationAIStatus(conversationId, newStatus, wsId);

            if (success) {
                 console.log(`[ConversationContext] Server action setConversationAIStatus executada com sucesso para ${conversationId} (novo status: ${newStatus}). Evento Redis deve atualizar estado final.`);
                // Não precisamos reverter o estado otimista aqui se a action for bem-sucedida,
                // pois o evento Redis ('ai_status_updated') DEVE chegar e confirmar/corrigir o estado.
                toast.success(`IA ${newStatus ? 'ativada' : 'desativada'} para esta conversa.`);
            } else {
                // A action retornou false, indicando falha ANTES do Redis (ex: ID inválido)
                 console.error(`[ConversationContext] Server action setConversationAIStatus retornou falha para ${conversationId}. Revertendo estado otimista.`);
                toast.error(`Falha ao ${newStatus ? 'ativar' : 'desativar'} IA. Tente novamente.`);
                // Reverter estado otimista
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
            // Erro lançado pela Server Action (provavelmente erro no DB)
            console.error(`[ConversationContext] Erro ao chamar server action setConversationAIStatus para ${conversationId}:`, error);
            toast.error(`Erro ao ${newStatus ? 'ativar' : 'desativar'} IA: ${error.message || 'Erro desconhecido'}`);
            // Reverter estado otimista
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
            console.warn("[ConversationContext] selectConversationForClient: clientId ou workspaceId faltando.");
            toast.error("Não foi possível selecionar a conversa: dados incompletos.");
            return null;
        }
        console.log(`[ConversationContext] Tentando selecionar/buscar conversa para cliente ${clientId} no workspace ${workspaceId}`);
        setLoadingSelectedConversationMessages(true); // Indicar carregamento
        setSelectedConversationError(null);

        try {
            // Tenta buscar conversas existentes para o cliente neste workspace
            // Esta API precisa suportar a query por clientId e workspaceId
            const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
                '/api/conversations', 
                { params: { workspaceId, clientId, status: 'ALL' } } // status ALL para pegar qualquer uma, ou ATIVAS
            );

            let conversationToSelect: ClientConversation | null = null;

            if (response.data.success && response.data.data && response.data.data.length > 0) {
                // Pega a conversa com a data de `last_message_at` mais recente
                conversationToSelect = response.data.data.sort((a,b) => 
                    new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
                )[0];
                console.log(`[ConversationContext] Conversa encontrada via API para cliente ${clientId}: ${conversationToSelect.id}`);
            } else {
                // Se não encontrou via API (ou API não suporta filtro por clientId), tenta no cache
                console.warn(`[ConversationContext] Nenhuma conversa encontrada via API para cliente ${clientId}. Tentando buscar no cache de conversas.`);
                const cachedConversation = conversations.find(c => c.client_id === clientId && c.workspace_id === workspaceId);
                if (cachedConversation) {
                    conversationToSelect = cachedConversation;
                    console.log(`[ConversationContext] Conversa encontrada no cache para cliente ${clientId}: ${conversationToSelect.id}`);
                } else {
                    console.warn(`[ConversationContext] Nenhuma conversa encontrada para cliente ${clientId} (nem API, nem cache).`);
                    toast.error("Nenhuma conversa ativa encontrada para este cliente.");
                    setLoadingSelectedConversationMessages(false);
                    return null;
                }
            }

            if (conversationToSelect) {
                selectConversation(conversationToSelect); // Função existente no contexto para definir selectedConversation e carregar mensagens
                // setLoadingSelectedConversationMessages(false); // selectConversation já deve lidar com isso
                return conversationToSelect;
            }
            // Este ponto não deveria ser alcançado se uma das lógicas acima funcionou
            setLoadingSelectedConversationMessages(false);
            return null;

        } catch (error: any) {
            console.error(`[ConversationContext] Erro ao buscar/selecionar conversa para cliente ${clientId}:`, error);
            toast.error(`Erro ao carregar conversa: ${error.message || 'Erro desconhecido'}`);
            setLoadingSelectedConversationMessages(false);
            return null;
        }
    }, [selectConversation, conversations, setLoadingSelectedConversationMessages, setSelectedConversationError]);

    // --- Efeito para Gerenciar Conexão Pusher (agora usa config buscada) --- //
    useEffect(() => {
        // Só executa se a config foi carregada e temos um workspace
        if (loadingPusherConfig || !pusherConfig) {
          // console.log('[Pusher] Waiting for config or workspace...', { loadingPusherConfig, hasConfig: !!pusherConfig }); // DEBUG
          return;
        }

        const workspaceId = workspaceContext.workspace?.id;

        // Função de limpeza para desconectar e desinscrever
        const cleanupPusher = () => {
          if (channelRef.current) {
            // Explicitly unbind specific handlers before unbinding all
            // console.log(`[Pusher] Unbinding specific listeners from channel: ${channelRef.current.name}`); // DEBUG
            try {
              channelRef.current.unbind('new_message', handleRealtimeNewMessage);
              channelRef.current.unbind('message_status_update', handleRealtimeStatusUpdate);
              channelRef.current.unbind('ai_status_updated', handleRealtimeAIStatusUpdate);
            } catch (unbindError) {
              console.warn('[Pusher] Error during specific unbind:', unbindError);
            }
            channelRef.current.unbind_all(); // Unbind any remaining
          }
          if (pusherRef.current) {
            console.log('[Pusher] Disconnecting...');
            pusherRef.current.disconnect();
            pusherRef.current = null;
            channelRef.current = null;
            setIsPusherConnected(false);
          }
        };

        if (workspaceId) {
          // console.log(`[Pusher] Workspace ID ${workspaceId} and Pusher config available. Setting up Pusher.`); // DEBUG
          cleanupPusher(); // Garante limpeza antes de conectar

          const { pusherKey, pusherCluster } = pusherConfig;

          try {
            pusherRef.current = new Pusher(pusherKey, {
              cluster: pusherCluster,
              authEndpoint: '/api/pusher/auth',
              forceTLS: true
            });

            const pusherInstance = pusherRef.current;

            pusherInstance.connection.bind('connected', () => {
              console.log('[Pusher] Connection successful!');
              setIsPusherConnected(true);
            });

            pusherInstance.connection.bind('disconnected', () => {
              console.warn('[Pusher] Disconnected.');
              setIsPusherConnected(false);
            });

            pusherInstance.connection.bind('error', (err: any) => {
              console.error('[Pusher] Connection error:', err);
              setIsPusherConnected(false);
              if (err.error?.data?.code === 4004) {
                toast.error("Erro de conexão: App Pusher não existe ou ID incorreto.");
              } else if (err.error?.data?.code >= 4100 && err.error?.data?.code < 4200) {
                toast.error("Erro de conexão: Problema de autenticação.");
              } else if (err.error?.data?.code >= 4200 && err.error?.data?.code < 4300) {
                toast.error("Erro de conexão: Problema com o servidor.");
              } else {
                toast.error(`Erro de conexão Pusher: ${err.error?.data?.message || 'Desconhecido'}`);
              }
            });

            const channelName = `private-workspace-${workspaceId}`;
            // console.log(`[Pusher] Subscribing to channel: ${channelName}`); // DEBUG
            channelRef.current = pusherInstance.subscribe(channelName);
            const channelInstance = channelRef.current;

            channelInstance.bind('pusher:subscription_succeeded', () => {
              console.log(`[Pusher] Successfully subscribed to ${channelName}`);
            });

            channelInstance.bind('pusher:subscription_error', (errorData: any) => {
              console.error(`[Pusher] Failed to subscribe to ${channelName}. Error data:`, errorData);
              const status = errorData?.status || errorData?.statusCode || 'unknown';
              toast.error(`Falha ao conectar ao canal (Status: ${status}). Verifique permissões ou logs do servidor.`);
              setIsPusherConnected(false);
            });

            // console.log(`[Pusher] Attempting to bind event 'new_message' directly to channel ${channelName}`); // DEBUG
            channelInstance.bind('new_message', (jsonData: any) => {
                // console.log(`[Pusher] Raw data received for 'new_message':`, jsonData); // DEBUG
                try {
                    const parsedData = (typeof jsonData === 'string') ? JSON.parse(jsonData) : jsonData;
                    if (parsedData && parsedData.payload) {
                        handleRealtimeNewMessage(parsedData.payload);
                    } else {
                        console.warn(`[Pusher] Received event 'new_message' but payload is missing or invalid:`, parsedData);
                    }
                } catch (error) {
                    console.error(`[Pusher] Error parsing JSON for event 'new_message':`, error, 'Raw data:', jsonData);
                }
            });
            // console.log(`[Pusher] Event 'new_message' bound.`); // DEBUG

            // console.log(`[Pusher] Attempting to bind event 'message_status_update' directly to channel ${channelName}`); // DEBUG
            channelInstance.bind('message_status_update', (jsonData: any) => {
                // console.log(`[Pusher] Raw data received for 'message_status_update':`, jsonData); // DEBUG
                try {
                    const parsedData = (typeof jsonData === 'string') ? JSON.parse(jsonData) : jsonData;
                    if (parsedData && parsedData.payload) {
                        handleRealtimeStatusUpdate(parsedData.payload);
                    } else {
                        console.warn(`[Pusher] Received event 'message_status_update' but payload is missing or invalid:`, parsedData);
                    }
                } catch (error) {
                    console.error(`[Pusher] Error parsing JSON for event 'message_status_update':`, error, 'Raw data:', jsonData);
                }
            });
            // console.log(`[Pusher] Event 'message_status_update' bound.`); // DEBUG

            // Bind for AI status updates
            // console.log(`[Pusher] Attempting to bind event 'ai_status_updated' directly to channel ${channelName}`); // DEBUG
            channelInstance.bind('ai_status_updated', (jsonData: any) => {
                // console.log(`[Pusher] Raw data received for 'ai_status_updated':`, jsonData); // DEBUG
                try {
                    const parsedData = (typeof jsonData === 'string') ? JSON.parse(jsonData) : jsonData;
                    if (parsedData && parsedData.payload) {
                        handleRealtimeAIStatusUpdate(parsedData.payload);
                    } else {
                        console.warn(`[Pusher] Received event 'ai_status_updated' but payload is missing or invalid:`, parsedData);
                    }
                } catch (error) {
                    console.error(`[Pusher] Error parsing JSON for event 'ai_status_updated':`, error, 'Raw data:', jsonData);
                }
            });
            // console.log(`[Pusher] Event 'ai_status_updated' bound.`); // DEBUG

          } catch (error) {
            console.error('[Pusher] Failed to initialize Pusher:', error);
            toast.error('Erro ao inicializar a conexão em tempo real.');
            cleanupPusher();
          }

        } else {
          // console.log('[Pusher] No workspace ID available. Cleaning up existing connection if any.'); // DEBUG
          cleanupPusher();
        }

        return cleanupPusher;

    }, [workspaceContext.workspace?.id, loadingPusherConfig, pusherConfig, handleRealtimeNewMessage, handleRealtimeStatusUpdate, handleRealtimeAIStatusUpdate]); // Adiciona dependências de config

    // --- Valor do Contexto --- //
    const contextValue = useMemo(() => ({
        conversations,
        loadingConversations,
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
        hasMoreConversations,
        isLoadingMoreConversations,
        fetchConversations,
        loadMoreConversations,
        fetchConversationMessages,
        loadMoreConversationMessages,
        selectConversation,
        clearMessagesError,
        handleRealtimeNewMessage,
        handleRealtimeStatusUpdate,
        handleRealtimeAIStatusUpdate,
        selectConversationForClient,
        sendManualMessage,
        sendTemplateMessage,
        sendMediaMessage,
        toggleAIStatus,
    }), [
        conversations, loadingConversations, conversationsError, selectedConversation,
        selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError,
        messageCache, unreadConversationIds, isSendingMessage, isTogglingAIStatus,
        isPusherConnected, loadingPusherConfig, hasMoreConversations, isLoadingMoreConversations,
        isLoadingMoreMessages, hasMoreMessages,
        fetchConversations, loadMoreConversations, fetchConversationMessages, loadMoreConversationMessages, selectConversation, clearMessagesError,
        handleRealtimeNewMessage, handleRealtimeStatusUpdate, handleRealtimeAIStatusUpdate,
        selectConversationForClient,
        sendManualMessage,
        sendTemplateMessage, sendMediaMessage, toggleAIStatus,
    ]);

    return (
        <ConversationContext.Provider value={contextValue}>
            {children}
        </ConversationContext.Provider>
    );
};

// --- Hook Customizado --- //
export const useConversationContext = (): ConversationContextType => {
    const context = useContext(ConversationContext);
    if (context === undefined) {
        throw new Error('useConversationContext must be used within a ConversationProvider');
    }
    return context;
}; 