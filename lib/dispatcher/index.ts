import { MessageDispatcher } from './base/messageDispatcher';
import { WhatsAppTextHandler } from './handlers/whatsappTextHandler';

// Cria instância singleton do dispatcher
const dispatcher = new MessageDispatcher();

// Registra handlers padrão
dispatcher.registerHandler(new WhatsAppTextHandler());

export default dispatcher;