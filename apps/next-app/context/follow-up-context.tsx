// apps/next-app/context/follow-up-context.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import axios, { AxiosError } from 'axios';
import { useWorkspace } from '@/context/workspace-context';
import type {
    Campaign,
    FollowUp,
    Message,
    ClientConversation, // Assumindo que este tipo existe para a lista
    CampaignFormData, // Assumindo que este tipo existe para forms
} from '@/app/types';
import { toast } from 'react-hot-toast';

// --- Helper Function ---
const getActiveWorkspaceId = (workspaceCtx: any, providedId?: string): string | null => {
    // Prioridade: ID fornecido explicitamente
    if (providedId) return providedId;
    // Próximo: ID do workspace ativo no contexto
    if (workspaceCtx?.workspace?.id) return workspaceCtx.workspace.id;
    // Fallback: ID armazenado na sessão do navegador
    if (typeof window !== 'undefined') {
        const storedId = sessionStorage.getItem('activeWorkspaceId');
        if (storedId) return storedId;
    }
    console.warn("FollowUpContext: Não foi possível determinar o ID do workspace ativo.");
    return null;
};

// --- Context Type Definition ---
interface FollowUpContextType {
    // Campaign State & Actions
    campaigns: Campaign[];
    loadingCampaigns: boolean;
    campaignsError: string | null;
    selectedCampaign: Campaign | null; // Para edição/detalhes da campanha
    loadingSelectedCampaign: boolean;
    fetchCampaigns: (workspaceId?: string) => Promise<Campaign[]>;
    fetchCampaign: (campaignId: string, workspaceId?: string) => Promise<Campaign | null>; // Pode retornar null
    createCampaign: (data: CampaignFormData, workspaceId?: string) => Promise<Campaign>;
    updateCampaign: (campaignId: string, data: Partial<CampaignFormData>, workspaceId?: string) => Promise<Campaign>;
    deleteCampaign: (campaignId: string, workspaceId?: string) => Promise<void>;
    clearCampaignsError: () => void;

    // FollowUp List State & Actions (Lista geral, não detalhes individuais por agora)
    followUps: FollowUp[]; // Lista filtrável de follow-ups
    loadingFollowUps: boolean;
    followUpsError: string | null;
    fetchFollowUps: (status?: string, workspaceId?: string) => Promise<FollowUp[]>;
    clearFollowUpsError: () => void;

    // Selected Conversation State & Actions
    selectedConversationMessages: Message[];
    loadingSelectedConversationMessages: boolean;
    selectedConversationError: string | null;
    fetchConversationMessages: (conversationId: string) => Promise<Message[]>;
    clearMessagesError: () => void;
    addMessageOptimistically: (message: Message) => void; // Para UI em tempo real (ou após envio)
    updateMessageStatus: (tempId: string, finalMessage: Message | null, error?: string) => void; // Para atualizar status de envio

    // Specific Action Loaders & Actions
    isStartingSequence: boolean;
    isConvertingFollowUp: boolean;
    isCancellingFollowUp: boolean;
    isSendingMessage: boolean;
    startFollowUpSequence: (clientId: string, workspaceId?: string /* , optional campaignId? */) => Promise<{ followUpId: string }>;
    convertFollowUp: (followUpId: string, workspaceId?: string) => Promise<void>;
    cancelFollowUp: (followUpId: string, workspaceId?: string) => Promise<void>;
    sendManualMessage: (conversationId: string, content: string, workspaceId?: string) => Promise<Message>; // Retorna a mensagem criada

    // Cache Management (simple)
    clearMessageCache: (conversationId: string) => void;
}

// --- Context Creation ---
const FollowUpContext = createContext<FollowUpContextType | undefined>(undefined);

// --- Provider Component ---
export const FollowUpProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const workspaceContext = useWorkspace(); // Obter workspace do contexto pai

    // Campaign States
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loadingCampaigns, setLoadingCampaigns] = useState(false);
    const [campaignsError, setCampaignsError] = useState<string | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [loadingSelectedCampaign, setLoadingSelectedCampaign] = useState(false);

    // FollowUp List States
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [loadingFollowUps, setLoadingFollowUps] = useState(false);
    const [followUpsError, setFollowUpsError] = useState<string | null>(null);

    // Selected Conversation States
    const [selectedConversationMessages, setSelectedConversationMessages] = useState<Message[]>([]);
    const [loadingSelectedConversationMessages, setLoadingSelectedConversationMessages] = useState(false);
    const [selectedConversationError, setSelectedConversationError] = useState<string | null>(null);

    // Action Loading States
    const [isStartingSequence, setIsStartingSequence] = useState(false);
    const [isConvertingFollowUp, setIsConvertingFollowUp] = useState(false);
    const [isCancellingFollowUp, setIsCancellingFollowUp] = useState(false);
    const [isSendingMessage, setIsSendingMessage] = useState(false);

    // Simple Cache
    const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});

    // --- Error Clear Functions ---
    const clearCampaignsError = useCallback(() => setCampaignsError(null), []);
    const clearFollowUpsError = useCallback(() => setFollowUpsError(null), []);
    const clearMessagesError = useCallback(() => setSelectedConversationError(null), []);

    // --- API Call Utility ---
    const handleApiCall = useCallback(async <T,>(
        apiCall: () => Promise<T>,
        setLoading: React.Dispatch<React.SetStateAction<boolean>>,
        setError: React.Dispatch<React.SetStateAction<string | null>>,
        loadingMessage: string | null = 'Processando...',
        successMessage?: string,
    ): Promise<T> => {
        if(loadingMessage) toast.loading(loadingMessage, { id: 'api-call-toast' });
        setLoading(true);
        setError(null);
        try {
            const result = await apiCall();
            if(loadingMessage) toast.dismiss('api-call-toast');
            if (successMessage) toast.success(successMessage);
            return result;
        } catch (error) {
             if(loadingMessage) toast.dismiss('api-call-toast');
            const message = error instanceof AxiosError
                ? error.response?.data?.error || error.response?.data?.message || error.message
                : (error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.');
            console.error(`API Call Error (${loadingMessage || 'Task'}):`, error);
            setError(message);
            toast.error(message);
            throw new Error(message); // Re-throw para o chamador tratar se necessário
        } finally {
            setLoading(false);
        }
    }, []); // Memoize a função utilitária

    // --- Campaign Actions ---
    const fetchCampaigns = useCallback(async (workspaceId?: string): Promise<Campaign[]> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) return []; // Retorna vazio se não houver workspace

        return handleApiCall(
            async () => {
                const response = await axios.get<{ success: boolean, data?: Campaign[], error?: string }>(
                    `/api/follow-up/campaigns?workspaceId=${wsId}`
                );
                if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao buscar campanhas');
                setCampaigns(response.data.data);
                return response.data.data;
            },
            setLoadingCampaigns,
            setCampaignsError,
            null // Não mostrar toast de loading para busca inicial
        );
    }, [workspaceContext, handleApiCall]);

    const fetchCampaign = useCallback(async (campaignId: string, workspaceId?: string): Promise<Campaign | null> => {
         const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
         if (!wsId) return null;
         // TODO: Add Caching if needed
        return handleApiCall(
            async () => {
                const response = await axios.get<{ success: boolean, data?: Campaign, error?: string }>(
                    `/api/follow-up/campaigns/${campaignId}?workspaceId=${wsId}`
                );
                 if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao buscar campanha');
                 setSelectedCampaign(response.data.data); // Atualiza o estado da campanha selecionada
                 return response.data.data;
            },
            setLoadingSelectedCampaign,
            setCampaignsError, // Pode usar o mesmo erro de campanha
            null // 'Carregando campanha...'
        );
    }, [workspaceContext, handleApiCall]);

    const createCampaign = useCallback(async (data: CampaignFormData, workspaceId?: string): Promise<Campaign> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para criar campanha.');

        return handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, data: Campaign, error?: string }>(
                    '/api/follow-up/campaigns',
                    { ...data, workspaceId: wsId } // Garante que o wsId está no corpo
                );
                 if (!response.data.success) throw new Error(response.data.error || 'Falha ao criar campanha');
                 const newCampaign = response.data.data;
                 setCampaigns(prev => [newCampaign, ...prev]); // Adiciona à lista local
                 return newCampaign;
            },
            setLoadingCampaigns, // Pode usar o loading geral ou um específico
            setCampaignsError,
            'Criando campanha...',
            'Campanha criada com sucesso!'
        );
    }, [workspaceContext, handleApiCall]);

    const updateCampaign = useCallback(async (campaignId: string, data: Partial<CampaignFormData>, workspaceId?: string): Promise<Campaign> => {
         const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
         if (!wsId) throw new Error('Workspace ID é necessário para atualizar campanha.');

        return handleApiCall(
            async () => {
                const response = await axios.put<{ success: boolean, data: Campaign, error?: string }>(
                    `/api/follow-up/campaigns/${campaignId}`,
                    { ...data, workspaceId: wsId } // Garante wsId no corpo
                );
                 if (!response.data.success) throw new Error(response.data.error || 'Falha ao atualizar campanha');
                 const updatedCampaign = response.data.data;
                 // Atualiza lista e selecionada
                 setCampaigns(prev => prev.map(c => c.id === campaignId ? updatedCampaign : c));
                 if (selectedCampaign?.id === campaignId) {
                     setSelectedCampaign(updatedCampaign);
                 }
                 return updatedCampaign;
            },
            setLoadingCampaigns, // Ou específico
            setCampaignsError,
            'Atualizando campanha...',
            'Campanha atualizada com sucesso!'
        );
    }, [workspaceContext, handleApiCall, selectedCampaign]);

     const deleteCampaign = useCallback(async (campaignId: string, workspaceId?: string): Promise<void> => {
         const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
         if (!wsId) throw new Error('Workspace ID é necessário para excluir campanha.');

         await handleApiCall(
             async () => {
                 const response = await axios.delete<{ success: boolean, message?: string, error?: string }>(
                     `/api/follow-up/campaigns/${campaignId}?workspaceId=${wsId}` // Passa como query param
                 );
                 if (!response.data.success) throw new Error(response.data.error || 'Falha ao excluir campanha');
                 // Remove da lista
                 setCampaigns(prev => prev.filter(c => c.id !== campaignId));
                 if (selectedCampaign?.id === campaignId) {
                    setSelectedCampaign(null);
                 }
             },
             setLoadingCampaigns, // Ou específico
             setCampaignsError,
             'Excluindo campanha...',
             'Campanha excluída com sucesso!'
         );
     }, [workspaceContext, handleApiCall, selectedCampaign]);


    // --- FollowUp List Actions ---
    const fetchFollowUps = useCallback(async (status?: string, workspaceId?: string): Promise<FollowUp[]> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) return [];

        return handleApiCall(
            async () => {
                let url = `/api/follow-up?workspaceId=${wsId}`;
                if (status) url += `&status=${status}`;
                const response = await axios.get<{ success: boolean, data?: FollowUp[], error?: string }>(url);
                if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao buscar follow-ups');
                setFollowUps(response.data.data);
                return response.data.data;
            },
            setLoadingFollowUps,
            setFollowUpsError,
            null // Não mostrar toast de loading
        );
    }, [workspaceContext, handleApiCall]);

    // --- Selected Conversation Actions ---
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
                setSelectedConversationMessages(response.data.data);
                setMessageCache(prev => ({ ...prev, [conversationId]: response.data.data! }));
                return response.data.data;
            },
            setLoadingSelectedConversationMessages,
            setSelectedConversationError,
            null // Não mostrar toast de loading
        );
    }, [messageCache, handleApiCall]);

     const clearMessageCache = useCallback((conversationId: string) => {
        setMessageCache(prev => {
          const newCache = { ...prev };
          delete newCache[conversationId];
          console.log(`FollowUpContext: Cache cleared for conv ${conversationId}`);
          return newCache;
        });
     }, []);

     const addMessageOptimistically = useCallback((message: Message) => {
         setSelectedConversationMessages(prev => [...prev, message]);
     }, []);

    const updateMessageStatus = useCallback((tempId: string, finalMessage: Message | null, error?: string) => {
        setSelectedConversationMessages(prev => prev.map(msg => {
            if (msg.id === tempId) {
                if (finalMessage) {
                    // Substitui a mensagem temporária pela final
                    return finalMessage;
                } else {
                    // Marca como falha
                    return { ...msg, metadata: { ...msg.metadata, status: 'failed', error: error || 'Erro desconhecido' } };
                }
            }
            return msg;
        }));
    }, []);


    // --- FollowUp Status Actions ---
     const startFollowUpSequence = useCallback(async (clientId: string, workspaceId?: string): Promise<{ followUpId: string }> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para iniciar sequência.');

        return handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, data?: { followUpId: string }, error?: string }>(
                    '/api/follow-up',
                    { clientId, workspaceId: wsId }
                );
                 if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao iniciar sequência.');
                 // Opcional: Refetch follow-ups list or update locally
                 // fetchFollowUps(undefined, wsId);
                 return response.data.data;
            },
            setIsStartingSequence, // Usa loading específico
            setFollowUpsError, // Pode usar erro geral de follow-ups
            'Iniciando sequência...',
            'Sequência iniciada!'
        );
    }, [workspaceContext, handleApiCall /*, fetchFollowUps*/]);

    const convertFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para converter.');

        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(
                    '/api/follow-up/convert',
                    { followUpId, workspaceId: wsId }
                );
                 if (!response.data.success) throw new Error(response.data.error || 'Falha ao marcar como convertido.');
                 // Opcional: Refetch ou update local
                 // fetchFollowUps(undefined, wsId);
            },
            setIsConvertingFollowUp, // Loading específico
            setFollowUpsError,
            'Marcando como convertido...',
            'Marcado como convertido!'
        );
    }, [workspaceContext, handleApiCall /*, fetchFollowUps*/]);

    const cancelFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para cancelar.');

         await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(
                    '/api/follow-up/cancel',
                    { followUpId, workspaceId: wsId }
                );
                 if (!response.data.success) throw new Error(response.data.error || 'Falha ao cancelar sequência.');
                 // Opcional: Refetch ou update local
                 // fetchFollowUps(undefined, wsId);
            },
            setIsCancellingFollowUp, // Loading específico
            setFollowUpsError,
            'Cancelando sequência...',
            'Sequência cancelada!'
         );
    }, [workspaceContext, handleApiCall /*, fetchFollowUps*/]);

    // --- Manual Message Action ---
    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string): Promise<Message> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID não encontrado para enviar mensagem.');

        return handleApiCall(
            async () => {
                 const response = await axios.post<{ success: boolean, data?: Message, error?: string }>(
                     `/api/conversations/${conversationId}/messages`,
                     { content }
                 );
                 if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao enviar mensagem.');
                 const sentMessage = response.data.data;
                 // Adiciona à lista local (ou espera WebSocket)
                 setSelectedConversationMessages(prev => [...prev, sentMessage]);
                 clearMessageCache(conversationId); // Invalida cache
                 return sentMessage;
            },
            setIsSendingMessage, // Loading específico
            setSelectedConversationError, // Erro específico da conversa
            'Enviando mensagem...',
            'Mensagem enviada!' // Sucesso implícito pela atualização
        );
    }, [workspaceContext, handleApiCall, clearMessageCache]);


    // --- Context Value ---
    const contextValue: FollowUpContextType = useMemo(() => ({
        // Campaign
        campaigns, loadingCampaigns, campaignsError,
        selectedCampaign, loadingSelectedCampaign,
        fetchCampaigns, fetchCampaign, createCampaign, updateCampaign, deleteCampaign, clearCampaignsError,
        // FollowUp List
        followUps, loadingFollowUps, followUpsError,
        fetchFollowUps, clearFollowUpsError,
        // Selected Conversation
        selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError,
        fetchConversationMessages, clearMessagesError, addMessageOptimistically, updateMessageStatus,
        // Action States & Functions
        isStartingSequence, isConvertingFollowUp, isCancellingFollowUp, isSendingMessage,
        startFollowUpSequence, convertFollowUp, cancelFollowUp, sendManualMessage,
        // Cache
        clearMessageCache,
    }), [
        // Dependências dos estados e funções memoizadas
        campaigns, loadingCampaigns, campaignsError, selectedCampaign, loadingSelectedCampaign,
        followUps, loadingFollowUps, followUpsError,
        selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError,
        isStartingSequence, isConvertingFollowUp, isCancellingFollowUp, isSendingMessage,
        fetchCampaigns, fetchCampaign, createCampaign, updateCampaign, deleteCampaign, clearCampaignsError,
        fetchFollowUps, clearFollowUpsError,
        fetchConversationMessages, clearMessagesError, addMessageOptimistically, updateMessageStatus,
        startFollowUpSequence, convertFollowUp, cancelFollowUp, sendManualMessage,
        clearMessageCache
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
        throw new Error('useFollowUp deve ser usado dentro de um FollowUpProvider');
    }
    return context;
};