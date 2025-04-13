// app/workspace/[slug]/conversations/components/ConversationDetail.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
// Removido axios pois as chamadas são feitas pelo contexto
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
  PenLine,
  MessageSquareText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import type { Message } from '@/app/types'; // Importar apenas Message, ClientConversation vem do contexto
import { toast } from 'react-hot-toast';
import { useFollowUp } from '@/context/follow-up-context'; // Importar o hook
// <<< Importar Popover e EmojiPicker >>>
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
// <<< MODIFICAÇÃO: Importar apenas o necessário do emoji-picker >>>
import EmojiPicker, { EmojiClickData, Theme, Categories } from 'emoji-picker-react';
import axios from 'axios'; // <<< Importar Axios para o upload
import { useWhatsappTemplates } from '@/context/whatsapp-template-context'; // <<< Importar o hook
import WhatsappTemplateDialog from './WhatsappTemplateDialog'; // <<< IMPORTAR NOVO COMPONENTE
import ConversationInputArea from './ConversationInputArea'; // <<< IMPORTAR NOVO COMPONENTE

// Remover a interface de Props, pois não recebe mais a conversa via prop
// interface ConversationDetailProps {
//   conversation: ClientConversation | null;
// }

// Mock/Placeholder para tipo de Template (definir melhor depois)
interface WhatsappTemplate {
  id: string; // ID do template na Meta ou no nosso sistema
  name: string;
  language: string;
  category: string;
  body: string; // Corpo do template (pode ter variáveis)
  // Adicionar outras propriedades se necessário (header, footer, buttons, variables)
}

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

  const { templates, loadingTemplates, templateError, clearTemplateError } = useWhatsappTemplates(); // <<< Usar o hook

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
  // <<< ESTADOS PARA TEMPLATES >>>
  // const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  // const [selectedTemplateForEditing, setSelectedTemplateForEditing] = useState<WhatsappTemplate | null>(null);
  // const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  // const [variableValues, setVariableValues] = useState<Record<string, string>>({});

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
            const messagePayload = JSON.parse(event.data); // event.data contém o objeto enviado pelo servidor
            console.log(`[ConvDetail SSE] Evento 'message_content_updated' RECEBIDO. Payload Bruto:`, messagePayload); // <<< LOG 1: Payload recebido

            if (messagePayload && typeof messagePayload === 'object' && messagePayload.id) {
              console.log(`[ConvDetail SSE] Chamando updateRealtimeMessageContent com o payload acima.`); // <<< LOG 2: Chamada da função
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
    const senderTypeManual: Message['sender_type'] = 'SYSTEM'; // Ou 'SYSTEM'

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

   // <<< NOVA FUNÇÃO PARA RECEBER O TEMPLATE DO DIÁLOGO >>>
   const handleFinalTemplateInsert = (templateBody: string) => {
    setNewMessage(prev => prev + templateBody);
    textareaRef.current?.focus();
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
  const isFollowUpActionable = conversation?.activeFollowUp?.status === 'ACTIVE' || conversation?.activeFollowUp?.status === 'PAUSED';

  // Loader geral para ações que mudam o status do FollowUp
  const isStatusActionLoading = isPausingFollowUp || isResumingFollowUp || isConvertingFollowUp || isCancellingFollowUp;

  return (
    <div className={cn(
      "flex flex-col h-full bg-background",
      !conversation && "items-center justify-center" // Center content if no conversation selected
    )}>
      {!conversation ? (
        <div className="text-center text-muted-foreground">
          <MessageSquareText className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>Selecione uma conversa para ver as mensagens.</p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center p-3 border-b border-border bg-card/60 flex-shrink-0">
            {/* Back button for mobile? Or just rely on layout */}
            <Avatar className="h-9 w-9 mr-3">
              <AvatarFallback>{conversation.client?.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              {/* Add AvatarImage if URL exists */}
            </Avatar>
            <div className="flex-grow">
              <h2 className="font-semibold text-card-foreground truncate">{conversation.client?.name || 'Conversa'}</h2>
              <p className="text-xs text-muted-foreground">{conversation.client?.phone_number}</p>
            </div>
            {/* Action buttons (Pause, Resume, etc.) */}
            <div className="flex items-center space-x-2">
              {conversation.activeFollowUp?.status === 'ACTIVE' && (
                <Button variant="outline" size="sm" onClick={handlePause} disabled={isPausingFollowUp}>
                  {isPausingFollowUp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PauseCircle className="h-4 w-4 mr-1" />}
                  Pausar IA
                </Button>
              )}
              {conversation.activeFollowUp?.status === 'PAUSED' && (
                <Button variant="outline" size="sm" onClick={handleResume} disabled={isResumingFollowUp}>
                  {isResumingFollowUp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PlayCircle className="h-4 w-4 mr-1" />}
                  Retomar IA
                </Button>
              )}
               {isFollowUpActionable && (
                 <Button variant="secondary" size="sm" onClick={handleMarkConverted} disabled={isConvertingFollowUp}>
                   {isConvertingFollowUp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                   Convertido
                 </Button>
               )}
               {isFollowUpActionable && (
                 <Button variant="destructive" size="sm" onClick={handleCancelSequence} disabled={isCancellingFollowUp}>
                   {isCancellingFollowUp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                   Cancelar
                 </Button>
               )}
            </div>
          </div>

          {/* Message Area */}
          <ScrollArea ref={scrollAreaRef} className="flex-grow p-4 overflow-y-auto">
              {isLoadingMessages && messages.length === 0 && <LoadingSpinner message="Carregando mensagens..." />}
              {messageError && messages.length === 0 && <ErrorMessage message={messageError} onDismiss={clearMessagesError} />}
              {messages.map((message, index) => {
                // <<< LOG ANTES DE RENDERIZAR >>>
                console.log(`[ConvDetail Render] Rendering msg ID: ${message.id}, Content: "${message.content}", MediaURL: ${message.media_url}, MimeType: ${message.media_mime_type}`);
                return (
                  <div
                    key={message.id || `msg-${index}`}
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
                      {/* --- Conditional Rendering --- */}
                      {/* Render text content ONLY if media_url is NOT present */}
                      {!message.media_url && message.content && (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}

                      {/* Render media component ONLY if media_url IS present */}
                      {message.media_url && (
                        <div className="mt-1"> {/* Add margin-top only if media exists */}
                          {message.media_mime_type?.startsWith('image/') ? (
                            <img
                              src={message.media_url}
                              alt={message.media_filename || 'Imagem anexada'}
                              className="rounded-lg max-w-full h-auto max-h-60 object-contain cursor-pointer"
                              onClick={() => window.open(message.media_url, '_blank')}
                              loading="lazy"
                            />
                          ) : message.media_mime_type?.startsWith('audio/') ? (
                            <audio controls src={message.media_url} className="w-full" preload="metadata">
                              Seu navegador não suporta o elemento de áudio.
                            </audio>
                          ) : message.media_mime_type?.startsWith('video/') ? (
                            <video controls src={message.media_url} className="rounded-lg max-w-full h-auto max-h-60 object-contain" preload="metadata">
                               Seu navegador não suporta o elemento de vídeo.
                            </video>
                          ) : (
                            // Generic link for other file types
                            <a
                              href={message.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "flex items-center gap-2 p-2 rounded-md text-sm",
                                message.sender_type === 'CLIENT' ? "text-blue-600 dark:text-blue-400 hover:bg-black/5" : "text-primary-foreground/90 hover:bg-white/10"
                              )}
                            >
                              <Paperclip className="h-4 w-4 flex-shrink-0" />
                              <span className="underline truncate">{message.media_filename || 'Ver Anexo'}</span>
                            </a>
                          )}
                        </div>
                      )}
                      {/* --- Timestamp and Status (Common) --- */}
                      <div className={cn(
                        "text-xs mt-1 flex items-center",
                         message.sender_type === 'CLIENT' ? 'text-muted-foreground/80 justify-start' : 'text-primary-foreground/80 justify-end'
                      )}>
                        <span title={format(new Date(message.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}>{format(new Date(message.timestamp), 'HH:mm', { locale: ptBR })}</span>
                        {message.sender_type !== 'CLIENT' && (
                            <span className="ml-2">
                              {message.status === 'PENDING' && <span title="Pendente"><Loader2 className="h-3 w-3 animate-spin" /></span>}
                              {message.status === 'SENT' && <span title="Enviado"><CheckCircle className="h-3 w-3 text-green-400" /></span>}
                              {message.status === 'FAILED_PROCESSING' && <span title="Falha no processamento"><XCircle className="h-3 w-3 text-yellow-400" /></span>}
                              {message.status === 'FAILED' && <span title={message.metadata?.errorMessage || 'Falha no envio'}><XCircle className="h-3 w-3 text-red-400" /></span>}
                              {/* Add DELIVERED/READ later based on webhooks */}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </ScrollArea>

          {/* <<< USAR O NOVO COMPONENTE ConversationInputArea >>> */}
          <ConversationInputArea
             conversationId={conversation.id}
             workspaceId={conversation.workspace_id}
             newMessage={newMessage}
             setNewMessage={setNewMessage}
             handleSendMessage={handleSendMessage}
             isSendingMessage={isSendingMessage}
             isUploading={isUploading}
             setIsUploading={setIsUploading}
             addMessageOptimistically={addMessageOptimistically}
             updateMessageStatus={updateMessageStatus}
             loadingTemplates={loadingTemplates}
             textareaRef={textareaRef}
          />
            {/* Exibição de erro de templates (MANTIDO AQUI) */}
             {templateError && (
               <ErrorMessage message={templateError} onDismiss={clearTemplateError} />
             )}
          {/* <<< FIM do novo componente >>> */}
        </>
      )}
    </div>
  );
}