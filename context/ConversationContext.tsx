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
} from '@/app/types';
import { useWorkspace } from '@/context/workspace-context';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

// --- Helper Function --- //
const getActiveWorkspaceId = (workspaceCtx: any, providedId?: string): string | null => {
    if (providedId) return providedId;
    if (workspaceCtx?.workspace?.id) return workspaceCtx.workspace.id;
    console.warn("[ConversationContext] Could not determine active Workspace ID from context.");
    return null;
};

// --- Tipagem do Contexto de Conversa (Estado) --- //
interface ConversationContextType {
    // Estados
    conversations: ClientConversation[];
    loadingConversations: boolean;
    conversationsError: string | null;
    selectedConversation: ClientConversation | null;
    selectedConversationMessages: Message[];
    loadingSelectedConversationMessages: boolean;
    selectedConversationError: string | null;
    messageCache: Record<string, Message[]>;
    unreadConversationIds: Set<string>;
    setUnreadConversationIds: Dispatch<SetStateAction<Set<string>>>;
    isSendingMessage: boolean; // Manter para UI
    isTogglingAIStatus: boolean; // Manter para UI

    // Funções de Busca/Seleção
    fetchConversations: (filter?: string, workspaceId?: string) => Promise<void>;
    fetchConversationMessages: (conversationId: string) => Promise<Message[]>;
    selectConversation: (conversation: ClientConversation | null) => void;
    clearMessagesError: () => void;

    // Handlers para serem chamados pelo WebSocketProvider
    handleRealtimeNewMessage: (message: Message) => void;
    handleRealtimeStatusUpdate: (data: any) => void;
    // handleRealtimeContentUpdate: (data: any) => void; // Adicionar se necessário
    // handleRealtimeAiStatusUpdate: (data: any) => void; // Adicionar se necessário

    // Ações do Usuário (Placeholders - para serem implementadas com Server Actions)
    sendManualMessage: (conversationId: string, content: string, workspaceId?: string) => Promise<void>; 
    sendTemplateMessage: (conversationId: string, templateData: any) => Promise<void>; 
    sendMediaMessage: (conversationId: string, file: File) => Promise<void>; 
    toggleAIStatus: (conversationId: string, currentAiState: boolean) => Promise<void>;
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
    const [selectedConversationError, setSelectedConversationError] = useState<string | null>(null);
    const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});
    const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());
    const [isSendingMessage, setIsSendingMessage] = useState(false); 
    const [isTogglingAIStatus, setIsTogglingAIStatus] = useState(false);

    // --- Funções de Busca/Seleção --- //
    async function fetchConversationMessages(conversationId: string): Promise<Message[]> {
        if (messageCache[conversationId]) {
            setSelectedConversationMessages(messageCache[conversationId]);
            setLoadingSelectedConversationMessages(false);
            return messageCache[conversationId];
        }
        setLoadingSelectedConversationMessages(true);
        setSelectedConversationError(null);
        try {
            const response = await axios.get<{ success: boolean, data?: Message[], error?: string }>(`/api/conversations/${conversationId}/messages`);
            if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao carregar mensagens da API');
            const fetchedMessages = response.data.data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            setMessageCache(prev => ({ ...prev, [conversationId]: fetchedMessages }));
            setSelectedConversationMessages(fetchedMessages);
            return fetchedMessages;
        } catch (err: any) {
            const message = err.response?.data?.error || err.message || 'Erro ao buscar mensagens.';
            setSelectedConversationError(message);
            setSelectedConversationMessages([]);
            toast.error(`Erro ao buscar mensagens: ${message}`);
            return [];
        } finally {
            setLoadingSelectedConversationMessages(false);
        }
    }

    const selectConversation = useCallback((conversation: ClientConversation | null) => {
        const newConversationId = conversation?.id ?? null;
        const currentConversationId = selectedConversation?.id ?? null;
        if (newConversationId === currentConversationId) return;

        console.log(`[ConversationContext] Selecting conversation: ${newConversationId}`);
        setSelectedConversation(conversation);
        setSelectedConversationMessages([]);
        setSelectedConversationError(null);
        setLoadingSelectedConversationMessages(false);

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
    }, [selectedConversation, setUnreadConversationIds, messageCache]);

     const fetchConversations = useCallback(async (filter = 'ATIVAS', workspaceId?: string) => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            setConversationsError("Workspace ID não encontrado.");
            setConversations([]);
            selectConversation(null); 
            return;
        }
        console.log(`[ConversationContext] Fetching conversations for ws: ${wsId}, filter: ${filter}`);
        setLoadingConversations(true);
        setConversationsError(null);
        try {
            const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
                '/api/conversations', { params: { workspaceId: wsId, status: filter } }
            );
            if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao carregar conversas');
            const fetchedData = response.data.data;
            setConversations(fetchedData);
            console.log(`[ConversationContext] Fetched ${fetchedData.length} conversations with filter ${filter}.`);

            // Lógica de auto-seleção
            const currentSelectedId = selectedConversation?.id;
            const listHasSelected = fetchedData.some(c => c.id === currentSelectedId);

            if (currentSelectedId && !listHasSelected) {
                 // Se a selecionada não está mais na lista (ex: mudou de status), deseleciona ou seleciona a primeira
                console.log(`[ConversationContext] Selected conversation ${currentSelectedId} not in fetched list (${filter}). ${fetchedData.length > 0 ? 'Selecting first.' : 'Deselecting.'}`);
                 selectConversation(fetchedData.length > 0 ? fetchedData[0] : null);
            } else if (!currentSelectedId && fetchedData.length > 0) {
                // Se nada estava selecionado e a lista não está vazia, seleciona a primeira
                 console.log(`[ConversationContext] No conversation selected. Selecting first: ${fetchedData[0].id}`);
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
        }
    }, [workspaceContext, selectedConversation]);

    const clearMessagesError = useCallback(() => {
        setSelectedConversationError(null);
    }, []);

    // --- Handlers para WebSocket (Atualizam o estado) --- //
    const updateOrAddOptimisticallyInList = useCallback((message: Message) => {
         console.log(`[ConversationContext] updateOrAddOptimisticallyInList called for Msg ID ${message.id}`);
        setConversations(prev => {
            const conversationId = message.conversation_id;
            const existingIndex = prev.findIndex(c => c.id === conversationId);
            let newList = [...prev];
            if (existingIndex !== -1) {
                // console.log(`[ConversationContext] Updating existing conversation ${conversationId}`);
                const updatedConvo = {
                    ...newList[existingIndex],
                    last_message: message,
                    last_message_timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString(),
                    status: 'ACTIVE', // Garante que está ativa ao receber msg
                };
                newList.splice(existingIndex, 1);
                newList.unshift(updatedConvo);
            } else {
                 console.log(`[ConversationContext] Adding new optimistic conversation ${conversationId}`);
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
             console.warn("[ConversationContext] handleRealtimeNewMessage received invalid message:", message);
             return;
        }
        console.log(`[ConversationContext] handleRealtimeNewMessage: Processing Msg ID ${message.id} for Conv ${message.conversation_id}`);

        // Update Cache
        setMessageCache(prevCache => {
            const current = prevCache[message.conversation_id] || [];
            // Ainda verifica se o ID real já existe para evitar duplicatas de eventos SSE
            if (current.some(m => m.id === message.id)) {
                console.log(`[ConversationContext] Realtime message ${message.id} already in cache. Ignoring.`);
                return prevCache;
            }
            // Filtra mensagens otimistas E adiciona a nova mensagem real
            const newMessages = [
                ...current.filter(m => !m.id.startsWith('optimistic-')),
                message
            ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            console.log(`[ConversationContext] Updating cache for ${message.conversation_id}. Removed optimistic, added real ${message.id}.`);
            return { ...prevCache, [message.conversation_id]: newMessages };
        });

        // Update selected messages if it's the active conversation
        if (selectedConversation?.id === message.conversation_id) {
            setSelectedConversationMessages(prev => {
                // Verifica se o ID REAL já existe na lista selecionada
                if (prev.some(m => m.id === message.id)) {
                    console.log(`[ConversationContext] Realtime message ${message.id} already in selected messages. Ignoring.`);
                    return prev;
                }
                // Filtra mensagens otimistas E adiciona a nova mensagem real
                const updatedMessages = [
                    ...prev.filter(m => !m.id.startsWith('optimistic-')),
                    message
                ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                console.log(`[ConversationContext] Updating selected messages. Removed optimistic, added real ${message.id}.`);
                return updatedMessages;
            });
        }

        // Update conversation list optimistically (usando a mensagem REAL)
        updateOrAddOptimisticallyInList(message);

        // Update unread count if not the selected conversation
        if (selectedConversation?.id !== message.conversation_id) {
             console.log(`[ConversationContext] Marking ${message.conversation_id} as unread`);
            setUnreadConversationIds(prev => new Set(prev).add(message.conversation_id));
        }
    }, [selectedConversation, messageCache, updateOrAddOptimisticallyInList, setUnreadConversationIds]);

    const handleRealtimeStatusUpdate = useCallback((data: any) => {
         const { messageId, conversation_id, newStatus, providerMessageId, errorMessage } = data;
         if (!messageId || !conversation_id || !newStatus) {
             console.warn("[ConversationContext] handleRealtimeStatusUpdate received invalid data:", data);
             return;
         }
         console.log(`[ConversationContext] handleRealtimeStatusUpdate: Msg ID ${messageId} in Conv ${conversation_id} to ${newStatus}`);

         const updateFn = (msgs: Message[]) => msgs.map(msg => {
            if (msg.id === messageId) {
                const updated = { ...msg, status: newStatus };
                if (providerMessageId !== undefined) updated.provider_message_id = providerMessageId;
                if (newStatus === 'FAILED' && errorMessage) updated.metadata = { ...(updated.metadata || {}), error: errorMessage };
                return updated;
            }
            return msg;
         });

         // Update Cache
         setMessageCache(prev => {
            const current = prev[conversation_id];
            if (!current || !current.some(m => m.id === messageId)) return prev; // Don't update if not found
            return { ...prev, [conversation_id]: updateFn(current) };
         });

         // Update selected messages
         if (selectedConversation?.id === conversation_id) {
            setSelectedConversationMessages(updateFn);
         }

         // Update conversation list (last_message status)
         setConversations(prev => prev.map(conv => {
            if (conv.id === conversation_id && conv.last_message?.id === messageId) {
                // Important: Create new objects for React state update detection
                const newLastMessage = conv.last_message ? { ...conv.last_message, status: newStatus } : null;
                return { ...conv, last_message: newLastMessage };
            }
            return conv;
         }));
    }, [selectedConversation?.id]);

    // --- Ações do Usuário (Implementação Real) --- //
    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string) => {
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
            status: 'SENDING',
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
            console.log(`[ConversationContext] Sending manual message to conv ${conversationId}. Content: ${content}`);
            const response = await axios.post<{ success: boolean, message?: Message, error?: string }>(
                `/api/conversations/${conversationId}/messages`,
                { content } // Corpo da requisição
            );

            if (!response.data.success || !response.data.message) {
                throw new Error(response.data.error || 'Falha ao enviar mensagem pela API');
            }

            const sentMessage = response.data.message;
            console.log(`[ConversationContext] Manual message sent successfully. Server Msg ID: ${sentMessage.id}`);

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

    const sendTemplateMessage = useCallback(async (conversationId: string, templateData: any) => {
        const wsId = getActiveWorkspaceId(workspaceContext, undefined); // Assume context wsId
        if (!wsId) {
            toast.error("Não foi possível determinar o workspace ativo.");
            return;
        }
        console.log(`[ConversationContext] Placeholder: sendTemplateMessage called for conv ${conversationId} in ws ${wsId}. Data:`, templateData);
        setIsSendingMessage(true); // Reusa o estado de envio
        // TODO: Implementar chamada à API ou Server Action aqui
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simula delay da rede
        setIsSendingMessage(false);
        toast("Funcionalidade 'Enviar Template' ainda não implementada.");
    }, [workspaceContext]);

    const sendMediaMessage = useCallback(async (conversationId: string, file: File) => {
        const wsId = getActiveWorkspaceId(workspaceContext, undefined); // Assume context wsId
        if (!wsId) {
            toast.error("Não foi possível determinar o workspace ativo.");
            return;
        }
        console.log(`[ConversationContext] Placeholder: sendMediaMessage called for conv ${conversationId} in ws ${wsId}. File: ${file.name}, Type: ${file.type}, Size: ${file.size}`);
        setIsSendingMessage(true); // Reusa o estado de envio
        // TODO: Implementar chamada à API ou Server Action aqui (provavelmente /api/messages/media)
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simula delay da rede
        setIsSendingMessage(false);
        toast("Funcionalidade 'Enviar Mídia' ainda não implementada.");
    }, [workspaceContext]);

    const toggleAIStatus = useCallback(async (conversationId: string, currentAiState: boolean) => {
        const wsId = getActiveWorkspaceId(workspaceContext, undefined); // Assume context wsId
        if (!wsId) {
            toast.error("Não foi possível determinar o workspace ativo.");
            return;
        }
        const desiredState = !currentAiState;
        console.log(`[ConversationContext] Placeholder: toggleAIStatus called for conv ${conversationId} in ws ${wsId}. Setting AI to: ${desiredState}`);
        setIsTogglingAIStatus(true);
        // TODO: Implementar chamada à API ou Server Action aqui (provavelmente /api/conversations/:id/toggle-ai)
        await new Promise(resolve => setTimeout(resolve, 500)); // Simula delay da rede
        setIsTogglingAIStatus(false);
        // Lógica otimista pode ser adicionada aqui se necessário, atualizando `conversations` e `selectedConversation`
        toast(`Funcionalidade 'Alternar Status da IA' para ${desiredState ? 'Ativo' : 'Inativo'} ainda não implementada completamente.`);
    }, [workspaceContext]);

    // --- Valor do Contexto --- //
    const contextValue = useMemo(() => ({
        conversations,
        loadingConversations,
        conversationsError,
        selectedConversation,
        selectedConversationMessages,
        loadingSelectedConversationMessages,
        selectedConversationError,
        messageCache,
        unreadConversationIds,
        setUnreadConversationIds,
        isSendingMessage,
        isTogglingAIStatus,
        fetchConversations,
        fetchConversationMessages,
        selectConversation,
        clearMessagesError,
        handleRealtimeNewMessage,
        handleRealtimeStatusUpdate,
        sendManualMessage,
        sendTemplateMessage,
        sendMediaMessage,
        toggleAIStatus,
    }), [
        conversations, loadingConversations, conversationsError, selectedConversation,
        selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError,
        messageCache, unreadConversationIds, isSendingMessage, isTogglingAIStatus,
        fetchConversations, fetchConversationMessages, selectConversation, clearMessagesError,
        handleRealtimeNewMessage, handleRealtimeStatusUpdate, sendManualMessage,
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