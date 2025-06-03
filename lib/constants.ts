// lib/constants.ts

export const QUEUE_NAME = 'message-processing';
export const HISTORY_LIMIT = 20; // Temporarily reduced for debugging
export const FRACTIONED_MESSAGE_DELAY = 3000; // Delay fixo de 3s entre mensagens fracionadas
export const DEFAULT_AI_DEBOUNCE_MS = 3000; // Default debounce for AI messages
export const DEFAULT_AI_MODEL = 'openrouter/google/gemini-2.0-flash-001';

// Message content placeholders for media analysis
export const MEDIA_PLACEHOLDERS = {
  AUDIO_RECEIVED: '[Áudio Recebido]',
  IMAGE_RECEIVED: '[Imagem Recebida]',
  MEDIA_RECEIVED: '[Mídia Recebida]',
  AUDIO_TRANSCRIBED: '[Áudio Transcrito]',
  IMAGE_ANALYZED: '[Imagem Analisada]',
  ANALYSIS_PREFIX: '[Análise: ',
  ANALYSIS_EMPTY: '[Análise da mídia: ]',
  AUDIO_TRANSCRIPTION_FAILED: '[Áudio Recebido - Falha na Transcrição]',
};

// AI Message Roles
export const AI_MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
};

// Channel Types
export const CHANNEL_TYPES = {
  WHATSAPP_CLOUDAPI: 'WHATSAPP_CLOUDAPI',
  WHATSAPP_EVOLUTION: 'WHATSAPP_EVOLUTION',
};

// Default language for audio transcription
export const DEFAULT_AUDIO_TRANSCRIPTION_LANGUAGE = 'pt';

// Placeholder for AI models (adjust as needed)
export const AVAILABLE_MODELS = [
  // Add other models here with their tool support
  // Modelos via OpenRouter
  // Modelos OpenAI
  { value: 'openrouter/openai/gpt-4o-mini', tool:true, label: 'OpenAI: GPT-4o Mini' },

  // Modelos Google
  { value: 'openrouter/google/gemini-2.5-pro-preview-03-25', tool:true, label: 'Google: Gemini 2.5 Pro Preview' },
  // { value: 'google/gemini-2.0-flash-exp:free', tool:false, label: 'Google: Gemini 2.0 Flash Exp (Free)' },

  // Modelos DeepSeek
  { value: 'openrouter/deepseek/deepseek-chat-v3-0324:free', tool:true, label: 'DeepSeek: DeepSeek Chat v3 (Free)' },

];