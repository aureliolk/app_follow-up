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
    // Função para enviar mídia (File object)
    sendMediaMessage: (conversationId: string, file: File) => Promise<void>; // Retorna void pois a atualização vem via SSE
    // Função para enviar template (objeto com dados do template)
    sendTemplateMessage: (conversationId: string, templateData: any) => Promise<void>; // Retorna void, atualização via SSE

    // Conversation List State & Actions
    conversations: ClientConversation[];
    loadingConversations: boolean;
    conversationsError: string | null;
    fetchConversations: (filter: string, workspaceId?: string) => Promise<void>;
    updateOrAddConversationInList: (messageData: Message & { last_message_timestamp?: string }) => void;

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
    sendManualMessage: (conversationId: string, content: string, workspaceId?: string) => Promise<void>;

    // Cache Management
    clearMessageCache: (conversationId: string) => void;

    // SSE related
    addRealtimeMessage: (message: Message) => void;
    updateRealtimeMessageContent: (messageData: Partial<Message> & { id: string; conversation_id: string; }) => void;
    updateRealtimeMessageStatus: (data: {
        messageId: string;
        conversation_id: string;
        newStatus: string;
        providerMessageId?: string | null;
        errorMessage?: string | null;
        media_url?: string | null;
        content?: string | null;
        media_mime_type?: string | null;
        media_filename?: string | null;
    }) => void;

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
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
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
    // <<< NOVO ESTADO para guardar atualizações de status pendentes >>>
    const [pendingStatusUpdates, setPendingStatusUpdates] = useState<Record<string, string>>({});

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

    // --- API Call Utility (Mantido, pois sendManualMessage usa) ---
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

    // --- FUNÇÃO HELPER para tipo de mídia ---
    const getMessageTypeFromMime = (mimeType: string): string => {
        if (mimeType.startsWith('image/')) return 'IMAGE';
        if (mimeType.startsWith('video/')) return 'VIDEO';
        if (mimeType.startsWith('audio/')) return 'AUDIO';
        return 'DOCUMENT'; // Default
    };

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
    const updateOrAddConversationInList = useCallback((messageData: Message & { last_message_timestamp?: string }) => {
        console.log("[ConversationContext] updateOrAddConversationInList called with message:", messageData);
        if (!messageData || !messageData.conversation_id) {
            console.warn("[ConversationContext] updateOrAddConversationInList: Invalid message data received.", messageData);
            return;
        }

        setConversations(prev => {
            const conversationId = messageData.conversation_id;
            const existingIndex = prev.findIndex(c => c.id === conversationId);

            let newList = [...prev];

            if (existingIndex !== -1) {
                // Conversa EXISTE: Atualizar dados relevantes e mover para o topo
                const existingConvo = newList[existingIndex];
                const updatedConvo = {
                    ...existingConvo,
                    last_message: messageData, // Atualizar o objeto last_message inteiro
                    // Reaplicar a conversão para string ISO ou null
                    last_message_timestamp: messageData.timestamp ? new Date(messageData.timestamp).toISOString() : null,
                };
                // Remover da posição antiga e adicionar no início
                newList.splice(existingIndex, 1);
                newList.unshift(updatedConvo);
                console.log(`[ConversationContext] Updated and moved conversation ${conversationId} to top.`);
            } else {
                // Conversa NÃO EXISTE: Disparar fetchConversations para buscar a lista atualizada
                console.warn(`[ConversationContext] New conversation detected (ID: ${conversationId}) from incoming message. Triggering fetchConversations.`);
                // Não adicionar item parcial. A lista será atualizada pela busca.
                // Chamada assíncrona, não precisa de await aqui pois só dispara
                fetchConversations();
                // Retorna a lista anterior inalterada por enquanto, será substituída pelo fetch.
                return prev;
            }
            return newList;
        });

        // Lógica de não lidos - Sempre marcar como não lido se não estiver selecionada
        if (selectedConversation?.id !== messageData.conversation_id) {
            setUnreadConversationIds(prev => {
                const newSet = new Set(prev);
                newSet.add(messageData.conversation_id);
                return newSet;
            });
            console.log(`Marked conversation ${messageData.conversation_id} as unread.`);
        }
    }, [selectedConversation?.id, fetchConversations]); // Adicionar fetchConversations como dependência

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

    // Modify sendManualMessage to remove optimistic updates
    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            toast.error('Workspace ID é necessário para enviar mensagem.');
            throw new Error('Workspace ID é necessário para enviar mensagem.');
        }

        // Use handleApiCall to make the request and handle loading/error toasts
        await handleApiCall(
            async () => {
                console.log(`[ConversationContext] Sending message non-optimistically to Conv ${conversationId}`);
                const response = await axios.post<{ success: boolean; wamid?: string; error?: string }>(
                    `/api/conversations/${conversationId}/messages`,
                    { content, workspaceId: wsId }
                );

                if (!response.data.success) {
                    throw new Error(response.data.error || 'Falha ao enviar mensagem para a API');
                }

                console.log(`[ConversationContext] Non-optimistic send API call successful (Wamid: ${response.data.wamid || 'N/A'}). Waiting for webhook update.`);
                // No action needed here on success, webhook/SSE handles UI update.
            },
            setIsSendingMessage, // Manages loading state
            setSelectedConversationError, // Manages error state
            
        ).catch(err => {
            // handleApiCall already shows an error toast.
            // We just need to re-throw the error if calling code needs to handle it.
            console.error(`[ConversationContext] Error sending non-optimistic message for Conv ${conversationId}:`, err);
            // No optimistic message to update to FAILED status.
            // updateMessageStatus(tempMessageId, null, err.message || 'Erro ao enviar');
            throw err; // Re-throw so the caller knows about the failure
        });

        // Function now returns void as there's no immediate message object to return
    }, [workspaceContext, handleApiCall, setIsSendingMessage, setSelectedConversationError]); // Removed optimistic update dependencies

    // --- FUNÇÃO: Enviar Mídia >>>
    const sendMediaMessage = useCallback(async (conversationId: string, file: File) => {
        const wsId = getActiveWorkspaceId(workspaceContext);
        if (!wsId || !selectedConversation?.client_id) {
            toast.error('Workspace ou Cliente não selecionado para enviar mídia.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversationId', conversationId);
        formData.append('workspaceId', wsId);

        console.log(`[ConversationContext] Sending media for Conv ${conversationId}: ${file.name}`);
        // Mostrar um loading geral ou no botão enquanto a API é chamada?
        const toastId = toast.loading(`Enviando ${file.name}...`);

        try {
            const response = await axios.post<{ success: boolean, data?: Message, error?: string }>(
                '/api/attachments',
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            toast.dismiss(toastId);
            if (!response.data.success) {
                throw new Error(response.data.error || 'Falha ao iniciar upload do anexo');
            }
            console.log(`[ConversationContext] Media API call successful for ${file.name}. Waiting for SSE update...`);
            // Mensagem real virá via SSE (`new_message` e depois `message_status_updated`)
            toast.success(`${file.name} enviado para processamento.`);
        } catch (error: any) {
            toast.dismiss(toastId);
            console.error("[ConversationContext] Erro ao enviar anexo via API:", error);
            const message = error.response?.data?.error || error.message || 'Erro ao enviar anexo.';
            // Não há mensagem otimista para atualizar para FAILED.
            // Apenas mostrar erro.
            toast.error(`Falha ao enviar ${file.name}: ${message}`);
        } finally {
           // setIsUploadingMedia(false); // Remover se o estado for removido
        }
    }, [workspaceContext, selectedConversation /* remover addMessageOptimistically e updateMessageStatus se não forem mais usados em outro lugar*/]);

    // <<< FUNÇÃO: Enviar Template >>>
    const sendTemplateMessage = useCallback(async (conversationId: string, templateData: any) => {
        const wsId = getActiveWorkspaceId(workspaceContext);
        if (!wsId) {
            toast.error('Workspace ID não encontrado para enviar template.');
            return;
        }
        const templateName = templateData.name || 'template_desconhecido';

        console.log(`[ConversationContext] Sending template for Conv ${conversationId}:`, templateData);

        // Montar payload para a API
        const payload = {
            workspaceId: wsId,
            templateName: templateData.name,
            languageCode: templateData.language, // Assumindo que templateData tem 'language'
            variables: templateData.variables || {}, // Assumindo que templateData tem 'variables'
        };

        try {
            const response = await axios.post(
                `/api/conversations/${conversationId}/send-template`,
                payload
            );

            if (!response.data.success) {
                throw new Error(response.data.error || 'Falha ao enviar template');
            }

            console.log(`[ConversationContext] Template API call successful for Conv ${conversationId}. Message will arrive via SSE.`);
            // Não adicionamos mensagem otimista, esperamos o SSE com a mensagem real criada pelo backend.
            // Podemos mostrar um toast de sucesso aqui se desejado, mas o SSE é a confirmação final.
            // toast.success(`Template ${templateName} enviado!`);

        } catch (error: any) {
             console.error("[ConversationContext] Erro ao enviar template:", error);
            const message = error.response?.data?.error || error.message || 'Erro ao enviar template.';
            // Não há mensagem otimista para atualizar o status para FAILED.
            // Apenas mostramos o erro.
            toast.error(`Falha ao enviar template: ${message}`);
        }
    }, [workspaceContext]); // Remover dependências otimistas

    // --- Realtime Message Handling (SSE) ---
    const addRealtimeMessage = useCallback((message: Message) => {
        console.log(`[CONTEXT_LOG] addRealtimeMessage: Received Msg ID ${message.id} for Conv ${message.conversation_id} with Status ${message.status}`, message);

        // <<< VERIFICAR E APLICAR STATUS PENDENTE ANTES DE ADICIONAR >>>
        let messageToAdd = { ...message }; // Copiar para modificar
        const pendingStatus = pendingStatusUpdates[message.id];

        if (pendingStatus) {
            console.log(`[CONTEXT_LOG] addRealtimeMessage: Found pending status '${pendingStatus}' for Msg ID ${message.id}. Applying.`);
            messageToAdd.status = pendingStatus;
            // Remover a entrada do estado pendente APÓS aplicá-la
            setPendingStatusUpdates(prev => {
                const newState = { ...prev };
                delete newState[message.id];
                console.log(`[CONTEXT_LOG] addRealtimeMessage: Removed pending status for Msg ID ${message.id}. Remaining pending:`, Object.keys(newState));
                return newState;
            });
        } else {
             console.log(`[CONTEXT_LOG] addRealtimeMessage: No pending status found for Msg ID ${message.id}.`);
        }
        // <<< FIM da lógica de status pendente >>>
        console.log(`[CONTEXT_LOG] addRealtimeMessage: Final messageToAdd for Msg ID ${message.id}:`, messageToAdd);

        const updateFn = (msgs: Message[]) => {
            // Avoid duplicates
            if (msgs.some(m => m.id === messageToAdd.id)) {
                console.warn(`[ConversationContext] addRealtimeMessage: Duplicate message ID ${messageToAdd.id} ignored.`);
                return msgs;
            }
            // Usar messageToAdd (que pode ter o status atualizado)
            return [...msgs, messageToAdd].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        };

        // Update selected conversation messages if it matches
        if (selectedConversation?.id === messageToAdd.conversation_id) {
            setSelectedConversationMessages(updateFn);
        }
        // Update cache
        setMessageCache(prev => {
            const currentCached = prev[messageToAdd.conversation_id] || [];
            // Usar messageToAdd no cache também
            return { ...prev, [messageToAdd.conversation_id]: updateFn(currentCached) };
        });

        // Update conversation list preview (usar messageToAdd)
        updateOrAddConversationInList({
          ...messageToAdd,
          last_message_timestamp: typeof messageToAdd.timestamp === 'string'
            ? messageToAdd.timestamp
            : (messageToAdd.timestamp ? new Date(messageToAdd.timestamp).toISOString() : undefined)
        });

        // Handle unread count only if the conversation is not selected
        if (selectedConversation?.id !== messageToAdd.conversation_id) {
            setUnreadConversationIds(prev => new Set(prev).add(messageToAdd.conversation_id));
        }

    }, [selectedConversation?.id, updateOrAddConversationInList, pendingStatusUpdates]); // <<< Adicionar pendingStatusUpdates às dependências >>>

    const updateRealtimeMessageContent = useCallback((messageData: Partial<Message> & { id: string; conversation_id: string; }) => {
        console.log(`[ConversationContext] updateRealtimeMessageContent for Msg ${messageData.id}`, messageData);
        // Remove id and conversation_id as they are not part of the Message type fields to update directly
        const { id, conversation_id, ...updateFields } = messageData;

        const updateFn = (msgs: Message[]) => msgs.map(msg =>
            msg.id === id ? { ...msg, ...updateFields } : msg
        );

        if (selectedConversation?.id === conversation_id) {
            setSelectedConversationMessages(updateFn);
        }
        setMessageCache(prev => {
            const currentCached = prev[conversation_id] || [];
            return { ...prev, [conversation_id]: updateFn(currentCached) };
        });
    }, [selectedConversation?.id]);

    const updateRealtimeMessageStatus = useCallback((data: {
        messageId: string;
        conversation_id: string;
        newStatus: string;
        providerMessageId?: string | null;
        errorMessage?: string | null;
        media_url?: string | null;
        content?: string | null;
        media_mime_type?: string | null;
        media_filename?: string | null;
    }) => {
        console.log(`[CONTEXT_LOG] updateRealtimeMessageStatus: Called for Msg ID ${data.messageId} in Conv ${data.conversation_id} with New Status ${data.newStatus}`, data);
        const { messageId, conversation_id, newStatus, providerMessageId, media_url, content, media_mime_type, media_filename, errorMessage } = data; // Destructure new fields

        let messageFound = false;
        const updateFn = (msgs: Message[]) => msgs.map(msg => {
            if (msg.id === messageId) {
                console.log(`[CONTEXT_LOG] updateRealtimeMessageStatus: Found Msg ID ${messageId} in state. Updating status to ${newStatus}.`);
                messageFound = true; // Marcar que a mensagem foi encontrada na lista atual
                const updatedMessage = { ...msg, status: newStatus };
                if (providerMessageId !== undefined) updatedMessage.provider_message_id = providerMessageId;
                // Apply new fields if they exist in the payload
                if (media_url !== undefined) updatedMessage.media_url = media_url;
                if (content !== undefined) updatedMessage.content = content; // Update content (e.g., remove "[Sending...]")
                if (media_mime_type !== undefined) updatedMessage.media_mime_type = media_mime_type;
                if (media_filename !== undefined) updatedMessage.media_filename = media_filename;
                if (errorMessage !== undefined) updatedMessage.metadata = { ...(updatedMessage.metadata || {}), error: errorMessage };
                 if (newStatus === 'FAILED' && errorMessage) {
                     updatedMessage.content = `Falha ao enviar: ${errorMessage}`; // Optionally update content on failure
                 }

                return updatedMessage;
            }
            return msg;
        });

        // Tentar aplicar a atualização nos estados existentes
        if (selectedConversation?.id === conversation_id) {
            setSelectedConversationMessages(updateFn);
        }
        setMessageCache(prev => {
            const currentCached = prev[conversation_id] || [];
            // Ensure cache is updated correctly
            return { ...prev, [conversation_id]: updateFn(currentCached) };
        });

        // <<< LÓGICA PARA GUARDAR STATUS PENDENTE SE NÃO ENCONTRADO >>>
        if (!messageFound) {
            console.warn(`[CONTEXT_LOG] updateRealtimeMessageStatus: Msg ID ${messageId} NOT FOUND in current state. Adding status '${newStatus}' to pending updates.`);
            setPendingStatusUpdates(prev => {
                 const newState = { ...prev, [messageId]: newStatus };
                 console.log(`[CONTEXT_LOG] updateRealtimeMessageStatus: Updated pending status. New pending:`, Object.keys(newState));
                 return newState;
            });
        } else {
             // Se a mensagem foi encontrada e atualizada, remover qualquer status pendente para ela
             setPendingStatusUpdates(prev => {
                 if (prev[messageId]) {
                     console.log(`[CONTEXT_LOG] updateRealtimeMessageStatus: Removing pending status for Msg ID ${messageId} as it was just updated.`);
                     const newState = { ...prev };
                     delete newState[messageId];
                     console.log(`[CONTEXT_LOG] updateRealtimeMessageStatus: Remaining pending after removal:`, Object.keys(newState));
                     return newState;
                 }
                 return prev;
             });
        }
        // <<< FIM da lógica de status pendente >>>

        // Also update the last message preview in the conversation list if this message is the latest one
         setConversations(prevConvs => prevConvs.map(conv => {
             if (conv.id === conversation_id && conv.last_message?.id === messageId) {
                 // Return a new object to trigger re-render if necessary
                 return { ...conv, last_message_status: newStatus };
             }
             return conv;
         }));


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
        setUnreadConversationIds,

        // New functions
        sendMediaMessage: sendMediaMessage,
        sendTemplateMessage: sendTemplateMessage,

    // Dependencies based on provided values
    }), [
        conversations, loadingConversations, conversationsError, fetchConversations, updateOrAddConversationInList,
        selectedConversation, loadingSelectedConversation, selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError, selectConversation, fetchConversationMessages, clearMessagesError, addMessageOptimistically, updateMessageStatus,
        isSendingMessage, sendManualMessage,
        clearMessageCache,
        addRealtimeMessage, updateRealtimeMessageContent, updateRealtimeMessageStatus,
        unreadConversationIds, setUnreadConversationIds,
        // <<< Adicionar novas funções como dependências >>>
        sendMediaMessage, sendTemplateMessage,
        // <<< Adicionar pendingStatusUpdates como dependência se usado em useMemo? Sim. >>>
        pendingStatusUpdates // Adicionar pendingStatusUpdates como dependência do useMemo
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