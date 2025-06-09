// app/workspace/[slug]/conversations/components/ConversationInputArea.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { Loader2, Paperclip, Quote, Send, Smile, Maximize2, Layout, StickyNote } from 'lucide-react';
// Se você não tiver axios ou toast aqui diretamente, remova-os se forem gerenciados em outro lugar.
// import axios from 'axios'; // Se não usado diretamente aqui
import { toast } from 'react-hot-toast';

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from '@/components/ui/scroll-area';

// Remova se Message não for usado diretamente aqui.
// import type { Message } from '@/app/types';
import { cn } from '@/lib/utils';
import WhatsappTemplateDialog from '@/components/whatsapp/WhatsappTemplateDialog'; // Certifique-se que este componente aceita 'triggerButton'
import { useConversationContext } from '@/context/ConversationContext';
import QuickNotesPopover from './QuickNotesPopover';
import AudioRecorderInput from './AudioRecorderInput';


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

export default function ConversationInputArea({
  conversationId,
  workspaceId,
  sendMediaMessage,
  sendTemplateMessage,
  isSendingMessage,
  isUploading,
  loadingTemplates,
  textareaRef,
}: ConversationInputAreaProps) {
  const { sendManualMessage } = useConversationContext();
  const [internalNewMessage, setInternalNewMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('reply');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showQuickNotesPopover, setShowQuickNotesPopover] = useState(false); // Renamed and adjusted for popover control
  const [isAudioRecordingActive, setIsAudioRecordingActive] = useState(false);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInternalNewMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[InputArea] handleFileChange called. isSendingMessage:', isSendingMessage, 'isUploading:', isUploading);
    const file = event.target.files?.[0];
    if (!file || !conversationId) {
      if (event.target) event.target.value = ""; // Limpa o input para permitir selecionar o mesmo arquivo novamente
      return;
    }
    try {
      await sendMediaMessage(conversationId, file);
    } catch (error: any) {
      console.error("Erro capturado no InputArea ao tentar enviar anexo:", error);
    } finally {
      if (event.target) event.target.value = "";
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
    console.log('[InputArea] safeHandleSendMessage called. isSendingMessage:', isSendingMessage, 'isUploading:', isUploading);
    const trimmedMessage = internalNewMessage.trim();
    if (!trimmedMessage || isSendingMessage || !conversationId || (isAudioRecordingActive && messageType === 'reply')) {
      console.log('[InputArea] safeHandleSendMessage: Conditions not met for sending.');
      return;
    }

    try {
      setInternalNewMessage('');
      await sendManualMessage(conversationId, trimmedMessage, workspaceId, messageType === 'private-note');
    } catch (error) {
      console.error('[InputArea Send] Erro ao enviar mensagem:', error);
      // Restaura a mensagem em caso de erro
      setInternalNewMessage(trimmedMessage);
    } finally {
      // Garante que o campo seja desbloqueado e focado
      if (textareaRef.current) {
        setTimeout(() => {
          requestAnimationFrame(() => {
            textareaRef.current?.focus(); // Attempt to focus using requestAnimationFrame after a delay
          });
        }, 100); // A slight delay before attempting focus animation frame
      }
    }
  }, [internalNewMessage, isSendingMessage, conversationId, workspaceId, sendManualMessage, textareaRef, messageType, isAudioRecordingActive]);


  const commonDisabled = isSendingMessage || isUploading;
  // Desabilitar abas se estiver gravando áudio (somente para 'reply')

  const isTextareaDisabled = isSendingMessage || isUploading || (isAudioRecordingActive && messageType === 'reply');
  console.log('[InputArea] Render state. isSendingMessage:', isSendingMessage, 'isUploading:', isUploading, 'isAudioRecordingActive:', isAudioRecordingActive, 'messageType:', messageType, 'isTextareaDisabled:', isTextareaDisabled);

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
              // disabled={tabsDisabled}
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
              onChange={(e) => {
                const value = e.target.value;
                setInternalNewMessage(value);
                if (value.startsWith('/')) {
                  setShowQuickNotesPopover(true);
                } else {
                  setShowQuickNotesPopover(false);
                }
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isSendingMessage && !isUploading && !(isAudioRecordingActive && messageType === 'reply')) {
                  e.preventDefault();
                  safeHandleSendMessage();
                }
              }}
              ref={textareaRef}
              // disabled={isTextareaDisabled}
              onFocus={() => console.log('[InputArea] Textarea focused')}
              onBlur={() => console.log('[InputArea] Textarea blurred')}
            />
          </div>
        </div>
      </Tabs>

      <div className="flex items-center justify-between p-2 sm:p-2 mt-auto bg-card"> {/* bg-card ou bg-background */}
        <div className="flex items-center space-x-0.5 sm:space-x-1">
          {messageType === 'reply' && (
            <>
              {/* Notas rápidas */}
              <QuickNotesPopover
                workspaceId={workspaceId}
                open={showQuickNotesPopover} // Control popover visibility
                onOpenChange={setShowQuickNotesPopover} // Allow popover to control its own open state
                onInsertNote={(content) => {
                  setInternalNewMessage(content); // Replace current content with note
                  setShowQuickNotesPopover(false); // Close popover after insertion
                  textareaRef.current?.focus();
                }}
                disabled={commonDisabled}
                isSearchMode={internalNewMessage.startsWith('/')} // New prop to indicate search mode
              />

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

              <AudioRecorderInput
                conversationId={conversationId}
                sendMediaMessage={sendMediaMessage}
                commonDisabled={commonDisabled}
                isSendingMessage={isSendingMessage}
                isUploading={isUploading}
                onRecordingChange={setIsAudioRecordingActive}
              />

              <WhatsappTemplateDialog
                onSendTemplate={handleSendTemplate}
                disabled={commonDisabled || loadingTemplates || (isAudioRecordingActive && messageType === 'reply')}
                isSendingTemplate={isSendingMessage} // Renomeie para isSending se for genérico
                triggerButton={ // Certifique-se que WhatsappTemplateDialog aceita esta prop
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9" disabled={commonDisabled || loadingTemplates} title="Usar template">
                    <Layout className="h-5 w-5" />
                  </Button>
                }
              />
            </>
          )}
          {/* Espaço reservado para alinhar o botão "Send" quando não há ícones (Private Note) */}
          {(messageType === 'private-note' || (messageType === 'reply' && !isAudioRecordingActive)) &&
            <div className="w-auto h-8 sm:h-9"></div>
          }
        </div>

        <Button
          onClick={safeHandleSendMessage}
          // disabled={isSendingMessage || isUploading || (isRecording && messageType === 'reply') || !internalNewMessage.trim()} // Use isSendingMessage directly
          className={cn(
            "min-w-[90px] sm:min-w-[110px] h-8 sm:h-9 px-3 py-2 text-xs sm:text-sm", // Ajuste de tamanho
            messageType === 'private-note'
              ? "bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white dark:text-primary-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isSendingMessage || isUploading ? ( // Show loader if isSendingMessage or isUploading (simplified condition)
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
