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
    // startFollowUpSequence: any
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

    // <<< NEW: Conversation List State & Actions >>>
    conversations: ClientConversation[];
    loadingConversations: boolean;
    conversationsError: string | null;
    fetchConversations: (filter: string, workspaceId?: string) => Promise<void>; // Changed return type to void
    updateOrAddConversationInList: (eventData: any) => void; // Function to handle SSE updates for the list

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
    updateRealtimeMessageContent: (messageData: {
        id: string;
        content?: string | null; // Permite null
        ai_media_analysis?: string | null; // <<< Campo existe no tipo Message agora
        media_url?: string | null;
        media_mime_type?: string | null;
        media_filename?: string | null;
        status?: string | null;
        metadata?: any;
    }) => void;
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
    // <<< NEW: Conversation List State >>>
    const [conversations, setConversations] = useState<ClientConversation[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [conversationsError, setConversationsError] = useState<string | null>(null);

    // --- Error/Cache Clear Functions ---
    const clearCampaignsError = useCallback(() => setCampaignsError(null), []);
    const clearFollowUpsError = useCallback(() => setFollowUpsError(null), []);
    const clearMessagesError = useCallback(() => setSelectedConversationError(null), []);
    const clearConversationsError = useCallback(() => setConversationsError(null), []); // <<< NEW
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
    }, [workspaceContext, handleApiCall]);
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

    // selectConversation
    const selectConversation = useCallback((conversation: ClientConversation | null) => {
        console.log(`[FollowUpContext] selectConversation called with: ${conversation ? `ID: ${conversation.id}` : 'null'}`);
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
            fetchConversationMessages(conversation.id);
        } else {
            setSelectedConversationMessages([]);
            setLoadingSelectedConversationMessages(false);
        }
    }, [fetchConversationMessages, unreadConversationIds]); // fetchConversationMessages needs to be defined before this

    // <<< DEFINE fetchConversations HERE, depends on selectConversation >>>
    const fetchConversations = useCallback(async (filter: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) {
            setConversationsError("Workspace ID não encontrado.");
            setConversations([]);
            selectConversation(null); // Use the defined selectConversation
            return;
        }
        setLoadingConversations(true);
        setConversationsError(null);
        try {
            console.log(`[FollowUpContext] Fetching conversations for ws: ${wsId}, filter: ${filter}`);
            const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
                '/api/conversations',
                { params: { workspaceId: wsId, status: filter } }
            );
            if (!response.data.success || !response.data.data) {
                throw new Error(response.data.error || 'Falha ao carregar conversas');
            }
            const fetchedData = response.data.data;
            setConversations(fetchedData);
            console.log(`[FollowUpContext] Fetched ${fetchedData.length} conversations with filter ${filter}.`);

            const currentSelectedId = selectedConversation?.id;
            const listHasSelected = fetchedData.some(c => c.id === currentSelectedId);

            if (currentSelectedId && !listHasSelected && fetchedData.length === 0) {
                console.log(`[FollowUpContext] fetchConversations: Conv ${currentSelectedId} not in new empty list. Deselecting.`);
                selectConversation(null);
            } else if ((!currentSelectedId || !listHasSelected) && fetchedData.length > 0) {
                console.log(`[FollowUpContext] fetchConversations: Selecting first conversation: ${fetchedData[0].id}`);
                selectConversation(fetchedData[0]);
            } else if (!currentSelectedId && fetchedData.length === 0) {
                 selectConversation(null);
            }
             // else: keep current selection if it exists in the new list

        } catch (err: any) {
            console.error("[FollowUpContext] Erro ao buscar conversas:", err);
            const message = err.response?.data?.error || err.message || 'Erro ao buscar conversas.';
            setConversationsError(message);
            setConversations([]);
            selectConversation(null);
        } finally {
            setLoadingConversations(false);
        }
    }, [workspaceContext, selectedConversation, selectConversation]); // Add selectConversation dependency

    // <<< DEFINE updateOrAddConversationInList HERE >>>
    const updateOrAddConversationInList = useCallback((eventData: any) => {
       // ... (implementation from previous attempt, ensure it uses getActiveWorkspaceId) ...
        console.log('[FollowUpContext] updateOrAddConversationInList called with:', eventData);
        const wsId = getActiveWorkspaceId(workspaceContext); // Get current workspace ID

        if (!eventData || !eventData.conversationId || eventData.conversationId === 'unknown' || !wsId) {
            console.warn('[FollowUpContext] Invalid event data or workspace ID for updateOrAddConversationInList. Ignoring.');
            return;
        }

        setConversations(prevConversations => {
            const convoIndex = prevConversations.findIndex(c => c.id === eventData.conversationId);
            let updatedList = [...prevConversations];

            const newLastMessageData = {
                content: eventData.lastMessageContent || '...',
                timestamp: eventData.lastMessageTimestamp || new Date().toISOString(),
                sender_type: eventData.lastMessageSenderType || 'UNKNOWN',
                id: eventData.lastMessageId || `msg_${Date.now()}`
            };

            if (convoIndex > -1) {
                const existingConvo = updatedList[convoIndex];
                const updatedConvoPreview = {
                    ...existingConvo,
                    last_message: newLastMessageData,
                    last_message_at: new Date(newLastMessageData.timestamp),
                    status: eventData.status || existingConvo.status,
                    is_ai_active: eventData.is_ai_active ?? existingConvo.is_ai_active,
                    updated_at: new Date()
                };
                updatedList.splice(convoIndex, 1);
                updatedList.unshift(updatedConvoPreview);
            } else {
                const newConversationPreview: ClientConversation = {
                    id: eventData.conversationId,
                    workspace_id: wsId,
                    client_id: eventData.clientId || 'unknown',
                    channel: eventData.channel || 'UNKNOWN',
                    status: eventData.status || 'ACTIVE',
                    is_ai_active: eventData.is_ai_active ?? true,
                    last_message_at: new Date(newLastMessageData.timestamp),
                    created_at: new Date(newLastMessageData.timestamp),
                    updated_at: new Date(newLastMessageData.timestamp),
                    client: {
                        id: eventData.clientId || 'unknown',
                        name: eventData.clientName || eventData.clientPhone || 'Novo Contato',
                        phone_number: eventData.clientPhone || null,
                        // workspace_id: wsId, channel: eventData.channel || 'UNKNOWN', external_id: eventData.clientPhone || null,
                        // created_at: new Date(), updated_at: new Date(), status: 'ACTIVE', metadata: {}
                    },
                    last_message: newLastMessageData,
                    activeFollowUp: null,
                    metadata: eventData.metadata || {},
                };
                updatedList.unshift(newConversationPreview);
            }
            return updatedList;
        });

        if (eventData.conversationId !== selectedConversation?.id) {
            setUnreadConversationIds(prev => {
                const next = new Set(prev);
                next.add(eventData.conversationId);
                return next;
            });
        }

    }, [workspaceContext, selectedConversation?.id]);

    // addMessageOptimistically, updateMessageStatus, addRealtimeMessage, updateRealtimeMessageContent (define before actions below)
    const addMessageOptimistically = useCallback((message: Message) => {
        setSelectedConversationMessages(prev => [...prev, message]);
    }, []);

    const updateMessageStatus = useCallback((tempId: string, finalMessage: Message | null, error?: string) => {
        setSelectedConversationMessages(prev => prev.map(msg => {
            if (msg.id === tempId) {
                if (error) {
                    return { ...msg, metadata: { ...msg.metadata, status: 'failed', error } };
                }
                if (finalMessage) {
                    // Replace temp message with final message, keeping local timestamp for ordering if needed?
                    // Or just use the final message entirely if timestamp is reliable
                    return finalMessage;
                }
            }
            return msg;
        }));
    }, []);

    const addRealtimeMessage = useCallback((message: Message) => {
        // Check if the message is already in the list (might happen with optimistic UI)
        setSelectedConversationMessages(prev => {
            if (prev.some(msg => msg.id === message.id)) {
                console.warn(`[FollowUpContext] addRealtimeMessage: Message ${message.id} já existe. Atualizando.`);
                return prev.map(msg => msg.id === message.id ? message : msg);
            }
            return [...prev, message];
        });
        // Marcar como não lida se não for a conversa selecionada
        if (message.conversation_id !== selectedConversation?.id) {
            setUnreadConversationIds(prev => new Set(prev).add(message.conversation_id));
        }
    }, [selectedConversation?.id]);

    const updateRealtimeMessageContent = useCallback((messageData: {
        id: string;
        content?: string | null; // Permite null
        ai_media_analysis?: string | null; // <<< Campo existe no tipo Message agora
        media_url?: string | null;
        media_mime_type?: string | null;
        media_filename?: string | null;
        status?: string | null;
        metadata?: any;
    }) => {
        console.log("[FollowUpContext] updateRealtimeMessageContent: Tentando atualizar msg ID:", messageData.id, " com payload:", messageData); // <<< LOG 1: Entry

        setSelectedConversationMessages(prevMessages => {
            console.log(`[FollowUpContext] updateRealtimeMessageContent: Estado ANTERIOR (${prevMessages.length} msgs):`, prevMessages.slice(-5)); // <<< LOG 2: Previous State
            const messageIndex = prevMessages.findIndex(msg => msg.id === messageData.id);

            if (messageIndex === -1) {
                console.warn(`[FollowUpContext] updateRealtimeMessageContent: Mensagem ${messageData.id} não encontrada no estado atual.`); // <<< LOG 3: Not Found
                return prevMessages; // Mensagem não encontrada, retorna estado inalterado
            }

            const updatedMessages = [...prevMessages];
            // <<< Acessar com segurança, prevMessages[messageIndex] pode ser undefined? Não com findIndex check.
            const messageToUpdate = { ...updatedMessages[messageIndex] }; 
            console.log(`[FollowUpContext] updateRealtimeMessageContent: Mensagem encontrada para atualizar (ANTES):`, messageToUpdate); // <<< LOG ANTES

            // Atualiza os campos fornecidos no payload
            // Atribui diretamente se a chave existe em messageData, permitindo que null sobrescreva.
            // <<< LOG DETALHADO DAS ATUALIZAÇÕES >>>
            console.log(`[FollowUpContext] updateRealtimeMessageContent: Atualizando com payload:`, messageData);
            if ('content' in messageData) { console.log(' -> content'); messageToUpdate.content = messageData.content; }
            if ('ai_media_analysis' in messageData) { console.log(' -> ai_media_analysis'); messageToUpdate.ai_media_analysis = messageData.ai_media_analysis; }
            if ('media_url' in messageData) { console.log(' -> media_url'); messageToUpdate.media_url = messageData.media_url; }
            if ('media_mime_type' in messageData) { console.log(' -> media_mime_type'); messageToUpdate.media_mime_type = messageData.media_mime_type; }
            if ('media_filename' in messageData) { console.log(' -> media_filename'); messageToUpdate.media_filename = messageData.media_filename; }
            if ('status' in messageData) { console.log(' -> status'); messageToUpdate.status = messageData.status; }
            
            // Merge metadata: preserves existing, adds/overwrites from payload if metadata exists in messageData
            if ('metadata' in messageData) {
                console.log(' -> metadata');
                messageToUpdate.metadata = {
                    ...(typeof messageToUpdate.metadata === 'object' && messageToUpdate.metadata !== null ? messageToUpdate.metadata : {}),
                    ...(typeof messageData.metadata === 'object' && messageData.metadata !== null ? messageData.metadata : {})
                };
            }

            updatedMessages[messageIndex] = messageToUpdate;
            console.log(`[FollowUpContext] updateRealtimeMessageContent: Mensagem atualizada (DEPOIS):`, messageToUpdate); // <<< LOG DEPOIS
            console.log(`[FollowUpContext] updateRealtimeMessageContent: Estado DEPOIS da atualização (array completo):`, updatedMessages.slice(-5)); 
            return updatedMessages;
        });
    }, []);


    // --- FollowUp Status/Action ---
    const pauseFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        // ... (implementation kept as is) ...
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para pausar.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/pause`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao pausar.');
                setSelectedConversation(prev => prev && prev.activeFollowUp?.id === followUpId ? { ...prev, activeFollowUp: { ...prev.activeFollowUp, status: 'PAUSED' } } : prev);
            },
            setIsPausingFollowUp, setSelectedConversationError, 'Pausando sequência...', 'Sequência pausada.'
        );
    }, [workspaceContext, handleApiCall]);

    const resumeFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
       // ... (implementation kept as is) ...
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para retomar.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/resume`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao retomar.');
                 setSelectedConversation(prev => prev && prev.activeFollowUp?.id === followUpId ? { ...prev, activeFollowUp: { ...prev.activeFollowUp, status: 'ACTIVE' } } : prev);
            },
            setIsResumingFollowUp, setSelectedConversationError, 'Retomando sequência...', 'Sequência retomada.'
        );
    }, [workspaceContext, handleApiCall]);

    // <<< DEFINE convertFollowUp AFTER fetchConversations >>>
    const convertFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para marcar como convertido.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/convert`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao converter.');
                if (selectedConversation?.activeFollowUp?.id === followUpId) {
                    setSelectedConversation(prev => prev ? { ...prev, activeFollowUp: null, status: 'COMPLETED' } : null);
                }
                // <<< Call fetchConversations directly >>>
                fetchConversations('ATIVAS', wsId); // Refetch ATIVAS list (or the current filter if available)
            },
            setIsConvertingFollowUp, setSelectedConversationError, 'Marcando como convertido...', 'Sequência marcada como convertida.'
        );
        // <<< Update dependencies >>>
    }, [workspaceContext, handleApiCall, selectedConversation?.status, fetchConversations]);

    // <<< DEFINE cancelFollowUp AFTER fetchConversations >>>
    const cancelFollowUp = useCallback(async (followUpId: string, workspaceId?: string): Promise<void> => {
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para cancelar sequência.');
        await handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, message?: string, error?: string }>(`/api/follow-up/${followUpId}/cancel`, { workspaceId: wsId });
                if (!response.data.success) throw new Error(response.data.error || 'Falha ao cancelar.');
                if (selectedConversation?.activeFollowUp?.id === followUpId) {
                    setSelectedConversation(prev => prev ? { ...prev, activeFollowUp: null, status: 'CANCELLED' } : null);
                }
                // <<< Call fetchConversations directly >>>
                fetchConversations('ATIVAS', wsId); // Refetch ATIVAS list (or the current filter)
            },
            setIsCancellingFollowUp, setSelectedConversationError, 'Cancelando sequência...', 'Sequência cancelada.'
        );
        // <<< Update dependencies >>>
    }, [workspaceContext, handleApiCall, selectedConversation?.status, fetchConversations]);


    // --- Manual Message Action (Keep as is) ---
    const sendManualMessage = useCallback(async (conversationId: string, content: string, workspaceId?: string): Promise<Message> => {
       // ... (implementation kept as is) ...
        const wsId = getActiveWorkspaceId(workspaceContext, workspaceId);
        if (!wsId) throw new Error('Workspace ID é necessário para enviar mensagem.');
        return handleApiCall(
            async () => {
                const response = await axios.post<{ success: boolean, data: Message, error?: string }>(
                    `/api/conversations/${conversationId}/messages`,
                    { content, workspaceId: wsId, senderType: 'AI' }
                );
                if (!response.data.success || !response.data.data) {
                    throw new Error(response.data.error || 'Falha ao enviar mensagem');
                }
                return response.data.data;
            },
            setIsSendingMessage, null, null,
        );
    }, [workspaceContext, handleApiCall]);


    // --- Context Value (Ensure all functions are defined ABOVE this) ---
    const contextValue: FollowUpContextType = useMemo(() => ({
        // Campaign
        campaigns, loadingCampaigns, campaignsError,
        fetchCampaigns, createCampaign, updateCampaign, deleteCampaign, clearCampaignsError,
        // FollowUp List
        followUps, loadingFollowUps, followUpsError,
        fetchFollowUps, clearFollowUpsError,
        // <<< Conversation List >>>
        conversations, loadingConversations, conversationsError,
        fetchConversations, // Reference function defined above
        updateOrAddConversationInList, // Reference function defined above
        // Selected Conversation
        selectedConversation, loadingSelectedConversation,
        selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError,
        selectConversation, fetchConversationMessages, clearMessagesError, addMessageOptimistically, updateMessageStatus,
        // Action States & Functions
        isStartingSequence, isPausingFollowUp, isResumingFollowUp, isConvertingFollowUp, isCancellingFollowUp, isSendingMessage,
        /* startFollowUpSequence, */ pauseFollowUp, resumeFollowUp, convertFollowUp, cancelFollowUp, sendManualMessage,
        // Cache & Realtime
        clearMessageCache, addRealtimeMessage, updateRealtimeMessageContent,
        unreadConversationIds, setUnreadConversationIds,

    }), [
        // State dependencies
        campaigns, loadingCampaigns, campaignsError,
        followUps, loadingFollowUps, followUpsError,
        conversations, loadingConversations, conversationsError,
        selectedConversation, loadingSelectedConversation, selectedConversationMessages, loadingSelectedConversationMessages, selectedConversationError,
        isStartingSequence, isPausingFollowUp, isResumingFollowUp, isConvertingFollowUp, isCancellingFollowUp, isSendingMessage,
        unreadConversationIds,
        // Function dependencies (useCallback refs)
        fetchCampaigns, createCampaign, updateCampaign, deleteCampaign, clearCampaignsError,
        fetchFollowUps, clearFollowUpsError,
        fetchConversations, // <<< Add hook reference
        updateOrAddConversationInList, // <<< Add hook reference
        selectConversation, fetchConversationMessages, clearMessagesError, addMessageOptimistically, updateMessageStatus,
        /* startFollowUpSequence, */ pauseFollowUp, resumeFollowUp, convertFollowUp, cancelFollowUp, sendManualMessage,
        clearMessageCache, addRealtimeMessage, updateRealtimeMessageContent,
        setUnreadConversationIds,
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