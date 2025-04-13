// app/workspace/[slug]/conversations/components/ConversationDetail.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Paperclip,
  UserCog,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import type { Message } from '@/app/types';
import { toast } from 'react-hot-toast';
import { useConversationContext } from '@/context/ConversationContext';
import { useClient } from '@/context/client-context';
import ConversationInputArea from './ConversationInputArea';
import ClientInfoSidebar from './ClientInfoSidebar';
import { Button } from '@/components/ui/button';

export default function ConversationDetail() {
  console.log('[ConvDetail LIFECYCLE] Rendering/Mounting (Simplified)...');

  // --- Context ---
  const {
    selectedConversation: conversation,
    selectedConversationMessages: messages,
    loadingSelectedConversationMessages: isLoadingMessages,
    selectedConversationError: messageError,
    isSendingMessage,
    sendManualMessage,
    addMessageOptimistically,
    updateMessageStatus,
    clearMessagesError,
    addRealtimeMessage,
    updateRealtimeMessageContent,
    updateRealtimeMessageStatus,
    selectConversation,
  } = useConversationContext();
  const { updateClient, deleteClient } = useClient();

  // --- Local State ---
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isClientSidebarOpen, setIsClientSidebarOpen] = useState(false);

  // --- Scroll Logic ---
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scrollAreaElement = scrollAreaRef.current;
    if (scrollAreaElement) {
      const viewportElement = scrollAreaElement.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
      if (viewportElement) {
        viewportElement.scrollTo({ top: viewportElement.scrollHeight, behavior });
      }
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0 && !isLoadingMessages) {
      const timer = setTimeout(() => scrollToBottom('auto'), 150);
      return () => clearTimeout(timer);
    }
  }, [messages, isLoadingMessages, conversation?.id, scrollToBottom]);

  const prevMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const scrollAreaElement = scrollAreaRef.current;
      const viewportElement = scrollAreaElement?.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
      if (viewportElement) {
        const isScrolledToBottom = viewportElement.scrollHeight - viewportElement.scrollTop - viewportElement.clientHeight < 150;
        if (isScrolledToBottom) {
           scrollToBottom('smooth');
        }
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, scrollToBottom]);

  // --- SSE Logic ---
  useEffect(() => {
    const processedMessageIds = new Set<string>();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (conversation?.id) {
      const conversationId = conversation.id;
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 2000;
      const connectSSE = () => {
        const newEventSource = new EventSource(`/api/conversations/${conversationId}/events`);
        eventSourceRef.current = newEventSource;
        newEventSource.addEventListener('connection_ready', () => { retryCount = 0; });
        newEventSource.addEventListener('new_message', (event) => {
          try {
            const messageData = JSON.parse(event.data);
            if (!messageData.id || processedMessageIds.has(messageData.id)) return;
            processedMessageIds.add(messageData.id);
            if (processedMessageIds.size > 50) { processedMessageIds.delete(processedMessageIds.values().next().value); }
            addRealtimeMessage(messageData);
          } catch (error) { console.error("SSE new_message parse error:", error, event.data); }
        });
        newEventSource.addEventListener('message_content_updated', (event) => {
           try {
             const payload = JSON.parse(event.data);
             if (payload && payload.id && payload.conversation_id) {
               updateRealtimeMessageContent(payload);
             } else { console.warn("Invalid SSE content update payload", payload); }
           } catch (error) { console.error("SSE content update parse error:", error, event.data); }
        });
        newEventSource.addEventListener('message_status_updated', (event) => {
           try {
             const payload = JSON.parse(event.data);
             if (payload && payload.messageId && payload.conversation_id && payload.newStatus) {
               // Renomear para messageId para consistência com o contexto
               const statusUpdatePayload = { ...payload, messageId: payload.messageId };
               updateRealtimeMessageStatus(statusUpdatePayload);
             } else { console.warn("Invalid SSE status update payload", payload); }
           } catch (error) { console.error("SSE status update parse error:", error, event.data); }
        });
        newEventSource.addEventListener('error', () => {
          console.error("SSE Connection Error");
          if (retryCount < maxRetries) {
            retryCount++;
            newEventSource.close();
            eventSourceRef.current = null;
            setTimeout(connectSSE, retryDelay);
          } else {
            toast.error('Erro na conexão real-time.');
          }
        });
      };
      connectSSE();
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [conversation?.id, addRealtimeMessage, updateRealtimeMessageContent, updateRealtimeMessageStatus]);

  // --- Send Handler ---
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage || !conversation?.id || !conversation.workspace_id || !conversation.client_id) return;
    
    const tempMessageId = `temp_${Date.now()}`;
    const optimisticMessage: Message = {
        id: tempMessageId,
        conversation_id: conversation.id,
        sender_type: 'AGENT', 
        message_type: 'TEXT', 
        content: trimmedMessage,
        status: 'PENDING',
        timestamp: new Date().toISOString(), 
        client_id: conversation.client_id, 
        workspace_id: conversation.workspace_id,
        llm_summary: null,
        media_url: null,
        media_mime_type: null,
        media_filename: null,
        provider_message_id: null,
        metadata: null,
    };
    addMessageOptimistically(optimisticMessage);
    setNewMessage(''); 

    try {
      await sendManualMessage(conversation.id, trimmedMessage, conversation.workspace_id);
      scrollToBottom('smooth');
    } catch (error) {
      // Error handled in context
      console.error('[ConvDetail Send] Error sending message:', error);
    }
  };

  // --- Client Sidebar Handlers ---
  const handleSaveClient = async (clientId: string, updatedData: { name?: string | null; phone_number?: string | null; metadata?: any }) => {
    console.log(`[ConvDetail] Tentando salvar cliente ${clientId} com dados:`, updatedData);
    try {
        await updateClient(clientId, updatedData);
        // ATENÇÃO: Após salvar, precisamos atualizar os dados do cliente no contexto
        // ou forçar um refetch da conversa/lista para refletir a mudança na UI.
        if (conversation) {
             console.log("[ConvDetail] Refetching conversation data after client update...");
             selectConversation(conversation);
        }
        console.log(`[ConvDetail] Cliente ${clientId} salvo (via contexto).`);
    } catch (error: any) {
        console.error(`[ConvDetail] Erro ao salvar cliente ${clientId}:`, error);
        toast.error(`Erro ao salvar cliente: ${error.message || 'Erro desconhecido'}`);
        throw error;
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    console.log(`[ConvDetail] Tentando deletar cliente ${clientId}`);
    try {
        if (!conversation?.workspace_id) {
            throw new Error("Workspace ID não encontrado para deletar cliente.");
        }
        await deleteClient(clientId, conversation.workspace_id);
        console.log(`[ConvDetail] Cliente ${clientId} deletado (via contexto).`);
        selectConversation(null);
    } catch (error: any) {
        console.error(`[ConvDetail] Erro ao deletar cliente ${clientId}:`, error);
        toast.error(`Erro ao deletar cliente: ${error.message || 'Erro desconhecido'}`);
        throw error;
    }
  };

  // --- Render ---
  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecione uma conversa.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-l border-border relative">
      {/* Header */} 
      <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{conversation.client?.name?.charAt(0)?.toUpperCase() || 'C'}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold text-white">{conversation.client?.name || 'Desconhecido'}</div>
            <div className="text-xs text-muted-foreground">{conversation.client?.phone_number || 'Sem telefone'}</div>
          </div>
        </div>
        <div>
          <Button variant="ghost" size="icon" onClick={() => setIsClientSidebarOpen(true)} title="Editar Informações do Contato">
            <UserCog className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </Button>
        </div>
      </div>

      {/* Messages */} 
      <ScrollArea ref={scrollAreaRef} className="flex-grow p-4 overflow-y-auto">
        {isLoadingMessages && messages.length === 0 && <LoadingSpinner message="Carregando..." />}
        {messageError && messages.length === 0 && <ErrorMessage message={messageError} onDismiss={clearMessagesError} />}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex mb-4",
              message.sender_type === 'CLIENT' ? 'justify-start' : 'justify-end'
            )}
          >
            <div
              className={cn(
                "rounded-lg px-4 py-2 max-w-[75%] break-words",
                message.sender_type === 'CLIENT' ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'
              )}
            >
              {/* Text Content */} 
              {!message.media_url && message.content && (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
              {/* Media Content */} 
              {message.media_url && (
                <div className="mt-1"> 
                  {message.media_mime_type?.startsWith('image/') ? (
                    <img src={message.media_url} alt={message.media_filename || 'Imagem'} className="rounded-lg max-w-full h-auto max-h-60 object-contain cursor-pointer" onClick={() => window.open(message.media_url, '_blank')} loading="lazy" />
                  ) : message.media_mime_type?.startsWith('audio/') ? (
                    <audio controls src={message.media_url} className="w-full" preload="metadata"></audio>
                  ) : message.media_mime_type?.startsWith('video/') ? (
                    <video controls src={message.media_url} className="rounded-lg max-w-full h-auto max-h-60 object-contain" preload="metadata"></video>
                  ) : (
                    <a href={message.media_url} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-2 p-2 rounded-md text-sm", message.sender_type === 'CLIENT' ? "text-blue-600 dark:text-blue-400 hover:bg-black/5" : "text-primary-foreground/90 hover:bg-white/10")}>
                      <Paperclip className="h-4 w-4 flex-shrink-0" />
                      <span className="underline truncate">{message.media_filename || 'Ver Anexo'}</span>
                    </a>
                  )}
                </div>
              )}
              {/* Timestamp & Status */} 
              <div className={cn("text-xs mt-1 flex items-center", message.sender_type === 'CLIENT' ? 'text-muted-foreground/80 justify-start' : 'text-primary-foreground/80 justify-end')}>
                <span title={format(new Date(message.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}>{format(new Date(message.timestamp), 'HH:mm', { locale: ptBR })}</span>
                {message.sender_type !== 'CLIENT' && (
                  <span className="ml-2">
                    {message.status === 'PENDING' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {message.status === 'SENT' && <CheckCircle className="h-3 w-3 text-green-400" />}
                    {/* Adicionar outros status como DELIVERED, READ, FAILED_PROCESSING */} 
                    {message.status === 'FAILED' && <XCircle className="h-3 w-3 text-red-400" /> /* Tooltip pode ser adicionado no span pai se necessário */}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </ScrollArea>

      {/* Input Area */} 
      <ConversationInputArea
         conversationId={conversation.id}
         workspaceId={conversation.workspace_id}
         newMessage={newMessage}
         setNewMessage={setNewMessage}
         handleSendMessage={handleSendMessage} // Pass the send handler
         isSendingMessage={isSendingMessage}
         addMessageOptimistically={addMessageOptimistically} // Pass through for media uploads inside
         updateMessageStatus={updateMessageStatus} // Pass through for media uploads inside
         isUploading={false} // Not handled directly here anymore
         setIsUploading={() => {}} // Placeholder, upload handled inside input area
         loadingTemplates={false} // Not handled directly here anymore
         textareaRef={textareaRef}
      />
      
      {/* Sidebar de Informações do Cliente */}
      <ClientInfoSidebar 
        isOpen={isClientSidebarOpen}
        onClose={() => setIsClientSidebarOpen(false)}
        clientData={conversation.client} // Passa o objeto client inteiro
        onSave={handleSaveClient}
        onDelete={handleDeleteClient}
      />
    </div>
  );
}