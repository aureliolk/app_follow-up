// Tipos base para o sistema de dispatcher
export interface IncomingMessage {
  id: string;
  channel: 'WHATSAPP' | 'EVOLUTION' | 'EMAIL' | 'OTHER';
  type: 'text' | 'media' | 'status' | 'other';
  content: any;
  metadata?: Record<string, any>;
}

export interface MessageHandler {
  canHandle(message: IncomingMessage): boolean;
  process(message: IncomingMessage): Promise<void>;
}