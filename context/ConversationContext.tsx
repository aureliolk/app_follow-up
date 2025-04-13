// apps/next-app/context/ConversationContext.tsx
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
import axios, { AxiosError } from 'axios';
import { useWorkspace } from '@/context/workspace-context';
import type {
    Message,
    ClientConversation,
} from '@/app/types';
import { toast } from 'react-hot-toast';

// --- Helper Function ---
const getActiveWorkspaceId = (workspaceCtx: any, providedId?: string): string | null => {
    if (providedId) return providedId;
    if (workspaceCtx?.workspace?.id) return workspaceCtx.workspace.id;
    if (typeof window !== 'undefined') {
        const storedId = sessionStorage.getItem('activeWorkspaceId');
        if (storedId) return storedId;
    }
    console.warn("[ConversationContext] Could not determine active Workspace ID.");
    return null;
};

// --- Context Type Definition (Renomeado) ---
interface ConversationContextType {
    // Conversation List State & Actions
    conversations: ClientConversation[];
    loadingConversations: boolean;
    conversationsError: string | null;
    fetchConversations: (filter: string, workspaceId?: string) => Promise<void>;
    updateOrAddConversationInList: (eventData: any) => void;

    // Selected Conversation State & Actions
    selectedConversation: ClientConversation | null;
    loadingSelectedConversation: boolean;
    selectedConversationMessages: Message[];
    loadingSelectedConversationMessages: boolean;
    selectedConversationError: string | null;
    selectConversation: (conversation: ClientConversation | null) => void;
    fetchConversationMessages: (conversationId: string) => Promise<Message[]>;
    clearMessagesError: () => void;
    addMessageOptimistically: (message: Message) => void;
    updateMessageStatus: (tempId: string, finalMessage: Message | null, error?: string) => void;

    // Action States & Handlers
    isSendingMessage: boolean;
    sendManualMessage: (conversationId: string, content: string, workspaceId?: string) => Promise<Message>;

    // Cache Management
    clearMessageCache: (conversationId: string) => void;

    // SSE related
    addRealtimeMessage: (message: Message) => void;
    updateRealtimeMessageContent: (messageData: Partial<Message> & { id: string; conversation_id: string; }) => void;
    updateRealtimeMessageStatus: (data: { messageId: string; conversation_id: string; newStatus: string; providerMessageId?: string | null; errorMessage?: string | null; }) => void;

    // Unread Notifications
    unreadConversationIds: Set<string>;
    setUnreadConversationIds: Dispatch<SetStateAction<Set<string>>>;
}

// --- Context Creation (Renomeado) ---
const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

// --- Provider Component (Renomeado e Simplificado) ---
export const ConversationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const workspaceContext = useWorkspace();

    // --- State (Simplified) ---
    const [conversations, setConversations] = useState<ClientConversation[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [conversationsError, setConversationsError] = useState<string | null>(null);
    const [selectedConversation, setSelectedConversation] = useState<ClientConversation | null>(null);
    const [loadingSelectedConversation, setLoadingSelectedConversation] = useState(false);
    const [selectedConversationMessages, setSelectedConversationMessages] = useState<Message[]>([]);
    const [loadingSelectedConversationMessages, setLoadingSelectedConversationMessages] = useState(false);
    const [selectedConversationError, setSelectedConversationError] = useState<string | null>(null);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});
    const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());

    // --- Error/Cache Clear Functions ---
    const clearMessagesError = useCallback(() => setSelectedConversationError(null), []);
    const clearConversationsError = useCallback(() => setConversationsError(null), []);
    const clearMessageCache = useCallback((conversationId: string) => {
        setMessageCache(prev => {
            const newCache = { ...prev };
            delete newCache[conversationId];
            return newCache;
        });
    }, []);

    // --- API Call Utility ---
    const handleApiCall = useCallback(async <T,>(
        apiCall: () => Promise<T>,
        setLoading: React.Dispatch<React.SetStateAction<boolean>>,
        setErrorState: React.Dispatch<React.SetStateAction<string | null>> | null,
        loadingMessage: string | null = 'Processando...',
        successMessage?: string,
    ): Promise<T> => {
        const toastId = loadingMessage ? toast.loading(loadingMessage) : undefined;
        setLoading(true);
        if (setErrorState) setErrorState(null);
        try {
            const result = await apiCall();
            if (toastId) toast.dismiss(toastId);
            if (successMessage) toast.success(successMessage);
            return result;
        } catch (error) {
            if (toastId) toast.dismiss(toastId);
            const message = error instanceof AxiosError
                ? error.response?.data?.error || error.response?.data?.message || error.message
                : (error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.');
            console.error(`API Call Error (${loadingMessage || 'Task'}):`, error);
            if (setErrorState) setErrorState(message);
            toast.error(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    // --- Fetch Messages ---
    const fetchConversationMessages = useCallback(async (conversationId: string): Promise<Message[]> => {
        if (messageCache[conversationId]) {
            console.log(`[ConversationContext] Cache hit for messages in Conv ${conversationId}`);
            setSelectedConversationMessages(messageCache[conversationId]);
            setLoadingSelectedConversationMessages(false);
            return messageCache[conversationId];
        }
        console.log(`[ConversationContext] Cache miss. Fetching messages for Conv ${conversationId}`);
        setLoadingSelectedConversationMessages(true);
        setSelectedConversationError(null);
        try {
            const response = await axios.get<{ success: boolean, data?: Message[], error?: string }>(
                `/api/conversations/${conversationId}/messages`
            );
            if (!response.data.success || !response.data.data) {
                throw new Error(response.data.error || 'Falha ao carregar mensagens');
            }
            const fetchedMessages = response.data.data;
            setMessageCache(prev => ({ ...prev, [conversationId]: fetchedMessages }));
            setSelectedConversationMessages(fetchedMessages);
            console.log(`[ConversationContext] Fetched ${fetchedMessages.length} messages for Conv ${conversationId}`);
            return fetchedMessages;
        } catch (err: any) {
            console.error(`[ConversationContext] Erro ao buscar mensagens para Conv ${conversationId}:`, err);
            const message = err.response?.data?.error || err.message || 'Erro ao buscar mensagens.';
            setSelectedConversationError(message);
            setSelectedConversationMessages([]);
            return [];
        } finally {
            setLoadingSelectedConversationMessages(false);
        }
    }, [messageCache]);

    // --- Select Conversation ---
    const selectConversation = useCallback((conversation: ClientConversation | null) => {
        console.log(`[ConversationContext] Selecting conversation: ${conversation?.id ?? 'null'}`);
        setSelectedConversation(conversation);
        setSelectedConversationMessages([]);
        setSelectedConversationError(null);
        if (conversation) {
            fetchConversationMessages(conversation.id);
            setUnreadConversationIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(conversation.id);
                return newSet;
            });
        } else {
            // setMessageCache({});
        }
    }, [fetchConversationMessages]);

    // --- Fetch Conversation List ---
    const fetchConversations = useCallback(async (filter = 'active', workspaceId?: string) => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            setConversationsError("Workspace ID não encontrado.");
            setConversations([]);
            selectConversation(null);
            return;
        }
        setLoadingConversations(true);
        setConversationsError(null);
        try {
            console.log(`[ConversationContext] Fetching conversations for ws: ${wsId}, filter: ${filter}`);
            const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
                '/api/conversations',
                { params: { workspaceId: wsId, status: filter } }
            );
            if (!response.data.success || !response.data.data) {
                throw new Error(response.data.error || 'Falha ao carregar conversas');
            }
            const fetchedData = response.data.data;
            setConversations(fetchedData);
            console.log(`[ConversationContext] Fetched ${fetchedData.length} conversations with filter ${filter}.`);

            const currentSelectedId = selectedConversation?.id;
            const listHasSelected = fetchedData.some(c => c.id === currentSelectedId);

            if (currentSelectedId && !listHasSelected && fetchedData.length === 0) {
                console.log(`[ConversationContext] fetchConversations: Conv ${currentSelectedId} not in new empty list. Deselecting.`);
                selectConversation(null);
            } else if ((!currentSelectedId || !listHasSelected) && fetchedData.length > 0) {
                console.log(`[ConversationContext] fetchConversations: Selecting first conversation: ${fetchedData[0].id}`);
                selectConversation(fetchedData[0]);
            } else if (!currentSelectedId && fetchedData.length === 0) {
                 selectConversation(null);
            }
        } catch (err: any) {
            console.error("[ConversationContext] Erro ao buscar conversas:", err);
            const message = err.response?.data?.error || err.message || 'Erro ao buscar conversas.';
            setConversationsError(message);
            setConversations([]);
            selectConversation(null);
        } finally {
            setLoadingConversations(false);
        }
    }, [workspaceContext, selectedConversation, selectConversation]);

    // --- Update/Add Conversation in List (for SSE) ---
    const updateOrAddConversationInList = useCallback((eventData: any) => {
        console.log("[ConversationContext] updateOrAddConversationInList called with:", eventData);
        setConversations(prev => {
            const existingIndex = prev.findIndex(c => c.id === eventData.id);
            let newList = [...prev];
            if (existingIndex !== -1) {
                newList[existingIndex] = { ...newList[existingIndex], ...eventData };
                console.log(`Updated conversation ${eventData.id} in list.`);
            } else {
                newList.unshift(eventData);
                console.log(`Added new conversation ${eventData.id} to list.`);
            }
            return newList;
        });
        if (selectedConversation?.id !== eventData.id && eventData.last_message_sender !== 'AGENT' && eventData.last_message_sender !== 'AUTOMATION') {
            setUnreadConversationIds(prev => new Set(prev).add(eventData.id));
            console.log(`Marked conversation ${eventData.id} as unread.`);
        }
    }, [selectedConversation?.id]);

    // --- Message Actions ---
    const addMessageOptimistically = useCallback((message: Message) => {
        console.log("[ConversationContext] Adding optimistic message:", message);
        setSelectedConversationMessages(prev => [...prev, message]);
        setMessageCache(prevCache => ({
            ...prevCache,
            [message.conversation_id]: [...(prevCache[message.conversation_id] || []), message]
        }));
    }, []);

    const updateMessageStatus = useCallback((tempId: string, finalMessage: Message | null, error?: string) => {
        console.log(`[ConversationContext] Updating message status: tempId=${tempId}, finalMessage=`, finalMessage, `error=${error}`);
        const updateFn = (msgs: Message[]) => msgs.map(msg => {
            if (msg.id === tempId) {
                if (finalMessage) {
                    return { ...finalMessage };
                } else {
                    return { ...msg, status: 'FAILED', metadata: { ...(msg.metadata || {}), errorMessage: error || 'Falha no envio' } };
                }
            }
            return msg;
        });
        setSelectedConversationMessages(updateFn);
        if (selectedConversation?.id) {
            setMessageCache(prevCache => ({
                ...prevCache,
                [selectedConversation.id]: updateFn(prevCache[selectedConversation.id] || [])
            }));
        }
    }, [selectedConversation?.id]);

    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string): Promise<Message> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para enviar mensagem.');
        const tempMessageId = `temp_${Date.now()}`;
        const optimisticMessage: Message = {
            id: tempMessageId,
            conversation_id: conversationId,
            sender_type: 'AGENT',
            message_type: 'TEXT',
            content: content,
            status: 'PENDING',
            timestamp: new Date().toISOString(),
            client_id: selectedConversation?.client_id || '',
            workspace_id: wsId,
            llm_summary: null,
            media_url: null,
            media_mime_type: null,
            media_filename: null,
            provider_message_id: null,
            metadata: null,
        };
        addMessageOptimistically(optimisticMessage);
        return handleApiCall(
            async () => {
                console.log(`[ConversationContext] Sending message to Conv ${conversationId}`);
                const response = await axios.post<{ success: boolean, data: Message, error?: string }>(
                    `/api/conversations/${conversationId}/messages`,
                    { content, workspaceId: wsId, senderType: 'AGENT' }
                );
                if (!response.data.success || !response.data.data) {
                    throw new Error(response.data.error || 'Falha ao enviar mensagem');
                }
                updateMessageStatus(tempMessageId, response.data.data);
                return response.data.data;
            },
            setIsSendingMessage,
            setSelectedConversationError,
            null,
            undefined
        ).catch(err => {
            updateMessageStatus(tempMessageId, null, err.message);
            throw err;
        });
    }, [workspaceContext, handleApiCall, addMessageOptimistically, updateMessageStatus, selectedConversation?.client_id]);

    // --- Realtime Message Handling (SSE) ---
    const addRealtimeMessage = useCallback((message: Message) => {
        if (!message || !message.conversation_id) {
             console.warn('[ConversationContext] Ignorando mensagem SSE inválida ou sem ID de conversa:', message);
             return;
         }
        if (selectedConversation?.id === message.conversation_id) {
            setSelectedConversationMessages(prev => {
                 if (prev.some(m => m.id === message.id)) {
                     return prev;
                 }
                return [...prev, message];
            });
        }
        setMessageCache(prevCache => {
            const currentMessages = prevCache[message.conversation_id] || [];
             if (currentMessages.some(m => m.id === message.id)) {
                 return prevCache;
             }
            return {
                ...prevCache,
                [message.conversation_id]: [...currentMessages, message]
            };
        });
        if (selectedConversation?.id !== message.conversation_id && message.sender_type !== 'AGENT' && message.sender_type !== 'AUTOMATION') {
            setUnreadConversationIds(prev => new Set(prev).add(message.conversation_id));
        }
    }, [selectedConversation?.id]);

    const updateRealtimeMessageContent = useCallback((messageData: Partial<Message> & { id: string; conversation_id: string }) => {
        if (!messageData || !messageData.id || !messageData.conversation_id) {
            console.warn('[ConversationContext] Ignorando atualização SSE inválida (sem ID ou conversation_id):', messageData);
            return;
        }
        const { id, conversation_id, ...updates } = messageData;

        const updateFn = (msgs: Message[]) => msgs.map(msg =>
             msg.id === id ? { ...msg, ...updates, updated_at: new Date().toISOString() } : msg
         );

        if (selectedConversation?.id === conversation_id) {
             setSelectedConversationMessages(updateFn);
        }
        setMessageCache(prevCache => {
            const currentMessages = prevCache[conversation_id] || [];
            if (currentMessages.some(m => m.id === id)) {
                return { ...prevCache, [conversation_id]: updateFn(currentMessages) };
            }
            return prevCache;
        });
    }, [selectedConversation?.id]);

    const updateRealtimeMessageStatus = useCallback((data: { messageId: string; conversation_id: string; newStatus: string; providerMessageId?: string | null; errorMessage?: string | null; }) => {
        if (!data || !data.messageId || !data.conversation_id || !data.newStatus) {
            console.warn('[ConversationContext] Ignorando atualização de status SSE inválida:', data);
            return;
        }
        const { messageId, conversation_id, newStatus, providerMessageId, errorMessage } = data;

        const updateFn = (msgs: Message[]) => msgs.map(msg => {
            if (msg.id === messageId) {
                return {
                     ...msg,
                     status: newStatus,
                     ...(providerMessageId && { provider_message_id: providerMessageId }),
                     ...(errorMessage && { metadata: { ...(msg.metadata || {}), errorMessage: errorMessage } }),
                     updated_at: new Date().toISOString()
                };
            }
            return msg;
        });

        if (selectedConversation?.id === conversation_id) {
             setSelectedConversationMessages(updateFn);
         }
        setMessageCache(prevCache => {
            const currentMessages = prevCache[conversation_id] || [];
            if (currentMessages.some(m => m.id === messageId)) {
                return { ...prevCache, [conversation_id]: updateFn(currentMessages) };
            }
            return prevCache;
        });

    }, [selectedConversation?.id]);

    // --- Context Value (Simplified) ---
    const value = useMemo(() => ({
        // Conversation list
        conversations,
        loadingConversations,
        conversationsError,
        fetchConversations,
        updateOrAddConversationInList,

        // Selected conversation
        selectedConversation,
        loadingSelectedConversation,
        selectedConversationMessages,
        loadingSelectedConversationMessages,
        selectedConversationError,
        selectConversation,
        fetchConversationMessages,
        clearMessagesError,
        addMessageOptimistically,
        updateMessageStatus,

        // Actions
        isSendingMessage,
        sendManualMessage,

        // Cache
        clearMessageCache,

        // SSE
        addRealtimeMessage,
        updateRealtimeMessageContent,
        updateRealtimeMessageStatus,

        // Unread
        unreadConversationIds,
        setUnreadConversationIds

    // Dependencies based on provided values
    }), [
        conversations, loadingConversations, conversationsError, fetchConversations, updateOrAddConversationInList,
        selectedConversation, loadingSelectedConversation, selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError, selectConversation, fetchConversationMessages, clearMessagesError, addMessageOptimistically, updateMessageStatus,
        isSendingMessage, sendManualMessage,
        clearMessageCache,
        addRealtimeMessage, updateRealtimeMessageContent, updateRealtimeMessageStatus,
        unreadConversationIds, setUnreadConversationIds,
        selectConversation, fetchConversationMessages
    ]);

    return (
        <ConversationContext.Provider value={value}>
            {children}
        </ConversationContext.Provider>
    );
};

// --- Custom Hook (Renamed) ---
export const useConversationContext = (): ConversationContextType => {
    const context = useContext(ConversationContext);
    if (context === undefined) {
        throw new Error('useConversationContext must be used within a ConversationProvider');
    }
    return context;
};