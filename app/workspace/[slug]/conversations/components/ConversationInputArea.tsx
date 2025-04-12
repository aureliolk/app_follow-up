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
import WhatsappTemplateDialog from './WhatsappTemplateDialog'; // Presumindo que está no mesmo diretório

// --- Tipos e Interfaces ---

interface ConversationInputAreaProps {
  conversationId: string;
  workspaceId: string;
  newMessage: string;
  setNewMessage: (value: string) => void;
  handleSendMessage: () => Promise<void>;
  isSendingMessage: boolean;
  isUploading: boolean;
  setIsUploading: (value: boolean) => void;
  addMessageOptimistically: (message: Message) => void;
  updateMessageStatus: (tempId: string, finalMessage: Message | null, errorMessage?: string) => void;
  loadingTemplates: boolean;
  onInsertTemplate: (templateBody: string) => void;
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
  newMessage,
  setNewMessage,
  handleSendMessage,
  isSendingMessage,
  isUploading,
  setIsUploading,
  addMessageOptimistically,
  updateMessageStatus,
  loadingTemplates,
  onInsertTemplate,
  textareaRef,
}: ConversationInputAreaProps) {

  // --- Estados e Refs Locais ---
  const [isRecording, setIsRecording] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'prompting' | 'granted' | 'denied'>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // --- Handlers Locais ---

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage(newMessage + emojiData.emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !conversationId || !workspaceId) {
      if(event.target) event.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversationId', conversationId);
    formData.append('workspaceId', workspaceId);

    const tempId = `temp-upload-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_type: 'AI', // Operador
      content: `[Enviando ${file.name}...]`,
      timestamp: new Date().toISOString(),
      metadata: {
        status: 'uploading',
        originalFilename: file.name,
        mimeType: file.type,
        messageType: getMessageTypeFromMime(file.type)
      }
    };

    addMessageOptimistically(optimisticMessage);
    setIsUploading(true);

    try {
      const response = await axios.post<{ success: boolean, data: Message, error?: string }>(
        '/api/attachments',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Falha no upload do anexo');
      }
      updateMessageStatus(tempId, response.data.data);
      toast.success('Anexo enviado!');

    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Erro ao enviar anexo.';
      updateMessageStatus(tempId, null, message);
      console.error("Erro no componente InputArea ao enviar anexo:", error);
      toast.error(`Falha ao enviar: ${message}`);
    } finally {
      setIsUploading(false);
      if(event.target) event.target.value = "";
    }
  };

  const handleSendAudioFile = async (audioFile: File) => {
    console.log("[AudioSend] Enviando arquivo de áudio:", audioFile.name, audioFile.type, audioFile.size);
    if (!conversationId || !workspaceId) {
        toast.error("Conversa ou Workspace não selecionado.");
        return;
    }

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('conversationId', conversationId);
    formData.append('workspaceId', workspaceId);

    const tempId = `temp-audio-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_type: 'AI', // Operador
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
    setIsUploading(true);

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
      console.error("Erro no componente InputArea ao enviar áudio:", error);
      toast.error(`Falha ao enviar: ${message}`);
    } finally {
      setIsUploading(false);
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

  // --- Renderização ---
  return (
    <div className="p-4 border-t border-border bg-card/60 flex-shrink-0">
       <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center space-x-2">
         {/* Botão de Microfone */}
         <Button
           type="button"
           variant={isRecording ? "destructive" : "ghost"}
           size="icon"
           onClick={handleMicClick}
           disabled={isUploading}
           title={isRecording ? "Parar Gravação" : "Gravar Áudio"}
         >
           {isRecording ? <PauseCircle className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
         </Button>
         {/* Exibir Duração da Gravação */}
         {isRecording && (
           <div className="text-xs text-muted-foreground font-mono w-12 text-center">
             {formatDuration(recordingDuration)}
           </div>
         )}

         {/* Botão de Anexo */}
         <Button
           type="button"
           variant="ghost"
           size="icon"
           onClick={() => fileInputRef.current?.click()}
           disabled={isUploading || isRecording}
           title="Anexar Arquivo"
         >
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin"/> : <Paperclip className="h-5 w-5" />}
         </Button>
         {/* Input de arquivo oculto */}
         <input
           type="file"
           ref={fileInputRef}
           onChange={handleFileChange}
           className="hidden"
           accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
         />

         {/* Botão de Emoji */}
         <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" title="Inserir Emoji" disabled={isRecording || isUploading}>
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-0" side="top" align="start">
              <EmojiPicker
                 onEmojiClick={handleEmojiClick}
                 searchDisabled
                 skinTonesDisabled
                 // CORREÇÃO LINTER: Adicionar 'name' a todas as categorias
                 categories={[
                    { category: Categories.SMILEYS_PEOPLE, name:"Smileys & Pessoas" },
                    { category: Categories.ANIMALS_NATURE, name: "Animais & Natureza" },
                    { category: Categories.FOOD_DRINK, name: "Comida & Bebida" },
                    { category: Categories.TRAVEL_PLACES, name: "Viagens & Lugares" },
                    { category: Categories.ACTIVITIES, name: "Atividades" },
                    { category: Categories.OBJECTS, name: "Objetos" },
                    { category: Categories.SYMBOLS, name: "Símbolos" },
                    // { category: Categories.FLAGS, name: "Bandeiras" }, // Adicionar se necessário
                 ]}
               />
            </PopoverContent>
         </Popover>

         {/* Botão de Templates */}
         <WhatsappTemplateDialog
           onTemplateInsert={onInsertTemplate}
           disabled={loadingTemplates || isUploading || isRecording}
         />

         <Textarea
           ref={textareaRef}
           value={newMessage}
           onChange={(e) => setNewMessage(e.target.value)}
           placeholder={isRecording ? "Gravando áudio..." : "Digite sua mensagem..."}
           className="flex-grow resize-none bg-input border-input text-foreground placeholder:text-muted-foreground min-h-[40px] max-h-[120px]"
           rows={1}
           onKeyDown={(e) => {
             if (e.key === 'Enter' && !e.shiftKey) {
               e.preventDefault();
               handleSendMessage();
             }
           }}
           disabled={isSendingMessage || isUploading || isRecording}
         />
         <Button
           type="submit"
           size="icon"
           disabled={!newMessage.trim() || isSendingMessage || isUploading || isRecording}
           title="Enviar Mensagem"
         >
           {isSendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
         </Button>
       </form>
    </div>
  );
}

