// apps/next-app/context/follow-up-context.tsx
'use client';

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
    useMemo, // Import useMemo
    useEffect,
    Dispatch, // <<< Importar Dispatch e SetStateAction
    SetStateAction
} from 'react';
import axios, { AxiosError } from 'axios'; // Import AxiosError for better type checking
import { useWorkspace } from '@/context/workspace-context';
import type {
    Campaign,
    FollowUp,
    Message,
    ClientConversation,
    CampaignFormData,
} from '@/app/types'; // Import all necessary types
import { toast } from 'react-hot-toast';

// --- Helper Function ---
const getActiveWorkspaceId = (workspaceCtx: any, providedId?: string): string | null => {
    if (providedId) return providedId;
    if (workspaceCtx?.workspace?.id) return workspaceCtx.workspace.id;
    if (typeof window !== 'undefined') {
        const storedId = sessionStorage.getItem('activeWorkspaceId');
        if (storedId) return storedId;
    }
    console.warn("[FollowUpContext] Could not determine active Workspace ID.");
    return null;
};

// --- Context Type Definition ---
interface FollowUpContextType {
    // Campaign State & Actions
    campaigns: Campaign[];
    loadingCampaigns: boolean;
    campaignsError: string | null;
    startFollowUpSequence: any
    // selectedCampaign: Campaign | null; // Removed - managed via page/modal state if needed for editing
    // loadingSelectedCampaign: boolean; // Removed
    fetchCampaigns: (workspaceId?: string) => Promise<Campaign[]>;
    // fetchCampaign: (campaignId: string, workspaceId?: string) => Promise<Campaign | null>; // Removed - fetch list and find
    createCampaign: (data: CampaignFormData, workspaceId?: string) => Promise<Campaign>;
    updateCampaign: (campaignId: string, data: Partial<CampaignFormData>, workspaceId?: string) => Promise<Campaign>;
    deleteCampaign: (campaignId: string, workspaceId?: string) => Promise<void>;
    clearCampaignsError: () => void;

    // FollowUp List State & Actions (General list, might not be used directly by conversation UI)
    followUps: FollowUp[];
    loadingFollowUps: boolean;
    followUpsError: string | null;
    fetchFollowUps: (status?: string, workspaceId?: string) => Promise<FollowUp[]>;
    clearFollowUpsError: () => void;

    // Selected Conversation State & Actions
    selectedConversation: ClientConversation | null; // Holds the currently viewed conversation object
    loadingSelectedConversation: boolean; // Loading state for conversation details/messages
    selectedConversationMessages: Message[];
    loadingSelectedConversationMessages: boolean; // Specific loading for messages
    selectedConversationError: string | null; // Error related to selected conversation/messages
    selectConversation: (conversation: ClientConversation | null) => void; // Action to set the selected conversation
    fetchConversationMessages: (conversationId: string) => Promise<Message[]>;
    clearMessagesError: () => void;
    addMessageOptimistically: (message: Message) => void;
    updateMessageStatus: (tempId: string, finalMessage: Message | null, error?: string) => void;

    // Action States & Handlers (Boolean flags for loading specific actions)
    isStartingSequence: boolean;
    isPausingFollowUp: boolean; // Renamed for clarity
    isResumingFollowUp: boolean; // Renamed for clarity
    isConvertingFollowUp: boolean;
    isCancellingFollowUp: boolean;
    isSendingMessage: boolean;
    // startFollowUpSequence: (clientId: string, workspaceId?: string) => Promise<{ followUpId: string }>; // Keep if manual start is needed elsewhere
    pauseFollowUp: (followUpId: string, workspaceId?: string) => Promise<void>;
    resumeFollowUp: (followUpId: string, workspaceId?: string) => Promise<void>;
    convertFollowUp: (followUpId: string, workspaceId?: string) => Promise<void>;
    cancelFollowUp: (followUpId: string, workspaceId?: string) => Promise<void>;
    sendManualMessage: (conversationId: string, content: string, workspaceId?: string) => Promise<Message>;

    // Cache Management
    clearMessageCache: (conversationId: string) => void;

    // New function for SSE messages
    addRealtimeMessage: (message: Message) => void;

    // <<< NOVA DEFINIÇÃO PARA NOTIFICAÇÃO >>>
    unreadConversationIds: Set<string>; // Estado para IDs não lidos
    setUnreadConversationIds: Dispatch<SetStateAction<Set<string>>>; // <<< ADICIONAR O SETTER

    // <<< Adicionar nova função para atualização >>>
    updateRealtimeMessageContent: (messageId: string, newContent: string, newMetadata: any) => void;
}

// --- Context Creation ---
const FollowUpContext = createContext<FollowUpContextType | undefined>(undefined);

// --- Provider Component ---
export const FollowUpProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const workspaceContext = useWorkspace();

    // States
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loadingCampaigns, setLoadingCampaigns] = useState(false);
    const [campaignsError, setCampaignsError] = useState<string | null>(null);
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [loadingFollowUps, setLoadingFollowUps] = useState(false);
    const [followUpsError, setFollowUpsError] = useState<string | null>(null);
    const [selectedConversation, setSelectedConversation] = useState<ClientConversation | null>(null);
    const [loadingSelectedConversation, setLoadingSelectedConversation] = useState(false); // General loading for selected conv details
    const [selectedConversationMessages, setSelectedConversationMessages] = useState<Message[]>([]);
    const [loadingSelectedConversationMessages, setLoadingSelectedConversationMessages] = useState(false);
    const [selectedConversationError, setSelectedConversationError] = useState<string | null>(null);
    const [isStartingSequence, setIsStartingSequence] = useState(false); // Keep if needed
    const [isPausingFollowUp, setIsPausingFollowUp] = useState(false);
    const [isResumingFollowUp, setIsResumingFollowUp] = useState(false);
    const [isConvertingFollowUp, setIsConvertingFollowUp] = useState(false);
    const [isCancellingFollowUp, setIsCancellingFollowUp] = useState(false);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});
    // <<< NOVO ESTADO PARA NOTIFICAÇÃO >>>
    const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());

    // --- Error/Cache Clear Functions ---
    const clearCampaignsError = useCallback(() => setCampaignsError(null), []);
    const clearFollowUpsError = useCallback(() => setFollowUpsError(null), []);
    const clearMessagesError = useCallback(() => setSelectedConversationError(null), []);
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
        setErrorState: React.Dispatch<React.SetStateAction<string | null>> | null, // Allow null for errors handled elsewhere
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
            if (setErrorState) setErrorState(message); // Set error state if provided
            toast.error(message); // Always show toast error
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    // --- Campaign Actions ---
    const fetchCampaigns = useCallback(async (workspaceId?: string): Promise<Campaign[]> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            setCampaignsError("Workspace ID não encontrado para buscar campanhas.");
            setCampaigns([]); // Limpa a lista
            return []; // Retorna array vazio
        }

        return handleApiCall(
            async () => {
                console.log(`FollowUpContext: Fetching campaigns for ws ${wsId}`);
                const response = await axios.get<{ success: boolean, data?: Campaign[], error?: string }>(
                    `/api/follow-up/campaigns?workspaceId=${wsId}`
                );
                if (!response.data.success || !response.data.data) {
                    throw new Error(response.data.error || 'Falha ao buscar campanhas');
                }
                const fetchedCampaigns = response.data.data;
                setCampaigns(fetchedCampaigns); // Atualiza o estado
                console.log(`FollowUpContext: Fetched ${fetchedCampaigns.length} campaigns.`);
                return fetchedCampaigns; // Retorna os dados buscados
            },
            setLoadingCampaigns,
            setCampaignsError,
            null // Não mostrar toast de loading para busca de lista
        );
    }, [workspaceContext, handleApiCall]); // Dependências
    const createCampaign = useCallback(async (data: CampaignFormData, workspaceId?: string): Promise<Campaign> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para criar campanha.');

        return handleApiCall(
            async () => {
                 console.log(`FollowUpContext: Creating campaign in ws ${wsId}`);
                const response = await axios.post<{ success: boolean, data: Campaign, error?: string }>(
                    '/api/follow-up/campaigns',
                    { ...data, workspaceId: wsId } // Envia dados + wsId
                );
                 if (!response.data.success || !response.data.data) {
                    throw new Error(response.data.error || 'Falha ao criar campanha');
                 }
                 const newCampaign = response.data.data;
                 setCampaigns(prev => [newCampaign, ...prev]); // Adiciona à lista localmente
                 return newCampaign; // Retorna a campanha criada
            },
            setLoadingCampaigns, // Pode usar loading geral
            setCampaignsError,
            'Criando campanha...', // Mensagem de loading
            'Campanha criada com sucesso!' // Mensagem de sucesso
        );
    }, [workspaceContext, handleApiCall]); // Dependências
    const updateCampaign = useCallback(async (campaignId: string, data: Partial<CampaignFormData>, workspaceId?: string): Promise<Campaign> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para atualizar campanha.');

        return handleApiCall(
            async () => {
                console.log(`FollowUpContext: Updating campaign ${campaignId} in ws ${wsId}`);
                const response = await axios.put<{ success: boolean, data: Campaign, error?: string }>(
                    `/api/follow-up/campaigns/${campaignId}`,
                    { ...data, workspaceId: wsId } // Envia dados + wsId
                );
                 if (!response.data.success || !response.data.data) {
                     throw new Error(response.data.error || 'Falha ao atualizar campanha');
                 }
                 const updatedCampaign = response.data.data;
                 setCampaigns(prev => prev.map(c => c.id === campaignId ? updatedCampaign : c)); // Atualiza na lista
                 // Se você reintroduzir selectedCampaign, atualize aqui também
                 // if (selectedCampaign?.id === campaignId) { setSelectedCampaign(updatedCampaign); }
                 return updatedCampaign; // Retorna a campanha atualizada
            },
            setLoadingCampaigns, // Pode usar loading geral
            setCampaignsError,
            'Atualizando campanha...',
            'Campanha atualizada com sucesso!'
        );
    }, [workspaceContext, handleApiCall /*, selectedCampaign */ ]);
    
    const deleteCampaign = useCallback(async (campaignId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para excluir campanha.');

        // Note que esta função é Promise<void>, então não precisa retornar valor explicitamente
        await handleApiCall<void>( // Especifica <void> para o tipo genérico T
            async () => {
                 console.log(`FollowUpContext: Deleting campaign ${campaignId} from ws ${wsId}`);
                 const response = await axios.delete<{ success: boolean, message?: string, error?: string }>(
                     `/api/follow-up/campaigns/${campaignId}?workspaceId=${wsId}`
                 );
                 if (!response.data.success) {
                     throw new Error(response.data.error || 'Falha ao excluir campanha');
                 }
                 setCampaigns(prev => prev.filter(c => c.id !== campaignId)); // Remove da lista
                  // if (selectedCampaign?.id === campaignId) { setSelectedCampaign(null); }
            },
            setLoadingCampaigns,
            setCampaignsError,
            'Excluindo campanha...',
            'Campanha excluída com sucesso!'
        );
        // Nenhum return explícito é necessário aqui pois a função retorna Promise<void>
    }, [workspaceContext, handleApiCall /*, selectedCampaign */]);


    // --- FollowUp List Actions ---
    const fetchFollowUps = useCallback(async (status?: string, workspaceId?: string): Promise<FollowUp[]> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) return [];
        return handleApiCall(
            async () => {
                let url = `/api/follow-up?workspaceId=${wsId}`; // Adjust API endpoint if needed
                if (status) url += `&status=${status}`;
                const response = await axios.get<{ success: boolean, data?: FollowUp[], error?: string }>(url);
                if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao buscar follow-ups');
                setFollowUps(response.data.data);
                return response.data.data;
            },
            setLoadingFollowUps,
            setFollowUpsError,
            null // No loading toast for list fetch
        );
    }, [workspaceContext, handleApiCall]);

    // --- Selected Conversation / Message Actions ---

    // <<< MOVER fetchConversationMessages para ANTES de selectConversation >>>
     const fetchConversationMessages = useCallback(async (conversationId: string): Promise<Message[]> => {
        if (messageCache[conversationId]) {
            console.log(`[FollowUpContext] Cache hit for messages in Conv ${conversationId}`);
            setSelectedConversationMessages(messageCache[conversationId]);
            setLoadingSelectedConversationMessages(false);
            return messageCache[conversationId];
        }

        console.log(`[FollowUpContext] Cache miss. Fetching messages for Conv ${conversationId}`);
        setLoadingSelectedConversationMessages(true);
        setSelectedConversationError(null);
        try {
            const response = await axios.get<{ success: boolean, data?: Message[], error?: string }>(
                `/api/conversations/${conversationId}/messages`
            );
            if (!response.data.success || !response.data.data) {
                throw new Error(response.data.error || 'Falha ao buscar mensagens');
            }
            const messages = response.data.data;
            setSelectedConversationMessages(messages);
            setMessageCache(prev => ({ ...prev, [conversationId]: messages }));
            console.log(`[FollowUpContext] Fetched ${messages.length} messages for Conv ${conversationId}`);
            return messages;
        } catch (error: any) {
            console.error(`[FollowUpContext] Error fetching messages for Conv ${conversationId}:`, error);
            const message = error.response?.data?.error || error.message || 'Erro ao buscar mensagens';
            setSelectedConversationError(message);
            setSelectedConversationMessages([]); // Limpa em caso de erro
            return [];
        } finally {
            setLoadingSelectedConversationMessages(false);
        }
    }, [messageCache]); // Depende do cache

    const selectConversation = useCallback((conversation: ClientConversation | null) => {
        // <<< LOG AQUI >>>
        console.log(`[FollowUpContext DEBUG] selectConversation called with: ${conversation ? `ID: ${conversation.id}` : 'null'}`);

        setSelectedConversationError(null);

        if (conversation && unreadConversationIds.has(conversation.id)) {
            setUnreadConversationIds(prev => {
                const next = new Set(prev);
                next.delete(conversation.id);
                return next;
            });
        }

        setSelectedConversation(conversation);
        if (conversation) {
            setLoadingSelectedConversation(true);
            axios.get(`/api/conversations/${conversation.id}`, {
                params: {
                    workspaceId: conversation.workspace_id,
                    includeFollowUp: true
                }
            })
            .then(response => {
                if (response.data.success) {
                    setSelectedConversation(response.data.data);
                    fetchConversationMessages(conversation.id);
                } else {
                    throw new Error(response.data.error || 'Falha ao buscar detalhes da conversa');
                }
            })
            .catch(err => {
                console.error("Erro ao buscar detalhes da conversa:", err);
                setSelectedConversationError('Falha ao carregar detalhes da conversa.');
                setSelectedConversationMessages([]);
            })
            .finally(() => setLoadingSelectedConversation(false));

        } else {
            setSelectedConversationMessages([]); // Limpa mensagens ao deselecionar
            setLoadingSelectedConversationMessages(false);
        }
    }, [fetchConversationMessages, unreadConversationIds, setUnreadConversationIds]); // Manter dependências corretas

    const addMessageOptimistically = useCallback((message: Message) => {
        setSelectedConversationMessages(prev => [...prev, message]);
    }, []);

    const updateMessageStatus = useCallback((tempId: string, finalMessage: Message | null, error?: string) => {
        setSelectedConversationMessages(prev =>
            prev.map(msg => {
                if (msg.id === tempId) {
                    if (finalMessage) {
                        return { ...finalMessage }; // Substitui com a mensagem final da API
                    } else {
                        return { ...msg, metadata: { ...msg.metadata, status: 'failed', error: error || 'Falha desconhecida' } };
                    }
                }
                return msg;
            })
        );
         // Atualizar cache se a mensagem final chegou
         if (finalMessage?.conversation_id) {
            setMessageCache(prevCache => {
                const currentCache = prevCache[finalMessage.conversation_id];
                if (!currentCache) return prevCache;
                const updatedCache = currentCache.map(msg => msg.id === tempId ? finalMessage : msg);
                return { ...prevCache, [finalMessage.conversation_id]: updatedCache };
            });
        }
    }, []);

    const addRealtimeMessage = useCallback((message: Message) => {
        // Só adiciona se for a conversa selecionada E a mensagem não existir já
        // (Evita duplicatas se a API e o SSE chegarem quase juntos ou se o SSE enviar msg do próprio user)
        if (message.conversation_id === selectedConversation?.id) {
             setSelectedConversationMessages(prevMessages => {
                 if (!prevMessages.some(m => m.id === message.id)) {
                      console.log(`[FollowUpContext] Adicionando mensagem SSE: ${message.id}`);
                      return [...prevMessages, message];
                 } else {
                     console.warn(`[FollowUpContext] Mensagem SSE ${message.id} já existe no estado. Ignorando.`);
                    return prevMessages;
                 }
             });
             // Atualizar cache
             setMessageCache(prevCache => {
                const currentCache = prevCache[message.conversation_id] || [];
                 if (!currentCache.some(m => m.id === message.id)) {
                    return { ...prevCache, [message.conversation_id]: [...currentCache, message] };
                 }
                 return prevCache;
            });
        } else {
            console.log(`[FollowUpContext] Mensagem SSE recebida para conversa não selecionada (${message.conversation_id}). Marcando como não lida.`);
            // Marca como não lida se não for a conversa atual
             setUnreadConversationIds(prev => {
                 const next = new Set(prev);
                 next.add(message.conversation_id);
                 return next;
             });
        }
    }, [selectedConversation?.id]);

    // <<< IMPLEMENTAR NOVA FUNÇÃO >>>
    const updateRealtimeMessageContent = useCallback((messageId: string, newContent: string, newMetadata: any) => {
        const conversationId = selectedConversation?.id;
        if (!conversationId) return; // Não faz nada se nenhuma conversa estiver selecionada

        console.log(`[FollowUpContext] Atualizando conteúdo/metadata para mensagem ${messageId} na conversa ${conversationId}`);

        const updateFn = (prevMessages: Message[]) =>
             prevMessages.map(msg =>
                 msg.id === messageId
                    ? { ...msg, content: newContent, metadata: newMetadata }
                    : msg
             );

        // Atualiza o estado
        setSelectedConversationMessages(updateFn);

        // Atualiza o cache
        setMessageCache(prevCache => {
            const currentCache = prevCache[conversationId];
            if (!currentCache) return prevCache;
            return { ...prevCache, [conversationId]: updateFn(currentCache) };
        });

    }, [selectedConversation?.id]);

    // --- FollowUp Status/Action ---

    // Kept for potential manual triggering elsewhere, ensure API exists if used
    const startFollowUpSequence = useCallback(async (clientId: string, workspaceId?: string): Promise<{ followUpId: string }> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para iniciar.');
        return handleApiCall(
            async () => {
                // Ensure POST /api/follow-up exists and handles this logic if you keep this function
                const response = await axios.post<{ success: boolean, data?: { followUpId: string }, error?: string }>('/api/follow-up', { clientId, workspaceId: wsId });
                if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao iniciar.');
                // Consider refetching conversations or followups
                return response.data.data;
            },
            setIsStartingSequence,
            setFollowUpsError,
            'Iniciando sequência...',
            'Sequência iniciada!'
        );
    }, [workspaceContext, handleApiCall]);

    const pauseFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para pausar.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/pause`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao pausar.');
                // Update local state or trigger refetch of conversations
                setSelectedConversation(prev => prev ? { ...prev, activeFollowUp: prev.activeFollowUp ? { ...prev.activeFollowUp, status: 'PAUSED' } : null } : null);
            },
            setIsPausingFollowUp,
            setSelectedConversationError, // Erro será mostrado no contexto da conversa
            'Pausando sequência...',
            'Sequência pausada.'
        );
    }, [workspaceContext, handleApiCall, selectedConversation]);

    const resumeFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para retomar.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/resume`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao retomar.');
                 // Update local state or trigger refetch of conversations
                 setSelectedConversation(prev => prev ? { ...prev, activeFollowUp: prev.activeFollowUp ? { ...prev.activeFollowUp, status: 'ACTIVE' } : null } : null);
            },
            setIsResumingFollowUp,
            setSelectedConversationError,
            'Retomando sequência...',
            'Sequência retomada.'
        );
    }, [workspaceContext, handleApiCall, selectedConversation]);

    const convertFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para marcar como convertido.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/convert`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao converter.');
                 // Remover follow-up da conversa local e talvez fechar a conversa ou atualizar lista?
                if (selectedConversation?.activeFollowUp?.id === followUpId) {
                    setSelectedConversation(prev => prev ? { ...prev, activeFollowUp: null } : null);
                    // Opcional: Mudar status da conversa para CLOSED? Ou deixar a página principal recarregar?
                }
                 // Idealmente, a página deveria recarregar a lista de conversas do filtro atual
                 // ou o SSE deveria enviar um evento para remover/atualizar a conversa na lista.
            },
            setIsConvertingFollowUp,
            setSelectedConversationError,
            'Marcando como convertido...',
            'Sequência marcada como convertida.'
        );
    }, [workspaceContext, handleApiCall, selectedConversation]);

    const cancelFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para cancelar sequência.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/cancel`, { workspaceId: wsId });
                if (selectedConversation?.activeFollowUp?.id === followUpId) {
                    setSelectedConversation(prev => prev ? { ...prev, activeFollowUp: null } : null);
                }
                 // Idealmente, a página deveria recarregar a lista ou SSE deveria atualizar.
            },
            setIsCancellingFollowUp,
            setSelectedConversationError,
            'Cancelando sequência...',
            'Sequência cancelada.'
        );
    }, [workspaceContext, handleApiCall, selectedConversation]);

    // --- Manual Message Action ---
    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string): Promise<Message> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para enviar mensagem.');
        // Note: success message is handled optimistically by the caller using updateMessageStatus
        return handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, data: Message, error?: string }>(
                    `/api/conversations/${conversationId}/messages`,
                    { content, workspaceId: wsId, senderType: 'AI' } // Ou SYSTEM?
                );
                if (!response.data.success || !response.data.data) {
                    throw new Error(response.data.error || 'Falha ao enviar mensagem');
                }
                return response.data.data; // Retorna a mensagem finalizada da API
            },
            setIsSendingMessage,
            null, // Erro já tratado em updateMessageStatus
            null, // Loading já tratado pelo estado otimista
            // 'Mensagem enviada' // Não mostrar toast de sucesso aqui
        );
    }, [workspaceContext, handleApiCall]);

    // --- Context Value ---
    const contextValue: FollowUpContextType = useMemo(() => ({
        // Campaign
        campaigns, loadingCampaigns, campaignsError,
        fetchCampaigns, createCampaign, updateCampaign, deleteCampaign, clearCampaignsError,
        // FollowUp List
        followUps, loadingFollowUps, followUpsError,
        fetchFollowUps, clearFollowUpsError,
        // Selected Conversation
        selectedConversation, loadingSelectedConversation,
        selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError,
        selectConversation, fetchConversationMessages, clearMessagesError, addMessageOptimistically, updateMessageStatus,
        // Action States & Functions
        isStartingSequence, isPausingFollowUp, isResumingFollowUp, isConvertingFollowUp, isCancellingFollowUp, isSendingMessage,
        startFollowUpSequence, pauseFollowUp, resumeFollowUp, convertFollowUp, cancelFollowUp, sendManualMessage,
        // Cache
        clearMessageCache,
        // New function for SSE messages
        addRealtimeMessage,
        // <<< ADICIONAR NOVO ESTADO AO CONTEXTO >>>
        unreadConversationIds,
        setUnreadConversationIds, // <<< INCLUIR O SETTER NO VALOR DO CONTEXTO >>>
        // <<< Adicionar nova função para atualização >>>
        updateRealtimeMessageContent,
    }), [
        // List all state variables and memoized functions here
        campaigns, loadingCampaigns, campaignsError,
        followUps, loadingFollowUps, followUpsError,
        selectedConversation, loadingSelectedConversation, selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError,
        isStartingSequence, isPausingFollowUp, isResumingFollowUp, isConvertingFollowUp, isCancellingFollowUp, isSendingMessage,
        fetchCampaigns, createCampaign, updateCampaign, deleteCampaign, clearCampaignsError,
        fetchFollowUps, clearFollowUpsError,
        selectConversation, fetchConversationMessages, clearMessagesError, addMessageOptimistically, updateMessageStatus,
        startFollowUpSequence, pauseFollowUp, resumeFollowUp, convertFollowUp, cancelFollowUp, sendManualMessage,
        clearMessageCache,
        addRealtimeMessage,
        // <<< ADICIONAR NOVO ESTADO ÀS DEPENDÊNCIAS >>>
        unreadConversationIds,
        setUnreadConversationIds, // <<< ADICIONAR SETTER ÀS DEPENDÊNCIAS do useMemo >>>
        // <<< Adicionar nova função para atualização >>>
        updateRealtimeMessageContent,
    ]);

    return (
        <FollowUpContext.Provider value={contextValue}>
            {children}
        </FollowUpContext.Provider>
    );
};

// --- Hook ---
export const useFollowUp = (): FollowUpContextType => {
    const context = useContext(FollowUpContext);
    if (context === undefined) {
        throw new Error('useFollowUp must be used within a FollowUpProvider');
    }
    return context;
};