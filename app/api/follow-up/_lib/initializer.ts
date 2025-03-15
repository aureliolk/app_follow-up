// app/api/follow-up/_lib/initializer.ts

import { setMessageProcessor } from './scheduler';
import axios from 'axios';

/**
 * Inicializa a configuração do sistema de follow-up
 */
export function initializeFollowUpSystem() {
  // Configurar o processador de mensagens para a API Lumibot
  setMessageProcessor({
    process: async (message) => {
      try {
        // Configurações fixas para a API
        const accountId = 10;
        const conversationId = 3;
        const apiToken = 'Z41o5FJFVEdZJjQaqDz6pYC7';
        
        // Fazer a requisição POST para a API usando axios
        const response = await axios.post(
          `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
          {
            'content': message.message,
            'message_type': 'outgoing'
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'api_access_token': apiToken
            }
          }
        );
        
        console.log(`Mensagem enviada com sucesso para cliente ${message.clientId}`);
        return true;
      } catch (error) {
        console.error(`Erro ao enviar mensagem para a API Lumibot:`, error);
        return false;
      }
    }
  });
  
  console.log("Sistema de follow-up inicializado com integração da API Lumibot.");
}

// Executar a inicialização se estivermos no lado do servidor
if (typeof window === 'undefined') {
  initializeFollowUpSystem();
}

export default initializeFollowUpSystem;