// app/workspace/[slug]/conversations/components/ConversationInputArea.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData, Theme, Categories } from 'emoji-picker-react';
import { Loader2, Mic, Paperclip, PauseCircle, Quote, Send, Smile } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

import type { Message } from '@/app/types';
import { cn } from '@/lib/utils';
import WhatsappTemplateDialog from '@/components/whatsapp/WhatsappTemplateDialog';
import { useConversationContext } from '@/context/ConversationContext';

// --- Tipos e Interfaces ---

interface ConversationInputAreaProps {
  conversationId: string;
  workspaceId: string;
  sendMediaMessage: (conversationId: string, file: File) => Promise<void>;
  sendTemplateMessage: (conversationId: string, templateData: any) => Promise<void>;
  isSendingMessage: boolean;
  isUploading: boolean;
  setIsUploading: (value: boolean) => void;
  loadingTemplates: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

// Helper para formatar duração (pode ser movido para utils eventualmente)
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Helper para tipo de mensagem (pode ser movido para utils)
function getMessageTypeFromMime(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    return 'DOCUMENT'; // Default to document
}


export default function ConversationInputArea({
  conversationId,
  workspaceId,
  sendMediaMessage,
  sendTemplateMessage,
  isSendingMessage,
  isUploading,
  setIsUploading,
  loadingTemplates,
  textareaRef,
}: ConversationInputAreaProps) {

  // --- Obter função do Contexto ---
  const { sendManualMessage } = useConversationContext();

  // --- Estados e Refs Locais ---
  const [internalNewMessage, setInternalNewMessage] = useState('');
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

  // --- Handlers Locais ---

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInternalNewMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !conversationId) {
      if(event.target) event.target.value = "";
      return;
    }

    try {
      await sendMediaMessage(conversationId, file);
    } catch (error: any) {
      console.error("Erro capturado no InputArea ao tentar enviar anexo:", error);
    } finally {
      if(event.target) event.target.value = "";
    }
  };

  const handleSendAudioFile = async (audioFile: File) => {
    console.log("[AudioSend] Enviando arquivo de áudio:", audioFile.name, audioFile.type, audioFile.size);
    if (!conversationId) {
        toast.error("Conversa não selecionada.");
        return;
    }

    try {
      await sendMediaMessage(conversationId, audioFile);
    } catch (error: any) {
      console.error("Erro capturado no InputArea ao tentar enviar áudio:", error);
    }
  };

  const startRecording = async () => {
    setPermissionStatus('prompting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionStatus('granted');
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';

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

        stream.getTracks().forEach(track => track.stop());
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
      mediaRecorderRef.current.stop();
      console.log("[AudioRecord] Comando stop enviado.");
    } else {
        console.warn("[AudioRecord] Tentativa de parar gravação, mas não estava gravando.");
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
    console.log("Input Area: Template selecionado, chamando contexto...", templateData);
    try {
      await sendTemplateMessage(conversationId, templateData);
    } catch (error: any) {
      console.error("Erro capturado no InputArea ao tentar enviar template:", error);
    }
  };

  // Handler seguro para evitar duplo envio
  const safeHandleSendMessage = useCallback(async () => {
    const trimmedMessage = internalNewMessage.trim();
    if (!trimmedMessage || isSendingMessage || sendingRef.current || !conversationId) {
      return;
    }
    
    sendingRef.current = true;
    setInternalNewMessage('');

    try {
      await sendManualMessage(conversationId, trimmedMessage, workspaceId);
    } catch (error) {
      console.error('[InputArea Send] Erro sending manual message (context should handle toast):', error);
    } finally {
      sendingRef.current = false;
    }
  }, [internalNewMessage, isSendingMessage, conversationId, workspaceId, sendManualMessage]);

  // --- JSX ---
  return (
    <div className="border-t bg-background p-3 sm:p-4">
      {/* Área de gravação de áudio */}
      {isRecording && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-muted-foreground">Gravando...</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">{formatDuration(recordingDuration)}</span>
            <Button variant="ghost" size="icon" onClick={stopRecording} title="Parar Gravação">
              <PauseCircle className="h-5 w-5 text-red-500" />
            </Button>
          </div>
        </div>
      )}

      {/* Container Principal - Empilha Linhas */}
      <div className={cn(
        "flex flex-col gap-2",
        isRecording && "hidden"
      )}>
        {/* Linha Superior: Botões de Ação */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSendingMessage || isUploading}
            aria-label="Anexar arquivo"
            title="Anexar arquivo"
          >
            <Paperclip className="h-5 w-5 text-muted-foreground" />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
               <Button
                  variant="ghost"
                  size="icon"
                  disabled={isSendingMessage || isUploading}
                  aria-label="Abrir seletor de emojis"
                  title="Abrir seletor de emojis"
                >
                  <Smile className="h-5 w-5 text-muted-foreground" />
                </Button>
             </PopoverTrigger>
             <PopoverContent className="w-full p-0 border-0" side="top" align="start">
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  theme={Theme.AUTO}
                  lazyLoadEmojis={true}
                  searchPlaceholder="Buscar emoji..."
                />
             </PopoverContent>
          </Popover>

          <WhatsappTemplateDialog
               onSendTemplate={handleSendTemplate}
               disabled={isSendingMessage || isUploading || isRecording || loadingTemplates}
          />
        </div>

        {/* Linha Inferior: Textarea e Botão Enviar/Mic */}
        <div className="flex items-end gap-1 sm:gap-2">
          <Textarea
            ref={textareaRef}
            value={internalNewMessage}
            onChange={(e) => setInternalNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                safeHandleSendMessage();
              }
            }}
            placeholder="Digite sua mensagem..."
            className="min-h-[40px] max-h-[150px] resize text-sm flex-grow"
            rows={1}
            disabled={isSendingMessage || isUploading}
            style={{ overflowY: textareaRef.current && textareaRef.current.scrollHeight > 150 ? 'scroll' : 'hidden' }}
          />

          <Button
            size="icon"
            onClick={internalNewMessage ? safeHandleSendMessage : handleMicClick}
            disabled={isSendingMessage || isUploading || (!internalNewMessage && permissionStatus === 'prompting')}
            aria-label={internalNewMessage ? 'Enviar mensagem' : 'Gravar áudio'}
            title={internalNewMessage ? 'Enviar mensagem' : 'Gravar áudio'}
            className="flex-shrink-0"
          >
            {isSendingMessage || isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : internalNewMessage ? (
              <Send className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

