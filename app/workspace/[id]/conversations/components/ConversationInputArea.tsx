// app/workspace/[slug]/conversations/components/ConversationInputArea.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { Loader2, Mic, Paperclip, PauseCircle, Quote, Send, Smile, Maximize2 } from 'lucide-react';
// Se você não tiver axios ou toast aqui diretamente, remova-os se forem gerenciados em outro lugar.
// import axios from 'axios'; // Se não usado diretamente aqui
import { toast } from 'react-hot-toast'; // Necessário para handleSendAudioFile e startRecording
import { format } from 'date-fns';

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Remova se Message não for usado diretamente aqui.
// import type { Message } from '@/app/types';
import { cn } from '@/lib/utils';
import WhatsappTemplateDialog from '@/components/whatsapp/WhatsappTemplateDialog'; // Certifique-se que este componente aceita 'triggerButton'
import { useConversationContext } from '@/context/ConversationContext';

type MessageType = 'reply' | 'private-note';

interface ConversationInputAreaProps {
  conversationId: string;
  workspaceId: string;
  sendMediaMessage: (conversationId: string, file: File) => Promise<void>;
  sendTemplateMessage: (conversationId: string, templateData: any) => Promise<void>;
  isSendingMessage: boolean;
  isUploading: boolean;
  setIsUploading: (value: boolean) => void; // Adicionado setIsUploading se necessário para gerenciar estado de upload externo
  loadingTemplates: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// function getMessageTypeFromMime(mimeType: string): string { /* ... */ } // Mantenha se necessário

export default function ConversationInputArea({
  conversationId,
  workspaceId,
  sendMediaMessage,
  sendTemplateMessage,
  isSendingMessage,
  isUploading,
  setIsUploading, // Adicionado
  loadingTemplates,
  textareaRef,
}: ConversationInputAreaProps) {
  const { sendManualMessage } = useConversationContext();
  const [internalNewMessage, setInternalNewMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('reply');
  const [isRecording, setIsRecording] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'prompting' | 'granted' | 'denied'>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const sendingRef = useRef(false);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInternalNewMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !conversationId) {
      if(event.target) event.target.value = ""; // Limpa o input para permitir selecionar o mesmo arquivo novamente
      return;
    }
    // setIsUploading(true); // Opcional: definir estado de upload aqui se gerenciado internamente
    try {
      await sendMediaMessage(conversationId, file);
    } catch (error: any) {
      console.error("Erro capturado no InputArea ao tentar enviar anexo:", error);
      // toast.error("Falha ao enviar anexo."); // O toast pode ser gerenciado pela função sendMediaMessage
    } finally {
      if(event.target) event.target.value = "";
      // setIsUploading(false); // Opcional: resetar estado de upload
    }
  };

  const handleSendAudioFile = async (audioFile: File) => {
    if (!conversationId) {
        toast.error("Conversa não selecionada.");
        return;
    }
    // setIsUploading(true); // Opcional
    try {
      await sendMediaMessage(conversationId, audioFile);
    } catch (error: any) {
      console.error("Erro capturado no InputArea ao tentar enviar áudio:", error);
      // toast.error("Falha ao enviar áudio.");
    } finally {
        // setIsUploading(false); // Opcional
    }
  };

  const startRecording = async () => {
    setPermissionStatus('prompting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionStatus('granted');
      audioChunksRef.current = [];

      const mimeTypeOptions = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4', // iOS Safari prefere mp4
        'audio/aac',
        'audio/webm', // Fallback
      ];
      const mimeType = mimeTypeOptions.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';


      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        setRecordingDuration(0);
        // setIsRecording(false); // Movido para ser chamado antes de handleSendAudioFile

        if (audioChunksRef.current.length === 0) {
            console.warn("[AudioRecord] Gravação parada sem dados de áudio.");
            setIsRecording(false); // Garante que o estado seja resetado
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const filenameSuffix = mimeType.split('/')[1].split(';')[0];
        const filename = `audio_gravado_${format(new Date(), 'yyyyMMdd_HHmmss')}.${filenameSuffix}`;
        const audioFile = new File([audioBlob], filename, { type: mimeType });

        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false); // Definir como false antes de enviar, para reabilitar UI
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
      setIsRecording(true); // Definir como true após o start bem-sucedido
      recordingIntervalRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
           setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
        }
      }, 1000);

    } catch (err) {
      console.error("[AudioRecord] Erro ao obter permissão ou iniciar gravação:", err);
      setPermissionStatus('denied');
      toast.error("Permissão de microfone negada ou dispositivo não encontrado.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
        setIsRecording(false);
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

  const handleSendTemplate = async (templateData: { name: string; language: string; variables: Record<string, string>; body: string }) => {
    if (!conversationId) {
        toast.error("Conversa não selecionada.");
        return;
    }
    try {
      await sendTemplateMessage(conversationId, templateData);
    } catch (error: any) {
      console.error("Erro capturado no InputArea ao tentar enviar template:", error);
      // toast.error("Falha ao enviar template.");
    }
  };

  const safeHandleSendMessage = useCallback(async () => {
    const trimmedMessage = internalNewMessage.trim();
    if (!trimmedMessage || isSendingMessage || sendingRef.current || !conversationId || (isRecording && messageType === 'reply')) {
      return;
    }
    sendingRef.current = true;
    setInternalNewMessage('');
    try {
      await sendManualMessage(conversationId, trimmedMessage, workspaceId, messageType === 'private-note');
    } catch (error) {
      console.error('[InputArea Send] Erro sending manual message (context should handle toast):', error);
      // Não precisa de toast aqui se o contexto já lida com isso.
      // Se não, adicione: toast.error("Falha ao enviar mensagem.");
      // E reponha a mensagem no input para o usuário não perdê-la:
      // setInternalNewMessage(trimmedMessage);
    } finally {
      sendingRef.current = false;
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [internalNewMessage, isSendingMessage, conversationId, workspaceId, sendManualMessage, textareaRef, messageType, isRecording]);

  const commonDisabled = isSendingMessage || isUploading;
  // Desabilitar abas se estiver gravando áudio (somente para 'reply')
  const tabsDisabled = commonDisabled || (isRecording && messageType === 'reply');

  return (
    <div className="bg-card text-sm flex flex-col shadow-sm"> {/* bg-card ou bg-background */}
      <Tabs value={messageType} onValueChange={(value) => setMessageType(value as MessageType)} className="w-full">
        <div className="flex items-center justify-between border-b border-border pr-1 sm:pr-2">
          <TabsList className="bg-transparent p-0 h-auto rounded-none">
            <TabsTrigger
              value="reply"
              className={cn(
                "px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:shadow-none data-[state=active]:bg-transparent relative",
                "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground",
                "data-[state=active]:text-orange-500 dark:data-[state=active]:text-orange-400 after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-[-1px] after:h-[2px] data-[state=active]:after:bg-orange-500 dark:data-[state=active]:after:bg-orange-400"
              )}
              disabled={tabsDisabled}
            >
              Responder
            </TabsTrigger>
            <TabsTrigger
              value="private-note"
              className={cn(
                "px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:shadow-none data-[state=active]:bg-transparent relative",
                "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground",
                "data-[state=active]:text-yellow-500 dark:data-[state=active]:text-yellow-400 after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-[-1px] after:h-[2px] data-[state=active]:after:bg-yellow-500 dark:data-[state=active]:after:bg-yellow-400"
              )}
              disabled={tabsDisabled}
            >
              Nota Privada
            </TabsTrigger>
          </TabsList>
          {/* Ícone de maximizar como na imagem */}
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9" title="Expandir">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-2 sm:p-2">
          <div className={cn(
            "w-full rounded-md border bg-background text-sm", // bg-background para a área interna da textarea
            "focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0",
            messageType === 'private-note' ? "border-yellow-400/60 dark:border-yellow-500/50" : "border-input"
          )}>
            <Textarea
              placeholder={messageType === 'reply' ? "Digite sua resposta aqui..." : "Digite sua nota privada aqui..."}
              className={cn(
                "min-h-[60px] sm:min-h-[70px] w-full rounded-md rounded-t-none border-0 border-t bg-transparent px-3 py-2 shadow-none resize-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60",
                messageType === 'private-note'
                  ? "text-yellow-900 dark:text-yellow-200 placeholder:text-yellow-700/70 dark:placeholder:text-yellow-400/50 bg-yellow-50/20 dark:bg-yellow-800/10 border-yellow-400/60 dark:border-yellow-500/50"
                  : "text-foreground border-input" // A borda superior é dada pelo Textarea, ou pelo div pai se for border-0
              )}
              value={internalNewMessage}
              onChange={(e) => setInternalNewMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isSendingMessage && !isUploading && !(isRecording && messageType === 'reply')) {
                  e.preventDefault();
                  safeHandleSendMessage();
                }
              }}
              ref={textareaRef}
              disabled={isUploading || (isRecording && messageType === 'reply')}
            />
          </div>
        </div>
      </Tabs>

      <div className="flex items-center justify-between p-2 sm:p-2 mt-auto bg-card"> {/* bg-card ou bg-background */}
        <div className="flex items-center space-x-0.5 sm:space-x-1">
          {messageType === 'reply' && !isRecording && (
            <>
              <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9" disabled={commonDisabled} title="Emoji">
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 border-0 shadow-xl" side="top" align="start">
                  <EmojiPicker onEmojiClick={handleEmojiClick} theme={Theme.AUTO} lazyLoadEmojis={true} searchPlaceholder="Buscar emoji..." height={350} />
                </PopoverContent>
              </Popover>

              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9" onClick={() => fileInputRef.current?.click()} disabled={commonDisabled} title="Anexar arquivo">
                <Paperclip className="h-5 w-5" />
              </Button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9" onClick={handleMicClick} disabled={commonDisabled || permissionStatus === 'prompting'} title="Gravar áudio">
                 <Mic className="h-5 w-5" />
              </Button>
              
              {/* <WhatsappTemplateDialog
                onSendTemplate={handleSendTemplate}
                disabled={commonDisabled || loadingTemplates || (isRecording && messageType === 'reply')}
                isSendingTemplate={isSendingMessage} // Renomeie para isSending se for genérico
                triggerButton={ // Certifique-se que WhatsappTemplateDialog aceita esta prop
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9" disabled={commonDisabled || loadingTemplates} title="Usar template">
                        <Quote className="h-5 w-5" />
                    </Button>
                }
               /> */}
            </>
          )}
          {messageType === 'reply' && isRecording && (
             <div className="flex items-center gap-2 text-muted-foreground px-1 h-8 sm:h-9">
                <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-mono">{formatDuration(recordingDuration)}</span>
                <Button variant="ghost" size="icon" onClick={stopRecording} title="Parar Gravação" className="text-red-500 hover:text-red-600 h-8 w-8 sm:h-9 sm:w-9">
                  <PauseCircle className="h-5 w-5" />
                </Button>
             </div>
           )}
           {/* Espaço reservado para alinhar o botão "Send" quando não há ícones (Private Note) */}
           {(messageType === 'private-note' || (messageType === 'reply' && !isRecording && !isRecording /* redundante, mas para clareza do else */)) && 
             ! (messageType === 'reply' && !isRecording) && // Se for private note
             ! (messageType === 'reply' && isRecording) && // Ou se for reply e não está gravando (a condição de cima cobre isso)
             <div className="w-auto h-8 sm:h-9"></div> // Este div pode não ser necessário se o flex-grow no botão Send funcionar bem
           }
        </div>

        <Button
          onClick={safeHandleSendMessage}
          disabled={commonDisabled || (isRecording && messageType === 'reply') || !internalNewMessage.trim()}
          className={cn(
            "min-w-[90px] sm:min-w-[110px] h-8 sm:h-9 px-3 py-2 text-xs sm:text-sm", // Ajuste de tamanho
            messageType === 'private-note' 
              ? "bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white dark:text-primary-foreground" 
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isSendingMessage || (isUploading && messageType !== 'private-note') ? ( // Mostrar loader para upload apenas em reply
            <Loader2 className="h-4 w-4 animate-spin mr-1 sm:mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-1 sm:mr-2" />
          )}
          Send <span className="ml-1 text-xs opacity-70 hidden sm:inline">(⌘+↵)</span>
        </Button>
      </div>
    </div>
  );
}