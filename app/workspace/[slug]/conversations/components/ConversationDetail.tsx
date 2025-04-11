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
import axios from 'axios'; // <<< Importar Axios para o upload

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
  const fileInputRef = useRef<HTMLInputElement>(null); // <<< Ref para o input de arquivo
  const [isUploading, setIsUploading] = useState(false); // <<< Estado para loading do upload
  // <<< NOVOS ESTADOS E REFS PARA ÁUDIO >>>
  const [isRecording, setIsRecording] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'prompting' | 'granted' | 'denied'>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
            // <<< CORRIGIDO: event.data já é o payload >>>
            const messagePayload = JSON.parse(event.data); // event.data contém o objeto enviado pelo servidor
            console.log(`[ConvDetail SSE] Evento 'message_content_updated' recebido. Payload:`, messagePayload);

            // <<< CORRIGIDO: Chamar diretamente com o payload, pois o tipo já está no nome do evento >>>
            if (messagePayload && typeof messagePayload === 'object' && messagePayload.id) {
              // Passa o objeto payload inteiro para a função do contexto
              updateRealtimeMessageContent(messagePayload);
            } else {
              console.warn("[ConvDetail SSE] Payload de atualização inválido ou sem ID:", messagePayload);
            }

          } catch (error) {
            console.error("[ConvDetail SSE] Erro ao parsear dados do evento 'message_content_updated':", error, "\nData:", event.data);
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

  // <<< NOVO HANDLER PARA SELEÇÃO DE ARQUIVO >>>
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !conversation?.id || !conversation?.workspace_id) {
      // Limpa o input para permitir selecionar o mesmo arquivo novamente se necessário
      if(event.target) event.target.value = "";
      return;
    }

    // Validar tamanho/tipo no frontend (opcional, mas bom para UX)
    // const MAX_SIZE = 16 * 1024 * 1024; // 16MB
    // if (file.size > MAX_SIZE) {
    //   toast.error('Arquivo muito grande. Máximo 16MB.');
    //   if(event.target) event.target.value = "";
    //   return;
    // }
    // TODO: Adicionar validação de tipo MIME no frontend se desejado

    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversationId', conversation.id);
    formData.append('workspaceId', conversation.workspace_id);

    const tempId = `temp-upload-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_type: 'AI', // Ou o tipo que representa o operador
      content: `[Enviando ${file.name}...]`,
      timestamp: new Date().toISOString(),
      metadata: { 
        status: 'uploading', // Novo status
        originalFilename: file.name,
        mimeType: file.type,
        messageType: getMessageTypeFromMime(file.type) // Use helper (needs to be defined or imported)
      }
    };

    addMessageOptimistically(optimisticMessage);
    setIsUploading(true);

    try {
      const response = await axios.post<{ success: boolean, data: Message, error?: string }>(
        '/api/attachments',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Falha no upload do anexo');
      }

      updateMessageStatus(tempId, response.data.data); // Atualiza com a msg real da API (com URL)
      toast.success('Anexo enviado!');

    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Erro ao enviar anexo.';
      updateMessageStatus(tempId, null, message); // Marca como falha
      console.error("Erro no componente ao enviar anexo:", error);
      toast.error(`Falha ao enviar: ${message}`);
    } finally {
      setIsUploading(false);
      // Limpa o input para permitir selecionar o mesmo arquivo novamente
      if(event.target) event.target.value = "";
    }
  };

   // <<< NOVA FUNÇÃO HELPER (ou importar de utils) >>>
   function getMessageTypeFromMime(mimeType: string): string {
      if (mimeType.startsWith('image/')) return 'IMAGE';
      if (mimeType.startsWith('video/')) return 'VIDEO';
      if (mimeType.startsWith('audio/')) return 'AUDIO';
      return 'DOCUMENT'; // Default to document
    }

  // --- Handlers de Ação ---
  // <<< RESTAURAR handlePause >>>
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

  // <<< NOVA FUNÇÃO PARA GRAVAÇÃO DE ÁUDIO >>>
  const startRecording = async () => {
    setPermissionStatus('prompting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionStatus('granted');
      audioChunksRef.current = []; // Limpa chunks anteriores
      
      // Determinar o tipo MIME preferido (Opus em WebM ou Ogg é geralmente bom)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm'; // Fallback

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        console.log("[AudioRecord] Gravação parada. Processando blob...");
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        setRecordingDuration(0);
        setIsRecording(false);

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const filename = `audio_gravado_${format(new Date(), 'yyyyMMdd_HHmmss')}.${mimeType.split('/')[1].split(';')[0]}`;
        const audioFile = new File([audioBlob], filename, { type: mimeType });
        
        // Reset stream tracks para parar o ícone de gravação do navegador
        stream.getTracks().forEach(track => track.stop()); 

        // Chamar função para enviar o arquivo (será criada depois)
        await handleSendAudioFile(audioFile); 
      };
      
      recorder.onerror = (event) => {
        console.error("[AudioRecord] Erro no MediaRecorder:", event);
        toast.error("Erro durante a gravação.");
        setIsRecording(false);
         if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
         setRecordingDuration(0);
         stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      recordingStartTimeRef.current = Date.now();
      recordingIntervalRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
           setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
        }
      }, 1000);
      setIsRecording(true);
      console.log("[AudioRecord] Gravação iniciada.");

    } catch (err) {
      console.error("[AudioRecord] Erro ao obter permissão ou iniciar gravação:", err);
      setPermissionStatus('denied');
      toast.error("Permissão de microfone negada ou dispositivo não encontrado.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop(); // Isso vai disparar o onstop
      console.log("[AudioRecord] Comando stop enviado.");
    } else {
        console.warn("[AudioRecord] Tentativa de parar gravação, mas não estava gravando.");
        setIsRecording(false); // Garantir que o estado está correto
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        setRecordingDuration(0);
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  // Placeholder para a função de envio (será similar a handleFileChange)
  const handleSendAudioFile = async (audioFile: File) => {
    console.log("[AudioSend] Enviando arquivo de áudio:", audioFile.name, audioFile.type, audioFile.size);
    // TODO: Implementar lógica de envio usando FormData e /api/attachments
    // Reutilizar estrutura de handleFileChange

    if (!conversation?.id || !conversation?.workspace_id) {
        toast.error("Conversa ou Workspace não selecionado.");
        return;
    }

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('conversationId', conversation.id);
    formData.append('workspaceId', conversation.workspace_id);

    const tempId = `temp-audio-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_type: 'AI', // Operador = AI?
      content: `[Enviando áudio ${audioFile.name}...]`,
      timestamp: new Date().toISOString(),
      metadata: { 
        status: 'uploading', 
        originalFilename: audioFile.name,
        mimeType: audioFile.type,
        messageType: 'AUDIO'
      }
    };

    addMessageOptimistically(optimisticMessage);
    setIsUploading(true); // Usar o mesmo estado de upload?

    try {
      const response = await axios.post<{ success: boolean, data: Message, error?: string }>(
        '/api/attachments',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Falha no upload do áudio');
      }
      updateMessageStatus(tempId, response.data.data);
      toast.success('Áudio enviado!');

    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Erro ao enviar áudio.';
      updateMessageStatus(tempId, null, message);
      console.error("Erro no componente ao enviar áudio:", error);
      toast.error(`Falha ao enviar: ${message}`);
    } finally {
      setIsUploading(false);
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
          {messages.map((msg) => {
            // <<< ADICIONAR LOG PARA DEBUG >>>
            console.log("[ConvDetail Render Msg]:", JSON.stringify(msg, null, 2));
            return (
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
                  {/* Renderização de Mídia ou Texto REVISADA NOVAMENTE */}
                  {(typeof msg.media_url === 'string' && msg.media_url.length > 0 && 
                    typeof msg.media_mime_type === 'string' && msg.media_mime_type.length > 0) ? (
                    // --- CASO 1: TEMOS media_url e media_mime_type VÁLIDOS --- 
                    <div className="relative min-w-[200px] max-w-xs"> {/* Container para mídia */}
                      
                      {/* --- Renderização Específica da Mídia --- */} 
                      
                      {/* Imagem */} 
                      {msg.media_mime_type.startsWith('image/') && (
                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="block">
                          <img 
                            src={msg.media_url} 
                            alt={msg.media_filename || 'Imagem enviada'} 
                            className="rounded-md object-cover w-full h-auto max-h-60" 
                            loading="lazy"
                          />
                        </a>
                      )}
  
                      {/* Vídeo */} 
                      {msg.media_mime_type.startsWith('video/') && (
                        <video controls src={msg.media_url} className="rounded-md w-full" preload="metadata">
                          Seu navegador não suporta vídeo.
                        </video>
                      )}
  
                      {/* Áudio */} 
                      {msg.media_mime_type.startsWith('audio/') && (
                        <audio controls src={msg.media_url} className="w-full" preload="metadata">
                          Seu navegador não suporta áudio.
                        </audio>
                      )}
                      
                      {/* Documento (ou outros tipos) */} 
                      {!msg.media_mime_type.startsWith('image/') && 
                       !msg.media_mime_type.startsWith('video/') && 
                       !msg.media_mime_type.startsWith('audio/') && (
                        <a 
                          href={msg.media_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-400 hover:text-blue-300 hover:underline break-words flex items-center gap-2 p-2 bg-muted/50 rounded-md" 
                          download={msg.media_filename || true}
                        >
                           <Paperclip className="h-4 w-4 flex-shrink-0" />
                           <span className="truncate">{msg.media_filename || msg.media_url.split('/').pop() || 'Download Anexo'}</span>
                        </a>
                      )}
                      
                      {/* Legenda (Renderiza se content existe e não é o placeholder padrão) */} 
                      {msg.content && msg.content !== `[Anexo: ${msg.media_filename}]` && (
                        <p className="text-xs opacity-90 mt-1 pt-1 border-t border-white/10 whitespace-pre-wrap break-words">{msg.content}</p>
                      )}
  
                       {/* Overlay de Loading/Processing (Mostrado se status específico está no metadata) */} 
                       {(msg.metadata?.status === 'uploading' || msg.metadata?.status === 'processing') && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm rounded-md z-10 p-2">
                          <LoadingSpinner 
                            size="small" 
                            message={msg.metadata?.status === 'uploading' ? `Enviando ${msg.media_filename || 'anexo'}...` : `Processando...`}
                          />
                        </div>
                      )}
  
                    </div>
                  ) : (
                    // --- CASO 2: NÃO TEM media_url/mime_type VÁLIDOS -> Renderizar content como texto --- 
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                  {/* Timestamp (Comum para ambos os casos) */} 
                  <div className="text-xs opacity-70 mt-1 text-right">
                    <span title={format(new Date(msg.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}>
                      {format(new Date(msg.timestamp), 'HH:mm')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
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

          {/* <<< ACIONAR INPUT DE ARQUIVO COM LABEL >>> */}
          <input
            type="file"
            id="file-upload-input" // <<< Adicionar ID
            ref={fileInputRef} // Manter ref se precisar resetar
            onChange={handleFileChange}
            className="hidden"
            // accept="image/*,video/*,audio/*,application/pdf,..." 
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-foreground" 
            title="Anexar Arquivo"
            // onClick={() => { ... }} // <<< REMOVER onClick do Button
            disabled={isUploading || isSendingMessage || !isConversationCurrentlyActive} 
            asChild // <<< Permitir que o Label dentro seja o elemento clicável
          >
            <label htmlFor="file-upload-input" className="cursor-pointer">
              {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
            </label>
          </Button>
          {/* <<< ATUALIZAR BOTÃO MIC >>> */}
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
                "text-muted-foreground hover:text-foreground",
                isRecording && "text-red-500 hover:text-red-600 bg-red-500/10"
            )} 
            title={isRecording ? `Parar gravação (${formatDuration(recordingDuration)})` : "Gravar Áudio"}
            onClick={handleMicClick}
            disabled={isUploading || isSendingMessage || !isConversationCurrentlyActive || permissionStatus === 'prompting'}
          >
            {isRecording ? <Mic className="h-5 w-5 animate-pulse" /> : <Mic className="h-5 w-5" />}
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

// <<< FUNÇÃO HELPER FORA DO COMPONENTE >>>
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}