import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '../../../../../components/ui/button';
import { Mic, PauseCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { cn } from '../../../../../lib/utils';

interface AudioRecorderInputProps {
  conversationId: string;
  sendMediaMessage: (conversationId: string, file: File) => Promise<void>;
  commonDisabled: boolean;
  isSendingMessage: boolean;
  isUploading: boolean;
  onRecordingChange: (isRecording: boolean) => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export default function AudioRecorderInput({
  conversationId,
  sendMediaMessage,
  commonDisabled,
  isSendingMessage,
  isUploading,
  onRecordingChange,
}: AudioRecorderInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'prompting' | 'granted' | 'denied'>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleSendAudioFile = async (audioFile: File) => {
    console.log('[AudioRecorderInput] handleSendAudioFile called. isSendingMessage:', isSendingMessage, 'isUploading:', isUploading);
    if (!conversationId) {
      toast.error("Conversa não selecionada.");
      return;
    }
    try {
      await sendMediaMessage(conversationId, audioFile);
    } catch (error: any) {
      console.error("Erro capturado no AudioRecorderInput ao tentar enviar áudio:", error);
    } finally {
      // Any cleanup if needed
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

        if (audioChunksRef.current.length === 0) {
          console.warn("[AudioRecord] Gravação parada sem dados de áudio.");
          setIsRecording(false);
          onRecordingChange(false);
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const filenameSuffix = mimeType.split('/')[1].split(';')[0];
        const filename = `audio_gravado_${format(new Date(), 'yyyyMMdd_HHmmss')}.${filenameSuffix}`;
        const audioFile = new File([audioBlob], filename, { type: mimeType });

        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        onRecordingChange(false);
        await handleSendAudioFile(audioFile);
      };

      recorder.onerror = (event) => {
        console.error("[AudioRecord] Erro no MediaRecorder:", event);
        toast.error("Erro durante a gravação.");
        setIsRecording(false);
        onRecordingChange(false);
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        setRecordingDuration(0);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      onRecordingChange(true);
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
      onRecordingChange(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      setIsRecording(false);
      onRecordingChange(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      setRecordingDuration(0);
    }
  };

  const handleMicClick = () => {
    console.log('[AudioRecorderInput] handleMicClick called. isRecording:', isRecording, 'isSendingMessage:', isSendingMessage, 'isUploading:', isUploading);
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <>
      {!isRecording && (
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9" onClick={handleMicClick} disabled={commonDisabled || permissionStatus === 'prompting'} title="Gravar áudio">
          <Mic className="h-5 w-5" />
        </Button>
      )}
      {isRecording && (
        <div className="flex items-center gap-2 text-muted-foreground px-1 h-8 sm:h-9">
          <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-mono">{formatDuration(recordingDuration)}</span>
          <Button variant="ghost" size="icon" onClick={stopRecording} title="Parar Gravação" className="text-red-500 hover:text-red-600 h-8 w-8 sm:h-9 sm:w-9">
            <PauseCircle className="h-5 w-5" />
          </Button>
        </div>
      )}
    </>
  );
}