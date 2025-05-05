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
    selectedConversationError: string | null;
    messageCache: Record<string, Message[]>;
    unreadConversationIds: Set<string>;
    setUnreadConversationIds: Dispatch<SetStateAction<Set<string>>>;
    isSendingMessage: boolean;
    isTogglingAIStatus: boolean;
    isPusherConnected: boolean;

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
    const [selectedConversationError, setSelectedConversationError] = useState<string | null>(null);
    const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});
    const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [isTogglingAIStatus, setIsTogglingAIStatus] = useState(false);
    const [isPusherConnected, setIsPusherConnected] = useState(false);

    // --- Refs para Pusher --- //
    const pusherRef = useRef<Pusher | null>(null);
    const channelRef = useRef<Channel | null>(null);

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
                 const failedMessage = { ...optimisticMessage, status: 'FAILED', media_url: null } as Message; // Remove preview local no erro
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
            // Chama a Server Action
            const success = await setConversationAIStatus(conversationId, newStatus);

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
    }, [selectedConversation?.id]);

    // --- Efeito para Gerenciar Conexão Pusher --- //
    useEffect(() => {
        const workspaceId = workspaceContext.workspace?.id;

        // Função de limpeza para desconectar e desinscrever
        const cleanupPusher = () => {
            if (channelRef.current) {
                // Remove listeners específicos antes de desinscrever
                channelRef.current.unbind_all();
                // Remove o próprio bind (boa prática)
                channelRef.current.unbind('new_message', handleRealtimeNewMessage);
                channelRef.current.unbind('message_status_update', handleRealtimeStatusUpdate);
                // TODO: Adicionar unbind para 'ai_status_update' se implementado
                console.log(`[Pusher] Unbinding listeners from channel: ${channelRef.current.name}`);
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
            console.log(`[Pusher] Workspace ID ${workspaceId} available. Setting up Pusher.`);
            cleanupPusher(); // Garante limpeza antes de conectar

            // Valida se as chaves públicas estão presentes
            const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
            const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

            if (!pusherKey || !pusherCluster) {
                console.error('[Pusher] Error: NEXT_PUBLIC_PUSHER_KEY or NEXT_PUBLIC_PUSHER_CLUSTER is not defined.');
                toast.error('Erro de configuração do Pusher (Frontend). Verifique as variáveis de ambiente.');
                return; // Não tenta conectar
            }

            try {
                pusherRef.current = new Pusher(pusherKey, {
                    cluster: pusherCluster,
                    authEndpoint: '/api/pusher/auth', // Endpoint criado no backend
                    // auth: { // Se precisar passar headers customizados para auth (raro)
                    //   headers: { 'X-Custom-Header': 'value' }
                    // },
                    forceTLS: true // Garante HTTPS
                });

                const pusherInstance = pusherRef.current;

                pusherInstance.connection.bind('connected', () => {
                    console.log('[Pusher] Connection successful!');
                    setIsPusherConnected(true);
                });

                pusherInstance.connection.bind('disconnected', () => {
                    console.warn('[Pusher] Disconnected.');
                    setIsPusherConnected(false);
                    // Lógica de reconexão pode ser adicionada aqui se necessário,
                    // mas o pusher-js geralmente tenta reconectar automaticamente.
                });

                pusherInstance.connection.bind('error', (err: any) => {
                    console.error('[Pusher] Connection error:', err);
                    setIsPusherConnected(false);
                    // Erros comuns: auth falhou (403), problema de rede, config errada.
                    if (err.error?.data?.code === 4004) { // Exemplo de código de erro específico
                        toast.error('Pusher: App não existe ou cluster errado.');
                    } else if (err.error?.data?.code === 4001) {
                        toast.error('Pusher: Key inválida.');
                    }
                    // Considerar outros erros
                });

                // Inscrever no canal específico do workspace
                const channelName = `private-workspace-${workspaceId}`;
                console.log(`[Pusher] Subscribing to channel: ${channelName}`);
                channelRef.current = pusherInstance.subscribe(channelName);
                const channelInstance = channelRef.current;

                // Bind para evento de sucesso na inscrição (opcional, mas útil para debug)
                channelInstance.bind('pusher:subscription_succeeded', () => {
                    console.log(`[Pusher] Successfully subscribed to ${channelName}`);
                    // Se precisar, pode chamar alguma função aqui após inscrição bem sucedida
                });

                // Bind para evento de falha na inscrição (importante para debug de auth)
                channelInstance.bind('pusher:subscription_error', (status: number) => {
                    console.error(`[Pusher] Failed to subscribe to ${channelName}. Status: ${status}`);
                    // Status 403 geralmente indica problema no endpoint /api/pusher/auth
                    // Status 401 pode indicar problema com a key/secret no backend
                    toast.error(`Falha ao conectar ao canal (${status}). Verifique permissões ou logs do servidor.`);
                    setIsPusherConnected(false); // Considerar conexão falha se não puder inscrever
                });

                // --- Vincular Handlers de Eventos --- //
                console.log(`[Pusher] Binding event handlers to ${channelName}`);

                // Tenta parsear o payload JSON antes de passar para o handler
                const bindJsonEvent = (eventName: string, handler: (data: any) => void) => {
                    channelInstance.bind(eventName, (jsonData: any) => {
                        console.log(`[Pusher] Received raw event '${eventName}':`, jsonData);
                        try {
                            // Pusher envia como string, precisamos parsear
                            const parsedData = (typeof jsonData === 'string') ? JSON.parse(jsonData) : jsonData;
                            // Verifica se o payload esperado existe (estrutura definida na API)
                            if (parsedData && parsedData.payload) {
                                console.log(`[Pusher] Parsed payload for '${eventName}':`, parsedData.payload);
                                handler(parsedData.payload); // Passa apenas o payload para o handler
                            } else {
                                console.warn(`[Pusher] Received event '${eventName}' but payload is missing or invalid:`, parsedData);
                            }
                        } catch (error) {
                            console.error(`[Pusher] Error parsing JSON for event '${eventName}':`, error, 'Raw data:', jsonData);
                        }
                    });
                };

                bindJsonEvent('new_message', handleRealtimeNewMessage);
                bindJsonEvent('message_status_update', handleRealtimeStatusUpdate);
                // TODO: Adicionar bind para 'ai_status_update' se/quando implementado
                // bindJsonEvent('ai_status_update', handleRealtimeAiStatusUpdate);

            } catch (error) {
                console.error('[Pusher] Failed to initialize Pusher:', error);
                toast.error('Erro ao inicializar a conexão em tempo real.');
                cleanupPusher(); // Limpa em caso de erro na inicialização
            }

        } else {
            console.log('[Pusher] No workspace ID available. Cleaning up existing connection if any.');
            cleanupPusher(); // Limpa se não houver workspace ID
        }

        // Função de limpeza do useEffect: garante desconexão ao desmontar ou mudar workspace
        return cleanupPusher;

    }, [workspaceContext.workspace?.id, handleRealtimeNewMessage, handleRealtimeStatusUpdate]); // Dependências

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
        isPusherConnected,
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
        isPusherConnected,
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