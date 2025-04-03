// app/workspace/[slug]/conversations/components/ConversationDetail.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios'; // Keep for potential direct calls if needed, though context is preferred
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, Power, CheckCircle, XCircle, Loader2, PlayCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../../../../../../packages/shared-lib/src/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import type { ClientConversation, Message } from '@/app/types';
import { toast } from 'react-hot-toast';
import { useFollowUp } from '@/context/follow-up-context'; // Importar o hook do contexto

interface ConversationDetailProps {
  conversation: ClientConversation | null;
}

export default function ConversationDetail({ conversation }: ConversationDetailProps) {
  // --- Estados e Funções do Contexto ---
  const {
    selectedConversationMessages: messages,
    loadingSelectedConversationMessages: isLoadingMessages,
    selectedConversationError: messageError,
    isSendingMessage,
    isStartingSequence, // Renomeado no contexto? Vamos usar o do contexto.
    isConvertingFollowUp, // Renomeado no contexto? Vamos usar o do contexto.
    isCancellingFollowUp, // Renomeado no contexto? Vamos usar o do contexto.
    fetchConversationMessages,
    startFollowUpSequence,
    convertFollowUp,
    cancelFollowUp,
    sendManualMessage,
    addMessageOptimistically,
    updateMessageStatus,
    clearMessagesError, // Para limpar erro ao selecionar nova conversa
    // Adicione aqui outros estados/funções do contexto se necessário
  } = useFollowUp();

  // --- Estado Local ---
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null); // Ref para o elemento ScrollArea

  // --- Busca de Mensagens ---
  const loadMessages = useCallback(() => {
    if (conversation?.id) {
      clearMessagesError(); // Limpa erros anteriores ao buscar novas mensagens
      fetchConversationMessages(conversation.id);
    }
  }, [conversation?.id, fetchConversationMessages, clearMessagesError]);

  useEffect(() => {
    loadMessages();
    // Limpar input de mensagem ao trocar de conversa
    setNewMessage('');
  }, [loadMessages]); // Dependência é a função memoizada `loadMessages`

  // --- Scroll Automático ---
  useEffect(() => {
    const scrollAreaElement = scrollAreaRef.current;
    if (scrollAreaElement) {
      const viewportElement = scrollAreaElement.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
      if (viewportElement) {
        const timer = setTimeout(() => {
          // Scroll só se o usuário não estiver perto do topo (para permitir ler histórico)
          // Ajuste o valor '50' conforme necessário
          if (viewportElement.scrollHeight - viewportElement.scrollTop - viewportElement.clientHeight < 100) {
            viewportElement.scrollTo({ top: viewportElement.scrollHeight, behavior: 'smooth' });
          }
        }, 100); // Delay para renderização
        return () => clearTimeout(timer);
      }
    }
  }, [messages]); // Roda quando `messages` (do contexto) muda

  // --- Handlers de Ação ---

  const handleStartSequence = async () => {
    if (!conversation?.client_id || !conversation?.workspace_id) {
        toast.error("Informações da conversa incompletas para iniciar.");
        return;
    }
    // O loading e toasts são gerenciados pelo contexto
    try {
      await startFollowUpSequence(conversation.client_id, conversation.workspace_id);
      // Opcional: Atualizar UI localmente se necessário (ex: badge de status)
    } catch (error) {
      console.error("Erro no componente ao iniciar sequência:", error);
      // Erro já tratado pelo contexto (toast)
    }
  };

  const handleMarkConverted = async () => {
    if (!conversation?.workspace_id) {
        toast.error("Informações da conversa incompletas.");
        return;
    }
    // TODO: Precisamos do ID do FollowUp ATIVO para esta conversa.
    // Isso pode vir da própria 'conversation' (se a API /api/conversations incluir)
    // ou pode precisar de uma busca separada no contexto/API.
    // Exemplo buscando (precisaria da função no contexto):
    // const activeFollowUp = await findActiveFollowUpForClient(conversation.client_id, conversation.workspace_id);
    // if (!activeFollowUp) { toast.error("Nenhuma sequência ativa encontrada para converter."); return; }
    // const followUpId = activeFollowUp.id;

    // ---- SIMULAÇÃO ----
    const followUpId = prompt("Simulação: Para converter, digite o ID do FollowUp ATIVO para esta conversa (obtenha do DB):");
    if (!followUpId) return;
    // ---- FIM SIMULAÇÃO ----

    try {
      await convertFollowUp(followUpId, conversation.workspace_id);
      // Opcional: Atualizar UI local
    } catch (error) {
      console.error("Erro no componente ao converter:", error);
    }
  };

  const handleCancelSequence = async () => {
    if (!conversation?.workspace_id) {
         toast.error("Informações da conversa incompletas.");
         return;
    }
    if (!confirm("Tem certeza que deseja cancelar a sequência de follow-up para este cliente?")) return;

    // TODO: Obter ID do FollowUp ativo (mesma lógica do handleMarkConverted)
    // ---- SIMULAÇÃO ----
    const followUpId = prompt("Simulação: Para cancelar, digite o ID do FollowUp ATIVO para esta conversa (obtenha do DB):");
    if (!followUpId) return;
    // ---- FIM SIMULAÇÃO ----

    try {
      await cancelFollowUp(followUpId, conversation.workspace_id);
      // Opcional: Atualizar UI local
    } catch (error) {
      console.error("Erro no componente ao cancelar:", error);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !conversation?.id || !conversation?.workspace_id) return;

    const messageContent = newMessage;
    setNewMessage(''); // Limpa input

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_type: 'AI', // Assumindo envio manual como 'AI' ou 'SYSTEM'. Ajuste se necessário.
      content: messageContent,
      timestamp: new Date().toISOString(),
      metadata: { status: 'sending' }
    };

    // Adiciona otimisticamente à UI
    addMessageOptimistically(optimisticMessage);

    try {
      // Chama a função do contexto para enviar
      const finalMessage = await sendManualMessage(conversation.id, messageContent, conversation.workspace_id);
      // Atualiza a mensagem na UI com os dados finais (ID real, etc.)
      updateMessageStatus(tempId, finalMessage);
    } catch (error: any) {
      // Marca a mensagem como falha na UI
      updateMessageStatus(tempId, null, error.message);
      console.error("Erro no componente ao enviar mensagem:", error);
      // O toast de erro já é mostrado pelo contexto
    }
  };

  // --- Renderização ---

  // Caso Nenhuma Conversa Selecionada
  if (!conversation) {
    return (
      <div className="flex-grow flex items-center justify-center text-muted-foreground p-6 h-full">
        Selecione uma conversa à esquerda para ver os detalhes e mensagens.
      </div>
    );
  }

  // Preparação de Dados para Renderização
  const clientName = conversation.client?.name || conversation.client?.phone_number || 'Cliente Desconhecido';
  const isConversationActive = conversation.status === 'ACTIVE'; // Assumindo 'ACTIVE' como string ou Enum
  // TODO: Determinar se uma sequência está ativa para habilitar/desabilitar botões Convert/Cancel
  const isSequenceActive = true; // Placeholder - Substituir pela lógica real

  // Determina se algum botão de ação principal está carregando
  const isActionLoading = isStartingSequence || isConvertingFollowUp || isCancellingFollowUp;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header da Conversa */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <Avatar className="h-9 w-9 md:h-10 md:w-10 border flex-shrink-0">
            {/* <AvatarImage src={conversation.client?.avatarUrl} /> */}
            <AvatarFallback className="bg-muted text-muted-foreground text-sm">
               {clientName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="overflow-hidden">
            <h2 className="font-semibold text-foreground truncate text-sm md:text-base">{clientName}</h2>
            <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-2">
               {conversation.channel && <span>{conversation.channel}</span>}
               {conversation.channel && <span>•</span>}
               <span>{isConversationActive ? 'Ativa' : 'Fechada'}</span>
               {conversation.is_ai_active && (
                 <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/50 text-green-400">
                   IA Ativa
                 </Badge>
               )}
             </div>
          </div>
        </div>
        {/* Botões de Ação */}
        <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
            {/* TODO: Habilitar/desabilitar 'Iniciar' baseado se já existe sequência ativa */}
            <Button size="sm" variant="outline" onClick={handleStartSequence} title="Iniciar Sequência de Follow-up" disabled={isActionLoading}>
                {isStartingSequence ? <Loader2 className="h-4 w-4 animate-spin"/> : <PlayCircle className="h-4 w-4" />}
                <span className="hidden sm:inline ml-1.5">Iniciar</span>
            </Button>
            {/* TODO: Habilitar 'Convertido' e 'Cancelar' apenas se isSequenceActive for true */}
            <Button size="sm" variant="outline" onClick={handleMarkConverted} title="Marcar como Convertido" disabled={isActionLoading || !isSequenceActive}>
                {isConvertingFollowUp ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle className="h-4 w-4 text-green-500" />}
                <span className="hidden sm:inline ml-1.5">Convertido</span>
            </Button>
             <Button
                 size="sm" variant="outline"
                 className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                 onClick={handleCancelSequence} title="Cancelar Sequência Ativa" disabled={isActionLoading || !isSequenceActive}
             >
                {isCancellingFollowUp ? <Loader2 className="h-4 w-4 animate-spin"/> : <XCircle className="h-4 w-4"/>}
                <span className="hidden sm:inline ml-1.5">Cancelar</span>
             </Button>
        </div>
      </div>

      {/* Área de Mensagens */}
      <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
        {isLoadingMessages && !messages.length && ( // Só mostra loading se não tiver mensagens ainda
            <div className="flex justify-center items-center h-32">
                <LoadingSpinner message="Carregando histórico..." size="small" />
            </div>
        )}
        {messageError && <ErrorMessage message={messageError} onDismiss={clearMessagesError} />}

        <div className="space-y-4 pb-4"> {/* Padding no final para espaço */}
          {messages.map((msg) => (
            <div
              key={msg.id} // Usa ID real ou temporário
              className={cn(
                'flex items-end gap-2 max-w-[85%] sm:max-w-[75%]', // Ajuste de largura
                msg.sender_type === 'CLIENT' ? 'justify-start' : 'ml-auto flex-row-reverse'
              )}
            >
              {/* Avatar condicional (pode remover se ficar muito poluído) */}
              {/* <Avatar className="h-6 w-6 border flex-shrink-0">...</Avatar> */}
              <div
                className={cn(
                  'p-2 px-3 rounded-lg text-sm relative group shadow-sm', // Sombra sutil
                  msg.sender_type === 'CLIENT'
                    ? 'bg-muted text-foreground rounded-bl-none'
                    : 'bg-primary text-primary-foreground rounded-br-none',
                   msg.metadata?.status === 'sending' ? 'opacity-60 italic' : '', // Feedback envio
                   msg.metadata?.status === 'failed' ? 'bg-destructive/90 text-destructive-foreground border border-destructive' : '', // Feedback erro
                )}
              >
                {/* Ícone de erro */}
                 {msg.metadata?.status === 'failed' && (
                     <span className="absolute -top-1.5 -right-1.5 text-red-400" title={msg.metadata.error || 'Falha ao enviar'}>
                         <XCircle size={14} />
                     </span>
                 )}
                 {/* Conteúdo da Mensagem */}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                 {/* Timestamp (apenas hora, tooltip com data completa) */}
                <div className="text-xs opacity-70 mt-1 text-right">
                   <span title={format(new Date(msg.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}>
                     {format(new Date(msg.timestamp), 'HH:mm')}
                   </span>
                 </div>
              </div>
            </div>
          ))}
          {/* Indicador de loading se estiver carregando MAIS mensagens */}
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
            placeholder="Digite para responder manualmente..."
            className="flex-grow resize-none bg-background border-input min-h-[40px] max-h-[150px] text-sm py-2 px-3 rounded-lg" // Estilo mais alinhado
            rows={1}
            disabled={isSendingMessage || !isConversationActive} // Desabilita se enviando ou conversa fechada
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isSendingMessage) {
                    e.preventDefault();
                    handleSendMessage();
                }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="flex-shrink-0" // Garante que o botão não encolha
            disabled={!newMessage.trim() || isSendingMessage || !isConversationActive}
            aria-label="Enviar mensagem"
          >
             {isSendingMessage ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        {!isConversationActive && (
            <p className="text-xs text-destructive text-center mt-1.5">A conversa está fechada. Não é possível enviar novas mensagens.</p>
        )}
      </div>
    </div>
  );
}