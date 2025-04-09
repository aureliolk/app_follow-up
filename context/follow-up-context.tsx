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

    // --- Selected Conversation Actions ---
    const selectConversation = useCallback((conversation: ClientConversation | null) => {
        setSelectedConversation(conversation);
        setSelectedConversationMessages([]);
        setSelectedConversationError(null);
        if (conversation?.id) {
            // <<< LIMPAR NOTIFICAÇÃO AO SELECIONAR >>>
            setUnreadConversationIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(conversation.id);
                return newSet;
            });
            fetchConversationMessages(conversation.id); // Fetch messages
        } else {
            setLoadingSelectedConversationMessages(false);
        }
    }, [/* fetchConversationMessages dependency added via useEffect below */]);

    const fetchConversationMessages = useCallback(async (conversationId: string): Promise<Message[]> => {
        if (messageCache[conversationId]) {
            setSelectedConversationMessages(messageCache[conversationId]);
            return messageCache[conversationId];
        }
        return handleApiCall(
            async () => {
                const response = await axios.get<{ success: boolean, data?: Message[], error?: string }>(
                    `/api/conversations/${conversationId}/messages`
                );
                if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao buscar mensagens');
                const fetchedMessages = response.data.data;
                setSelectedConversationMessages(fetchedMessages);
                setMessageCache(prev => ({ ...prev, [conversationId]: fetchedMessages }));
                return fetchedMessages;
            },
            setLoadingSelectedConversationMessages, // Use specific loading state
            setSelectedConversationError, // Use specific error state
            null
        );
    }, [messageCache, handleApiCall]);

    // Effect to link selectConversation and fetchConversationMessages
     useEffect(() => {
        // This empty effect ensures fetchConversationMessages is available when selectConversation is defined
     }, [fetchConversationMessages]);

    const addMessageOptimistically = useCallback((message: Message) => {
        setSelectedConversationMessages(prev => [...prev, message]);
    }, []);

    const updateMessageStatus = useCallback((tempId: string, finalMessage: Message | null, error?: string) => {
        setSelectedConversationMessages(prev => prev.map(msg => {
            if (msg.id === tempId) {
                return finalMessage ? finalMessage : { ...msg, metadata: { ...msg.metadata, status: 'failed', error: error || 'Erro' } };
            }
            return msg;
        }));
    }, []);

    const addRealtimeMessage = useCallback((message: Message) => {
        // <<< LOG INICIAL >>>
        console.log(`[FollowUpContext addRealtimeMessage] Recebida msg ${message.id} para conv ${message.conversation_id}. Conv selecionada: ${selectedConversation?.id}`);

        if (selectedConversation?.id && message.conversation_id === selectedConversation.id) {
             // <<< LOG - CONVERSA SELECIONADA >>>
            console.log(`[FollowUpContext addRealtimeMessage] Mensagem pertence à conversa selecionada.`);
            setSelectedConversationMessages(prevMessages => {
                const messageExists = prevMessages.some(msg => msg.id === message.id);
                if (!messageExists) {
                    console.log(`[FollowUpContext addRealtimeMessage] Adicionando msg ${message.id} à lista selecionada.`);
                    const updatedMessages = [...prevMessages, message];
                    updatedMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    return updatedMessages;
                } else {
                    console.log(`[FollowUpContext addRealtimeMessage] Msg ${message.id} já existe na lista selecionada.`);
                }
                return prevMessages;
            });
        } else if (message.conversation_id) {
             // <<< LOG - CONVERSA NÃO SELECIONADA >>>
             console.log(`[FollowUpContext addRealtimeMessage] Mensagem NÃO pertence à conversa selecionada. Verificando unread...`);
            setUnreadConversationIds(prev => {
                 // <<< LOG - DENTRO DO SETTER >>>
                console.log(`[FollowUpContext addRealtimeMessage] Atualizando unread. Prev Set:`, prev, `Tentando adicionar: ${message.conversation_id}`);
                if (!prev.has(message.conversation_id!)) {
                    console.log(`[FollowUpContext addRealtimeMessage] Adicionando ${message.conversation_id} ao Set de não lidas.`);
                    const newSet = new Set(prev);
                    newSet.add(message.conversation_id!);
                    return newSet;
                } else {
                    console.log(`[FollowUpContext addRealtimeMessage] ID ${message.conversation_id} já estava no Set de não lidas.`);
                    return prev; // Retorna o mesmo Set se já existe
                }
            });
        } else {
            // <<< LOG - CASO ESTRANHO >>>
            console.warn(`[FollowUpContext addRealtimeMessage] Mensagem ${message.id} sem conversation_id? Ignorando.`);
        }
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
        if (!wsId) throw new Error('Workspace ID não encontrado para pausar.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/pause`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao pausar.');
                // Update local state or trigger refetch of conversations
                setSelectedConversation(prev => prev ? { ...prev, activeFollowUp: prev.activeFollowUp ? { ...prev.activeFollowUp, status: 'PAUSED' } : null } : null);
            },
            setIsPausingFollowUp,
            setFollowUpsError,
            'Pausando sequência...',
            'Sequência pausada!'
        );
    }, [workspaceContext, handleApiCall]);

    const resumeFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para retomar.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/resume`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao retomar.');
                 // Update local state or trigger refetch of conversations
                 setSelectedConversation(prev => prev ? { ...prev, activeFollowUp: prev.activeFollowUp ? { ...prev.activeFollowUp, status: 'ACTIVE' } : null } : null);
            },
            setIsResumingFollowUp,
            setFollowUpsError,
            'Retomando sequência...',
            'Sequência retomada!'
        );
    }, [workspaceContext, handleApiCall]);

    const convertFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para converter.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/convert`, { followUpId, workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao converter.');
                 // Clear selected conversation if it was this one, or trigger list refetch
                 if (selectedConversation?.activeFollowUp?.id === followUpId) {
                    selectConversation(null); // Deselects, page should refetch list
                 }
                 // TODO: Consider triggering fetchConversations from the page component after this succeeds.
            },
            setIsConvertingFollowUp,
            setFollowUpsError,
            'Marcando como convertido...',
            'Marcado como convertido!'
        );
    }, [workspaceContext, handleApiCall, selectedConversation, selectConversation]);

    const cancelFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para cancelar.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/cancel`, { followUpId, workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao cancelar.');
                 // Clear selected conversation or trigger list refetch
                 if (selectedConversation?.activeFollowUp?.id === followUpId) {
                     selectConversation(null);
                 }
                // TODO: Consider triggering fetchConversations from the page component.
            },
            setIsCancellingFollowUp,
            setFollowUpsError,
            'Cancelando sequência...',
            'Sequência cancelada!'
        );
    }, [workspaceContext, handleApiCall, selectedConversation, selectConversation]);

    // --- Manual Message Action ---
    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string): Promise<Message> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para enviar.');
        // Note: success message is handled optimistically by the caller using updateMessageStatus
        return handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, data?: Message, error?: string }>(`/api/conversations/${conversationId}/messages`, { content });
                if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao enviar.');
                // No need to update local state here, caller uses updateMessageStatus
                return response.data.data;
            },
            setIsSendingMessage,
            setSelectedConversationError,
            'Enviando...', // Loading message
            undefined // No success message here, handled by caller
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