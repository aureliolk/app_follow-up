// apps/next-app/app/workspace/[slug]/conversations/components/ConversationDetail.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
// Removido axios pois as chamadas são feitas pelo contexto
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Bot,
  User,
  CheckCircle,
  XCircle,
  Loader2,
  PlayCircle,
  PauseCircle // Importar ícone PauseCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../../../../../../packages/shared-lib/src/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import type { Message } from '@/app/types'; // Importar apenas Message, ClientConversation vem do contexto
import { toast } from 'react-hot-toast';
import { useFollowUp } from '@/context/follow-up-context'; // Importar o hook do contexto

// Remover a interface de Props, pois não recebe mais a conversa via prop
// interface ConversationDetailProps {
//   conversation: ClientConversation | null;
// }

// Remover o parâmetro de props da função
export default function ConversationDetail() {

  // --- Obter tudo do Contexto ---
  const {
    selectedConversation: conversation, // Renomeia para 'conversation' localmente
    selectedConversationMessages: messages,
    loadingSelectedConversationMessages: isLoadingMessages,
    selectedConversationError: messageError,
    isSendingMessage,
    // isStartingSequence, // Remover se não houver mais botão Iniciar explícito
    isPausingFollowUp,
    isResumingFollowUp,
    isConvertingFollowUp,
    isCancellingFollowUp,
    // fetchConversationMessages, // Chamado pelo contexto ao selecionar
    // startFollowUpSequence, // Remover se não houver mais botão Iniciar explícito
    pauseFollowUp, // Função para pausar
    resumeFollowUp, // Função para retomar
    convertFollowUp,
    cancelFollowUp,
    sendManualMessage,
    addMessageOptimistically,
    updateMessageStatus,
    clearMessagesError,
  } = useFollowUp();

  // --- Estado Local ---
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null); // Ref para o elemento ScrollArea

  // --- Scroll Automático ---
  useEffect(() => {
    const scrollAreaElement = scrollAreaRef.current;
    if (scrollAreaElement) {
      const viewportElement = scrollAreaElement.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
      if (viewportElement) {
        const timer = setTimeout(() => {
          // Scroll mais inteligente: só scrolla se já estiver perto do fim
          const isScrolledToBottom = viewportElement.scrollHeight - viewportElement.scrollTop - viewportElement.clientHeight < 150; // Tolerância
          if (isScrolledToBottom) {
            viewportElement.scrollTo({ top: viewportElement.scrollHeight, behavior: 'smooth' });
          }
        }, 150); // Aumentar um pouco o delay pode ajudar
        return () => clearTimeout(timer);
      }
    }
  }, [messages]); // Depende das mensagens do contexto

  // --- Handlers de Ação ---

  const handlePause = async () => {
    if (!conversation?.activeFollowUp?.id || !conversation?.workspace_id) {
      toast.error("Não é possível pausar: sequência não encontrada ou informações incompletas.");
      return;
    }
    try {
      await pauseFollowUp(conversation.activeFollowUp.id, conversation.workspace_id);
      // O contexto deve atualizar o estado de selectedConversation se a chamada for bem-sucedida
    } catch (error) {
      console.error("Erro no componente ao pausar:", error);
    }
  };

  const handleResume = async () => {
    if (!conversation?.activeFollowUp?.id || !conversation?.workspace_id) {
      toast.error("Não é possível retomar: sequência não encontrada ou informações incompletas.");
      return;
    }
    try {
      await resumeFollowUp(conversation.activeFollowUp.id, conversation.workspace_id);
      // O contexto deve atualizar o estado de selectedConversation
    } catch (error) {
      console.error("Erro no componente ao retomar:", error);
    }
  };

  const handleMarkConverted = async () => {
    if (!conversation?.activeFollowUp?.id || !conversation?.workspace_id) {
      toast.error("Nenhuma sequência ativa/pausada para converter.");
      return;
    }
    const followUpId = conversation.activeFollowUp.id;
    try {
      await convertFollowUp(followUpId, conversation.workspace_id);
      // Contexto/Página devem lidar com a remoção da conversa da lista
    } catch (error) {
      console.error("Erro no componente ao converter:", error);
    }
  };

  const handleCancelSequence = async () => {
    if (!conversation?.activeFollowUp?.id || !conversation?.workspace_id) {
      toast.error("Nenhuma sequência ativa/pausada para cancelar.");
      return;
    }
    if (!confirm("Tem certeza que deseja cancelar esta sequência de follow-up?")) return;
    const followUpId = conversation.activeFollowUp.id;
    try {
      await cancelFollowUp(followUpId, conversation.workspace_id);
      // Contexto/Página devem lidar com a remoção da conversa da lista
    } catch (error) {
      console.error("Erro no componente ao cancelar:", error);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !conversation?.id || !conversation?.workspace_id) return;

    const messageContent = newMessage;
    setNewMessage('');

    const tempId = `temp-${Date.now()}`;
    // Define o tipo do remetente manual (pode ser 'AI' se o operador age como IA, ou 'SYSTEM')
    const senderTypeManual: Message['sender_type'] = 'AI'; // Ou 'SYSTEM'

    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_type: senderTypeManual,
      content: messageContent,
      timestamp: new Date().toISOString(), // Data atual como string ISO
      metadata: { status: 'sending' }
    };

    addMessageOptimistically(optimisticMessage);

    try {
      const finalMessage = await sendManualMessage(conversation.id, messageContent, conversation.workspace_id);
      updateMessageStatus(tempId, finalMessage); // Atualiza com a msg real da API
    } catch (error: any) {
      updateMessageStatus(tempId, null, error.message); // Marca como falha
      console.error("Erro no componente ao enviar mensagem:", error);
    }
  };

  // --- Renderização ---

  if (!conversation) {
    return (
      <div className="flex-grow flex items-center justify-center text-muted-foreground p-6 h-full">
        Selecione uma conversa à esquerda para ver os detalhes e mensagens.
      </div>
    );
  }

  // Preparação de Dados
  const clientName = conversation.client?.name || conversation.client?.phone_number || 'Cliente Desconhecido';
  const isConversationCurrentlyActive = conversation.status === 'ACTIVE'; // Usando string 'ACTIVE' ou ConversationStatus.ACTIVE
  const followUpStatus = conversation.activeFollowUp?.status; // Status do follow-up (pode ser string ou Enum)

  // Lógica dos Botões
  const showPauseButton = followUpStatus === 'ACTIVE';
  const showResumeButton = followUpStatus === 'PAUSED';
  const followUpExistsAndIsActionable = !!conversation?.activeFollowUp && (conversation.activeFollowUp.status === 'ACTIVE' || conversation.activeFollowUp.status === 'PAUSED');
 

  // Loader geral para ações que mudam o status do FollowUp
  const isStatusActionLoading = isPausingFollowUp || isResumingFollowUp || isConvertingFollowUp || isCancellingFollowUp;


  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header da Conversa */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <Avatar className="h-9 w-9 md:h-10 md:w-10 border flex-shrink-0">
            <AvatarFallback className="bg-muted text-muted-foreground text-sm">
              {clientName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="overflow-hidden">
            <h2 className="font-semibold text-foreground truncate text-sm md:text-base">{clientName}</h2>
            <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-2">
              {conversation.channel && <span>{conversation.channel}</span>}
              {conversation.channel && <span>•</span>}
              <span>{isConversationCurrentlyActive ? 'Ativa' : 'Fechada'}</span>
              {/* Badge de Status do FollowUp */}
              {followUpStatus && (
                <Badge variant={showPauseButton ? "default" : "secondary"}
                  className={cn("ml-2 text-[10px] px-1.5 py-0",
                    showPauseButton ? "bg-blue-600/20 border-blue-500/50 text-blue-300" :
                      showResumeButton ? "bg-yellow-600/20 border-yellow-500/50 text-yellow-300" :
                        "bg-gray-600/20 border-gray-500/50 text-gray-300" // Outros status
                  )}>
                  Seq: {followUpStatus}
                </Badge>
              )}
              {conversation.is_ai_active && (
                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 border-green-500/50 text-green-400">
                  IA Ativa
                </Badge>
              )}
            </div>
          </div>
        </div>
        {/* Botões de Ação */}
        <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
          {showPauseButton && (
            <Button size="sm" variant="outline" onClick={handlePause} title="Pausar Sequência" disabled={isStatusActionLoading}>
              {isPausingFollowUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1.5">Pausar</span>
            </Button>
          )}
          {showResumeButton && (
            <Button size="sm" variant="outline" onClick={handleResume} title="Retomar Sequência" disabled={isStatusActionLoading}>
              {isResumingFollowUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1.5">Retomar</span>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleMarkConverted} title="Marcar Convertido" disabled={isStatusActionLoading || !followUpExistsAndIsActionable}>
            {isConvertingFollowUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 text-green-500" />}
            <span className="hidden sm:inline ml-1.5">Convertido</span>
          </Button>
          <Button
            size="sm" variant="outline"
            className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleCancelSequence} title="Cancelar Sequência" disabled={isStatusActionLoading || !followUpExistsAndIsActionable}
          >
            {isCancellingFollowUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            <span className="hidden sm:inline ml-1.5">Cancelar</span>
          </Button>
        </div>
      </div>

      {/* Área de Mensagens */}
      <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
        {isLoadingMessages && !messages.length && (
          <div className="flex justify-center items-center h-32">
            <LoadingSpinner message="Carregando histórico..." size="small" />
          </div>
        )}
        {messageError && <ErrorMessage message={messageError} onDismiss={clearMessagesError} />}

        <div className="space-y-4 pb-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex items-end gap-2 max-w-[85%] sm:max-w-[75%]',
                msg.sender_type === 'CLIENT' ? 'justify-start' : 'ml-auto flex-row-reverse'
              )}
            >
              <div
                className={cn(
                  'p-2 px-3 rounded-lg text-sm relative group shadow-sm',
                  msg.sender_type === 'CLIENT'
                    ? 'bg-muted text-foreground rounded-bl-none'
                    : 'bg-primary text-primary-foreground rounded-br-none',
                  msg.metadata?.status === 'sending' ? 'opacity-60 italic' : '',
                  msg.metadata?.status === 'failed' ? 'bg-destructive/90 text-destructive-foreground border border-destructive' : '',
                )}
              >
                {msg.metadata?.status === 'failed' && (
                  <span className="absolute -top-1.5 -right-1.5 text-red-400" title={msg.metadata.error || 'Falha ao enviar'}>
                    <XCircle size={14} />
                  </span>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <div className="text-xs opacity-70 mt-1 text-right">
                  <span title={format(new Date(msg.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}>
                    {format(new Date(msg.timestamp), 'HH:mm')}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {isLoadingMessages && messages.length > 0 && (
            <div className="flex justify-center items-center pt-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input de Mensagem */}
      <div className="p-3 md:p-4 border-t border-border bg-card/30 dark:bg-background flex-shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isConversationCurrentlyActive ? "Responder manualmente..." : "A conversa está fechada."}
            className="flex-grow resize-none bg-background border-input min-h-[40px] max-h-[150px] text-sm py-2 px-3 rounded-lg"
            rows={1}
            disabled={isSendingMessage || !isConversationCurrentlyActive}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isSendingMessage && isConversationCurrentlyActive) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="flex-shrink-0"
            disabled={!newMessage.trim() || isSendingMessage || !isConversationCurrentlyActive}
            aria-label="Enviar mensagem"
          >
            {isSendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        {!isConversationCurrentlyActive && (
          <p className="text-xs text-muted-foreground text-center mt-1.5">Reative a conversa ou aguarde o cliente para enviar novas mensagens.</p>
        )}
      </div>
    </div>
  );
}