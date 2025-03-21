// app/api/follow-up/_lib/scheduler.ts

// Importações necessárias
import { prisma } from '@/lib/db';
import axios from 'axios'; // Usando axios que já deve estar instalado

// Mapa para armazenar timeouts ativos
const activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

// Interface para as mensagens agendadas
interface ScheduledMessage {
  followUpId: string;
  stepIndex: number;
  message: string;
  scheduledTime: Date;
  clientId: string;
  metadata?: Record<string, any>;
}

// Função para agendar uma mensagem
export async function scheduleMessage(message: ScheduledMessage): Promise<string> {
  try {
    const messageId = `${message.followUpId}-${message.stepIndex}`;
    
    console.log('===== LOG DE AGENDAMENTO DE MENSAGEM =====');
    console.log('FollowUp ID:', message.followUpId);
    console.log('Step Index:', message.stepIndex);
    console.log('Cliente ID:', message.clientId);
    console.log('Conteúdo:', message.message.substring(0, 100));
    console.log('Horário Agendado:', message.scheduledTime);
    console.log('Metadata:', JSON.stringify(message.metadata, null, 2));
    
    // Cancelar qualquer timeout existente para este ID
    if (activeTimeouts.has(messageId)) {
      console.log(`Cancelando timeout existente para mensagem ${messageId}`);
      clearTimeout(activeTimeouts.get(messageId)!);
      activeTimeouts.delete(messageId);
    }
    
    // Calcular o atraso em milissegundos
    const delay = message.scheduledTime.getTime() - Date.now();
    console.log(`Atraso calculado: ${delay}ms (${delay/1000} segundos)`);
    
    // Se o tempo já passou ou é imediato, enviar agora
    if (delay <= 0) {
      console.log('Tempo já passou, enviando mensagem imediatamente');
      await sendMessage(message);
      return messageId;
    }
    
    // Agendar o envio para o futuro
    console.log(`Agendando mensagem para daqui a ${delay/1000} segundos`);
    const timeout = setTimeout(async () => {
      try {
        console.log(`Executando timeout para mensagem ${messageId}`);
        console.log("DEBUG - Antes de chamar sendMessage");
        await sendMessage(message);
        console.log("DEBUG - Após chamar sendMessage");
      } catch (error: any) {
        console.error(`Erro ao enviar mensagem agendada ${messageId}:`, error);
        console.error(`Stack trace do erro:`, error.stack);
      } finally {
        // Remover do mapa após execução
        activeTimeouts.delete(messageId);
        console.log(`DEBUG - Timeout removido do mapa: ${messageId}`);
      }
    }, delay);
    
    // Armazenar o timeout
    activeTimeouts.set(messageId, timeout);
    console.log(`Timeout armazenado com sucesso para mensagem ${messageId}`);
    
    return messageId;
  } catch (error) {
    console.error("Erro ao agendar mensagem:", error);
    throw error;
  }
}

// Função para enviar a mensagem para a API Lumibot
async function sendMessageToLumibot(clientId: string, content: string, metadata?: Record<string, any>): Promise<boolean> {
  try {
    // Configurações fixas para a API conforme solicitado
    const accountId = 10;
    const conversationId = clientId;
    const apiToken = 'Z41o5FJFVEdZJjQaqDz6pYC7';

    // Pega Dados da Conversa do Cliente
    console.log(`===== REQUISIÇÃO GET CONVERSA DO CLIENTE =====`);
    console.log(`Cliente ID: ${conversationId}`);
    console.log(`Endpoint: https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}`);
    
    const conversation = await axios.get(
      `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': apiToken
        }
      }
    );
    
    console.log(`===== RESPOSTA GET CONVERSA DO CLIENTE =====`);
    console.log('Status:', conversation.status);
    console.log('Data:', JSON.stringify(conversation.data, null, 2));
    
    // Extrair parâmetros do template do metadata se disponível
    const templateParams = metadata?.templateParams || {};
    
    // Verificar se a mensagem contém placeholders como {{1}}
    const hasPlaceholders = content.includes('{{') && content.includes('}}');
    
    // Realizar substituição de placeholders na mensagem
    let processedContent = content;
    const clientName = conversation.data.meta.sender.name;

    // Substituir os placeholders
    if (hasPlaceholders) {
      processedContent = content.replace(/\{\{1\}\}/g, clientName);
    }
    
    // Preparar body base da requisição
    const requestBody: any = {
      "content": processedContent,
      "message_type": "outgoing",
      "template_params": {
        "name": templateParams.name || metadata?.template_name || "",
        "category": templateParams.category || metadata?.category || "",
        "language": templateParams.language || "pt_BR"
      }
    };
    
    // DEBUG: Mostrar detalhes da requisição que será enviada
    console.log('Detalhes do envio para Lumibot:');
    console.log('- clientId:', clientId);
    console.log('- templateName:', requestBody.template_params.name);
    console.log('- category:', requestBody.template_params.category);
    
    // Adicionar processed_params apenas se a mensagem contiver placeholders
    if (hasPlaceholders) {
      requestBody.template_params.processed_params = {
        "1": clientName
      };
    }
    
    // Fazer a requisição POST para a API usando axios
    const response = await axios.post(
      `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': apiToken
        }
      }
    );
    
    // Log detalhado da resposta da API
    console.log('===== RESPOSTA DA API LUMIBOT =====');
    console.log('Status:', response.status);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
    return true;
  } catch (error: any) {
    // Definir requestBody aqui para o escopo do bloco catch
    const requestBody = "Dados da requisição não disponíveis no escopo de erro";
    
    console.error(`===== ERRO AO ENVIAR MENSAGEM PARA API LUMIBOT =====`);
    console.error(`Mensagem de erro:`, error.message);
    console.error(`Request URL: https://app.lumibot.com.br/api/v1/accounts/10/conversations/${clientId}/messages`);
    console.error(`Status:`, error.response?.status);
    console.error(`Status Text:`, error.response?.statusText);
    console.error(`Resposta da API:`, JSON.stringify(error.response?.data, null, 2));
    console.error(`Stack:`, error.stack);
    return false;
  }
}

// Função para enviar a mensagem
async function sendMessage(message: ScheduledMessage): Promise<void> {
  try {
    console.log('===== LOG DE ENVIO DE MENSAGEM =====');
    console.log('FollowUp ID:', message.followUpId);
    console.log('Step Index:', message.stepIndex);
    console.log('Cliente ID:', message.clientId);
    
    // Verificar se o follow-up ainda está ativo
    const followUp = await prisma.followUp.findUnique({
      where: { id: message.followUpId }
    });
    
    console.log('Status do follow-up:', followUp?.status);
    
    if (!followUp || followUp.status !== 'active') {
      console.log('Follow-up não está ativo, cancelando envio');
      return;
    }
    
    // Verificar se o cliente já respondeu e mudou de fase
    try {
      if (followUp.metadata) {
        const metadata = JSON.parse(followUp.metadata);
        console.log('Metadata do follow-up:', JSON.stringify(metadata));
        
        if (metadata.processed_by_response && followUp.current_step !== message.stepIndex) {
          console.log('Cliente já respondeu e mudou de fase, cancelando envio');
          return;
        }
      }
    } catch (e) {
      console.error("Erro ao analisar metadata:", e);
    }
    
    // Sempre enviar mensagens reais para a API
    let success = false;
    
    console.log('Enviando mensagem via API Lumibot');
    console.log('Template:', message.metadata?.template_name);
    console.log('Categoria:', message.metadata?.category);
    
    // Enviar a mensagem para a API Lumibot, independentemente do ambiente
    success = await sendMessageToLumibot(message.clientId, message.message, message.metadata);
    console.log('Resultado do envio via Lumibot:', success ? 'SUCESSO' : 'FALHA');
    
    // Atualizar o status da mensagem no banco de dados
    if (success) {
      console.log('Atualizando mensagem como entregue no banco de dados');
      await prisma.followUpMessage.updateMany({
        where: {
          follow_up_id: message.followUpId,
          step: message.stepIndex
        },
        data: {
          delivered: true,
          delivered_at: new Date()
        }
      });
      console.log('Mensagem marcada como entregue com sucesso');
    } else {
      console.log('Não foi possível marcar a mensagem como entregue');
    }
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    throw error;
  }
}

// Interface para o processador personalizado de mensagens
export interface MessageProcessor {
  process: (message: ScheduledMessage) => Promise<boolean>;
}

// Processador que integra com a API Lumibot
const lumibotProcessor: MessageProcessor = {
  process: async (message: ScheduledMessage) => {
    return await sendMessageToLumibot(message.clientId, message.message, message.metadata);
  }
};

// Definir o processador Lumibot como o padrão
let currentProcessor: MessageProcessor = lumibotProcessor;

// Função para cancelar todas as mensagens agendadas para um follow-up
export async function cancelScheduledMessages(followUpId: string): Promise<void> {
  try {
    // Encontrar todas as chaves no mapa que começam com o ID do follow-up
    const keysToRemove = Array.from(activeTimeouts.keys()).filter(key => 
      key.startsWith(`${followUpId}-`)
    );
    
    // Cancelar cada timeout e remover do mapa
    keysToRemove.forEach(key => {
      clearTimeout(activeTimeouts.get(key)!);
      activeTimeouts.delete(key);
    });
  } catch (error) {
    console.error("Erro ao cancelar mensagens agendadas:", error);
    throw error;
  }
}

// Função para carregar e reagendar mensagens pendentes na inicialização do servidor
export async function reloadPendingMessages(): Promise<void> {
  // Implementação existente...
}

// Exportar as funções necessárias
export function setMessageProcessor(processor: MessageProcessor): void {
  currentProcessor = processor;
  console.log("Processador de mensagens personalizado configurado.");
}

export function getMessageProcessor(): MessageProcessor {
  return currentProcessor;
}

// Inicialização - carregar mensagens pendentes na inicialização do servidor
if (typeof window === 'undefined') { // Verificar se estamos no lado do servidor
  // Usar setTimeout para aguardar a inicialização completa do servidor
  setTimeout(() => {
    reloadPendingMessages().catch(error => {
      console.error("Erro ao inicializar o agendador de mensagens:", error);
    });
  }, 5000); // Aguardar 5 segundos após a inicialização
}