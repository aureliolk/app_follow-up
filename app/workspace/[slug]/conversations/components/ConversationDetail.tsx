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
  PauseCircle,
  Smile,
  Paperclip,
  Mic,
  Quote,
  PenLine
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import type { Message } from '@/app/types'; // Importar apenas Message, ClientConversation vem do contexto
import { toast } from 'react-hot-toast';
import { useFollowUp } from '@/context/follow-up-context'; // Importar o hook do contexto
// <<< Importar Popover e EmojiPicker >>>
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import EmojiPicker, { EmojiClickData, Theme, Categories } from 'emoji-picker-react';

// Remover a interface de Props, pois não recebe mais a conversa via prop
// interface ConversationDetailProps {
//   conversation: ClientConversation | null;
// }

// Remover o parâmetro de props da função
export default function ConversationDetail() {
  // <<< LOG DE RENDERIZAÇÃO >>>
  console.log('[ConvDetail LIFECYCLE] Rendering/Mounting...');

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
    addRealtimeMessage,
    updateRealtimeMessageContent, // <<< OBTER A NOVA FUNÇÃO
  } = useFollowUp();

  // --- Estado Local ---
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const prevIsSendingMessage = useRef(isSendingMessage);

  // --- Scroll Automático REFINADO ---
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scrollAreaElement = scrollAreaRef.current;
    if (scrollAreaElement) {
      const viewportElement = scrollAreaElement.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]');
      if (viewportElement) {
        viewportElement.scrollTo({ top: viewportElement.scrollHeight, behavior });
        console.log(`[ConvDetail Scroll] Rolando para o fim (behavior: ${behavior})`);
      }
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0 && !isLoadingMessages) {
       const timer = setTimeout(() => {
         console.log('[ConvDetail Scroll] Mensagens carregadas, rolando para o fim (instantâneo).');
         scrollToBottom('auto');
       }, 150);
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
           console.log('[ConvDetail Scroll] Nova mensagem adicionada, rolando suavemente para o fim.');
           scrollToBottom('smooth');
        }
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, scrollToBottom]);

  // --- <<< NOVO EFFECT PARA SSE >>> ---
  useEffect(() => {
    // <<< Adicionar Set para rastrear IDs processados >>>
    const processedMessageIds = new Set<string>();

    if (eventSourceRef.current) {
      console.log(`[ConvDetail SSE] Fechando conexão SSE anterior.`);
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (conversation?.id) {
      const conversationId = conversation.id;
      console.log(`[ConvDetail SSE] Iniciando conexão SSE para conversa: ${conversationId}`);

      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 2000; // 2 segundos

      const connectSSE = () => {
        const newEventSource = new EventSource(`/api/conversations/${conversationId}/events`);
        eventSourceRef.current = newEventSource;

        newEventSource.addEventListener('connection_ready', (event) => {
          console.log("[ConvDetail SSE] Conexão estabelecida com sucesso:", event.data);
          retryCount = 0; // Reset retry count on successful connection
        });

        // Ouvir eventos específicos
        newEventSource.addEventListener('new_message', (event) => {
          try {
            const messageData = JSON.parse(event.data);
            // <<< VERIFICAR DUPLICIDADE ANTES DE PROCESSAR >>>
            if (!messageData.id || processedMessageIds.has(messageData.id)) {
                 console.warn(`[ConvDetail SSE] Ignorando mensagem duplicada ou inválida: ID ${messageData.id}`);
                 return; // Ignora se não tem ID ou já foi processado
            }
            processedMessageIds.add(messageData.id); // Marca como processado
            // Limpar IDs antigos do Set periodicamente para evitar consumo de memória (opcional)
            if (processedMessageIds.size > 50) {
                 const oldestId = processedMessageIds.values().next().value;
                 processedMessageIds.delete(oldestId);
            }

            console.log(`[ConvDetail SSE] Nova mensagem recebida:`, messageData);
            addRealtimeMessage(messageData);
          } catch (error) {
            console.error("[ConvDetail SSE] Erro ao parsear mensagem SSE:", error, "\nData:", event.data);
          }
        });

        // Ouvir atualizações de conteúdo de mensagem (ex: quando mídia é processada)
        newEventSource.addEventListener('message_content_updated', (event) => {
          try {
            const messageData = JSON.parse(event.data);
             // <<< VERIFICAR DUPLICIDADE AQUI TAMBÉM? (se aplicável) >>>
             // Se a atualização puder chegar múltiplas vezes, adicione lógica similar com processedMessageIds
            console.log(`[ConvDetail SSE] Atualização de conteúdo recebida:`, messageData);
            updateRealtimeMessageContent(
              messageData.id,
              messageData.content,
              messageData.metadata
            );
          } catch (error) {
            console.error("[ConvDetail SSE] Erro ao parsear atualização SSE:", error, "\nData:", event.data);
          }
        });

        newEventSource.addEventListener('error', (error) => {
          console.error("[ConvDetail SSE] Erro na conexão EventSource:", error);
          
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`[ConvDetail SSE] Tentativa ${retryCount} de ${maxRetries}. Reconectando em ${retryDelay}ms...`);
            
            // Fechar conexão atual
            newEventSource.close();
            eventSourceRef.current = null;
            
            // Tentar reconectar após delay
            setTimeout(connectSSE, retryDelay);
          } else {
            console.error(`[ConvDetail SSE] Máximo de tentativas (${maxRetries}) atingido.`);
            toast.error('Erro na conexão em tempo real. Por favor, recarregue a página.');
          }
        });
      };

      // Iniciar conexão
      connectSSE();
    }

    return () => {
      if (eventSourceRef.current) {
        console.log(`[ConvDetail SSE] Limpeza: Fechando conexão SSE.`);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [conversation?.id, addRealtimeMessage, updateRealtimeMessageContent]); // <<< Adicionar updateRealtimeMessageContent como dependencia

  // <<< NOVO EFFECT PARA DEVOLVER O FOCO >>>
  useEffect(() => {
    // Foca apenas quando isSendingMessage mudou de true para false
    if (prevIsSendingMessage.current === true && isSendingMessage === false) {
      console.log("[ConvDetail Focus] Send finished. Attempting to focus textarea.");
      textareaRef.current?.focus();
    }
    // Atualiza o valor anterior para a próxima renderização
    prevIsSendingMessage.current = isSendingMessage;
  }, [isSendingMessage]); // Depende do estado isSendingMessage

  // <<< NOVA FUNÇÃO PARA LIDAR COM CLIQUE NO EMOJI >>>
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage(prevMessage => prevMessage + emojiData.emoji);
    setShowEmojiPicker(false);
    // Devolver foco ao textarea após selecionar emoji
    textareaRef.current?.focus(); 
  };

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
            <LoadingSpinner message="Carregando histórico... asda"  />
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
                {/* Renderização de Mídia ou Texto CORRIGIDA */}
                {/* Verifica se é mídia (tem messageType E NÃO é 'text') */}
                {(msg.metadata as any)?.messageType && (msg.metadata as any)?.messageType !== 'text' ? (
                  // É uma mensagem de mídia (imagem, video, audio, doc, sticker)
                  <div className="relative min-h-[100px] min-w-[200px] flex items-center justify-center">
                    
                    {/* Estado de Loading (USA LoadingSpinner) */}
                    {!(msg.metadata as any)?.uploadedToS3 && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 backdrop-blur-sm rounded-md z-10 p-2">
                        <LoadingSpinner 
                          size="small" 
                          message={`Processando ${(msg.metadata as any)?.messageType}...`} 
                        />
                      </div>
                    )}

                    {/* Conteúdo da Mídia Final */}
                    <div className={cn(
                      "w-full transition-opacity duration-300", // Suaviza a aparição
                      (msg.metadata as any)?.uploadedToS3 ? "opacity-100" : "opacity-0" // Controla visibilidade
                    )}>
                      {/* Imagem */}
                      {(msg.metadata as any)?.messageType === 'image' && (
                        <a 
                          href={msg.content || '#'} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="block max-w-xs"
                          style={{ display: (msg.metadata as any)?.uploadedToS3 ? 'block' : 'none' }}
                        >
                          <img 
                            src={msg.content || ''}
                            alt="Imagem enviada"
                            className="rounded-md object-cover w-full h-auto max-h-60"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        </a>
                      )}
                      {/* Vídeo */}
                      {(msg.metadata as any)?.messageType === 'video' && (
                        <video 
                          controls 
                          src={msg.content || ''} 
                          className="rounded-md w-full max-w-xs"
                          style={{ display: (msg.metadata as any)?.uploadedToS3 ? 'block' : 'none' }}
                        >
                          Seu navegador não suporta o elemento de vídeo.
                        </video>
                      )}
                      {/* Áudio */}
                      {(msg.metadata as any)?.messageType === 'audio' && (
                        <audio 
                          controls 
                          src={msg.content || ''}
                          className="w-full max-w-xs"
                          style={{ display: (msg.metadata as any)?.uploadedToS3 ? 'block' : 'none' }}
                        >
                          Seu navegador não suporta o elemento de áudio.
                        </audio>
                      )}
                      {/* Documento */}
                      {(msg.metadata as any)?.messageType === 'document' && (
                        <a 
                          href={msg.content || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "text-blue-400 hover:text-blue-300 hover:underline break-all",
                             // Desabilita link se não estiver carregado
                            !(msg.metadata as any)?.uploadedToS3 && "pointer-events-none opacity-50"
                          )}
                          style={{ display: 'block' }} // Link sempre visível, mas desabilitado
                        >
                          {`${(msg.metadata as any)?.whatsappMessage?.document?.filename || 'Documento'}`}
                        </a>
                      )}
                      {/* Sticker */}
                      {(msg.metadata as any)?.messageType === 'sticker' && (
                        <img 
                          src={msg.content || ''}
                          alt="Sticker enviado"
                          className="max-w-[120px] max-h-[120px] object-contain"
                          style={{ display: (msg.metadata as any)?.uploadedToS3 ? 'block' : 'none' }}
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  // É uma mensagem de texto normal (ou mídia com tipo 'text')
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                )}
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
        {/* <<< BARRA DE FERRAMENTAS COM POPOVER DE EMOJI >>> */}
        <div className="flex items-center gap-1 mb-2">
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Emoji">
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-none shadow-none bg-background"
              style={{
                '--epr-hover-bg-color': 'hsl(var(--accent))' as React.CSSProperties['color'],
                '--epr-focus-bg-color': 'hsl(var(--accent))' as React.CSSProperties['color'],
                '--epr-search-input-bg-color': 'hsl(var(--input))' as React.CSSProperties['color'],
                '--epr-category-label-bg-color': 'hsl(var(--background))' as React.CSSProperties['color'],
                '--epr-bg-color': 'hsl(var(--background))' as React.CSSProperties['color'],
                '--epr-text-color': 'hsl(var(--foreground))' as React.CSSProperties['color'],
                '--epr-search-input-text-color': 'hsl(var(--foreground))' as React.CSSProperties['color'],
                '--epr-category-label-text-color': 'hsl(var(--muted-foreground))' as React.CSSProperties['color'],
                '--epr-border-color': 'hsl(var(--border))' as React.CSSProperties['color'],
              } as React.CSSProperties}>
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={Theme.LIGHT}
                searchPlaceholder="Buscar emojis..."
                previewConfig={{ showPreview: false }}
                categories={[
                  { name: "Usados Recentemente", category: Categories.SUGGESTED },
                  { name: "Rostos e Emoções", category: Categories.SMILEYS_PEOPLE },
                  { name: "Animais e Natureza", category: Categories.ANIMALS_NATURE },
                  { name: "Comida e Bebida", category: Categories.FOOD_DRINK },
                  { name: "Viagens e Lugares", category: Categories.TRAVEL_PLACES },
                  { name: "Atividades", category: Categories.ACTIVITIES },
                  { name: "Objetos", category: Categories.OBJECTS },
                  { name: "Símbolos", category: Categories.SYMBOLS },
                  { name: "Bandeiras", category: Categories.FLAGS },
                ]}
              />
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Anexar Arquivo">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Gravar Áudio">
            <Mic className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Citar Mensagem">
            <Quote className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Assinatura/Nota Rápida">
            <PenLine className="h-5 w-5" />
          </Button>
          {/* Adicionar mais botões aqui se necessário */}
        </div>

        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <Textarea
            ref={textareaRef}
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