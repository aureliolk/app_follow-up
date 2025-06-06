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
  Check,
  CheckCheck,
  Bot,
  Play,
  Pause,
  PlayCircle,
  PauseCircle,
  Star,
  CircleOff,
  CheckSquare,
  Lock,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import type { Message, ClientConversation, ActiveFollowUpInfo } from '@/app/types';
import { toast } from 'react-hot-toast';
import { useConversationContext } from '@/context/ConversationContext';
import { useClient } from '@/context/client-context';
import ConversationInputArea from './ConversationInputArea';
import ClientInfoSidebar from './ClientInfoSidebar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const getFollowUpStatusDisplay = (status: string | undefined | null): {
  text: string;
  Icon: React.ElementType;
  colorClass: string;
  tooltip: string;
} | null => {
  if (!status) return null;

  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return { text: "Follow-up Ativo", Icon: PlayCircle, colorClass: "text-green-600 dark:text-green-500", tooltip: "Sequência de follow-up automático está ativa." };
    case 'PAUSED':
      return { text: "Follow-up Pausado", Icon: PauseCircle, colorClass: "text-yellow-600 dark:text-yellow-500", tooltip: "Sequência de follow-up está pausada." };
    case 'CONVERTED':
      return { text: "Convertido", Icon: Star, colorClass: "text-blue-600 dark:text-blue-500", tooltip: "Cliente atingiu o objetivo do follow-up." };
    case 'CANCELLED':
      return { text: "Cancelado", Icon: CircleOff, colorClass: "text-red-600 dark:text-red-500", tooltip: "Sequência de follow-up foi cancelada." };
    case 'COMPLETED':
      return { text: "Concluído", Icon: CheckSquare, colorClass: "text-gray-500 dark:text-gray-400", tooltip: "Sequência de follow-up foi concluída." };
    default:
        console.warn(`[ConvDetail] Status de follow-up desconhecido recebido: ${status}`);
        return null;
  }
};

export default function ConversationDetail() {

  // --- Context ---
  const {
    selectedConversation: conversation,
    selectedConversationMessages: messages,
    loadingSelectedConversationMessages: isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    selectedConversationError: messageError,
    isSendingMessage,
    clearMessagesError,
    selectConversation,
    sendMediaMessage,
    sendTemplateMessage,
    loadMoreMessages,
    toggleAIStatus,
    isTogglingAIStatus,
    loadMoreConversations,
    totalCountAll,
    totalCountHuman,
    totalCountAi,
    removeConversationByClientId,
  } = useConversationContext();
  const { updateClient, deleteClient } = useClient();

  // --- Local State ---
  const scrollAreaRef = useRef<HTMLDivElement>(null);
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

  // --- Send Handler (Simplified - Logic moved to input area) ---
  // const handleSendMessage = async (e?: React.FormEvent) => {
  //    // Logic moved to ConversationInputArea component
  // };

  // --- Client Sidebar Handlers ---
  const handleSaveClient = async (clientId: string, updatedData: { name?: string | null; phone_number?: string | null; metadata?: any }) => {
    try {
        const updatedClientResponse = await updateClient(clientId, updatedData); 

        if (conversation) { 
          const newConversationData: ClientConversation = {
            ...conversation, 
            client: updatedClientResponse 
          };
          selectConversation(newConversationData);
        }

    } catch (error: any) {
        console.error(`[ConvDetail] Erro ao salvar cliente ${clientId}:`, error);
        toast.error(`Erro ao salvar cliente: ${error.message || 'Erro desconhecido'}`);
        throw error; 
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    try {
        if (!conversation?.workspace_id) {
            throw new Error("Workspace ID não encontrado para deletar cliente.");
        }
        await deleteClient(clientId, conversation.workspace_id);
        toast.success("Cliente excluído com sucesso.");
        
        removeConversationByClientId(clientId);

        selectConversation(null);

    } catch (error: any) {
        console.error(`[ConvDetail] Erro ao deletar cliente ${clientId}:`, error);
        toast.error(`Erro ao deletar cliente: ${error.message || 'Erro desconhecido'}`);
        throw error;
    }
  };

  // --- Handler for AI Toggle ---
  const handleToggleAI = async () => {
    if (!conversation || !conversation.id || isTogglingAIStatus) return;

    try {
      await toggleAIStatus(conversation.id, !!conversation.is_ai_active);
      // Toast de sucesso já é mostrado no contexto
    } catch (error) {
      // Toast de erro já é mostrado no contexto
      console.error("[ConvDetail] Erro ao alternar status da IA (tratado no contexto):", error);
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

  // Determinar estado da IA para o botão
  const isAIActive = conversation.is_ai_active;
  const followUpDisplay = getFollowUpStatusDisplay(conversation.activeFollowUp?.status);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border relative">
      {/* Header */}
      <div className="flex items-center justify-between p-[12px] border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-3 flex-grow min-w-0">
          <Avatar className="h-9 w-9 flex-shrink-0">
            <AvatarFallback>{conversation.client?.name?.charAt(0)?.toUpperCase() || 'C'}</AvatarFallback>
          </Avatar>
          <div className="flex-grow min-w-0">
            <div className="font-semibold truncate dark:text-white" title={conversation.client?.name || 'Desconhecido'}>
              {conversation.client?.name || 'Desconhecido'}
            </div>
            <div className="flex items-center space-x-2 mt-0.5">
                <div className="text-xs text-muted-foreground truncate" title={conversation.client?.phone_number || 'Sem telefone'}>{conversation.client?.phone_number || 'Sem telefone'}</div>
                {followUpDisplay && (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                         <span className={cn("inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full", followUpDisplay.colorClass)}>
                           <followUpDisplay.Icon className="h-3 w-3 mr-1" />
                           {followUpDisplay.text}
                         </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{followUpDisplay.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleAI}
                  disabled={isTogglingAIStatus}
                  title={isAIActive ? "Pausar IA" : "Iniciar IA"}
                >
                  {isTogglingAIStatus ? (
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                  ) : isAIActive ? (
                    <Pause className="h-5 w-5 text-green-500" />
                  ) : (
                    <Play className="h-5 w-5 text-red-500" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{isAIActive ? "IA está ativa" : "IA está pausada"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setIsClientSidebarOpen(true)} title="Editar Informações do Contato">
                  <UserCog className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Ver/Editar Informações do Cliente</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-grow p-4 overflow-y-auto">
        {hasMoreMessages && (
          <div className="flex justify-center mb-2">
            <Button variant="ghost" size="sm" onClick={loadMoreMessages} disabled={isLoadingMoreMessages}>
              {isLoadingMoreMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Carregar mais'}
            </Button>
          </div>
        )}
        {isLoadingMessages && messages.length === 0 && <LoadingSpinner message="Carregando..." />}
        {messageError && messages.length === 0 && <ErrorMessage message={messageError} onDismiss={clearMessagesError} />}
        {messages.map((message) => {
          return (
            <div
              key={message.id}
              className={cn(
                "flex mb-4",
                message.sender_type === 'CLIENT' ? 'justify-start' : 'justify-end',
                message.privates_notes && 'justify-end'
              )}
            >
              <div
                className={cn(
                  "rounded-lg px-4 py-2 max-w-[75%] break-words",
                  !message.privates_notes && (message.sender_type === 'CLIENT' ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'),
                  message.privates_notes && 'bg-yellow-500/20 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-400 border border-yellow-500/30 dark:border-yellow-500/20',
                )}
              >
                {/* Text Content */} 
                {!message.media_url && message.content && (
                  <p className={cn("whitespace-pre-wrap text-sm", message.privates_notes && 'text-yellow-800 dark:text-yellow-400')}>{message.content}</p>
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
                      <a href={message.media_url} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-2 p-2 rounded-md text-sm", message.sender_type === 'CLIENT' ? "text-blue-600 dark:text-blue-400 hover:bg-black/5" : "text-primary-foreground/90 hover:bg-white/10", message.privates_notes && 'text-yellow-800 dark:text-yellow-400 hover:bg-transparent')}>
                        <Paperclip className="h-4 w-4 flex-shrink-0" />
                        <span className="underline truncate">{message.media_filename || 'Ver Anexo'}</span>
                      </a>
                    )}
                  </div>
                )}
                {/* Timestamp & Status */} 
                <div className={cn("text-[10px] mt-1 flex items-center", 
                   message.sender_type === 'CLIENT' ? 'text-muted-foreground/80 justify-start' : 'text-primary-foreground/80 justify-end',
                   message.privates_notes && 'text-yellow-800/80 dark:text-yellow-400/80 justify-start flex-row-reverse'
                )}>
                  <span title={format(new Date(message.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}>{format(new Date(message.timestamp), 'HH:mm', { locale: ptBR })}</span>
                  {message.sender_type !== 'CLIENT' && !message.privates_notes && (
                    <span className="ml-2 inline-flex items-center" title={`Status: ${message.status}`}>
                      {message.status === 'PENDING' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {message.status === 'SENT' && <Check className="h-3 w-3 text-primary-foreground/70" />}
                      {message.status === 'DELIVERED' && <CheckCheck className="h-4 w-4 text-primary-foreground/70" />}
                      {message.status === 'READ' && <CheckCheck className="h-3 w-3 text-blue-400" />}
                      {message.status === 'FAILED' && <XCircle className="h-4 w-4 text-red-400" />}
                    </span>
                  )}
                  {message.privates_notes && (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Lock className="h-3.5 w-3.5 ml-2 text-yellow-800/80 dark:text-yellow-400/80" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Nota Privada</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                   )}
                </div>
              </div>
            </div>
          );
        })}
      </ScrollArea>

      {/* Input Area */}
      <ConversationInputArea
         conversationId={conversation.id}
         workspaceId={conversation.workspace_id}
         isSendingMessage={isSendingMessage}
         isUploading={false}
         setIsUploading={() => {}}
         loadingTemplates={false}
         textareaRef={textareaRef}
         sendMediaMessage={sendMediaMessage}
         sendTemplateMessage={sendTemplateMessage}
      />
      
      {/* Sidebar de Informações do Cliente */}
      <ClientInfoSidebar 
        isOpen={isClientSidebarOpen}
        onClose={() => setIsClientSidebarOpen(false)}
        clientData={conversation.client ? {
            ...conversation.client,
            workspace_id: conversation.workspace_id
        } : undefined}
        onSave={handleSaveClient}
        onDelete={handleDeleteClient}
      />
    </div>
  );
}