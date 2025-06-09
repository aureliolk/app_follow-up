import type { IncomingMessage, MessageHandler } from '../types';

export class MessageDispatcher {
  private handlers: MessageHandler[] = [];

  registerHandler(handler: MessageHandler): void {
    this.handlers.push(handler);
    console.log(`Handler registered for ${handler.constructor.name}`);
  }

  async dispatch(message: IncomingMessage): Promise<void> {
    const handler = this.handlers.find(h => h.canHandle(message));
    
    if (!handler) {
      throw new Error(`No handler found for message ${message.id} on channel ${message.channel}`);
    }

    try {
      console.log(`Dispatching message ${message.id} to ${handler.constructor.name}`);
      await handler.process(message);
    } catch (error) {
      console.error(`Error processing message ${message.id}:`, error);
      throw error;
    }
  }
}