// app/api/follow-up/_lib/scheduler.refactor.ts
// Versão refatorada do agendador de mensagens

import { prisma } from '@/lib/db';
import axios from 'axios';

// Mapa para armazenar timeouts ativos
export const activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

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
        await sendMessage(message);
      } catch (error: any) {
        console.error(`Erro ao enviar mensagem agendada ${messageId}:`, error);
        console.error(`Stack trace do erro:`, error.stack);
      } finally {
        // Remover do mapa após execução
        activeTimeouts.delete(messageId);
        console.log(`Timeout removido do mapa: ${messageId}`);
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
    
    return true;
  } catch (error: any) {
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

// Função para enviar a mensagem - refatorada para usar campos estruturados
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
    
    // Verificar se o cliente já respondeu e mudou de fase usando os campos estruturados
    if (followUp.processed_by_response && followUp.current_step !== message.stepIndex) {
      console.log('Cliente já respondeu e mudou de fase, cancelando envio');
      return;
    }
    
    // Sempre enviar mensagens reais para a API
    let success = false;
    
    console.log('Enviando mensagem via API Lumibot');
    console.log('Template:', message.metadata?.template_name);
    console.log('Categoria:', message.metadata?.category);
    
    // Enviar a mensagem para a API Lumibot
    success = await sendMessageToLumibot(message.clientId, message.message, message.metadata);
    console.log('Resultado do envio via Lumibot:', success ? 'SUCESSO' : 'FALHA');
    
    // Atualizar o status da mensagem no banco de dados
    if (success) {
      console.log('Atualizando mensagem como entregue no banco de dados');
      await prisma.followUpMessage.updateMany({
        where: {
          follow_up_id: message.followUpId,
          delivered: false
        },
        data: {
          delivered: true,
          delivered_at: new Date()
        }
      });
      console.log('Mensagem marcada como entregue com sucesso');
      
      // Verificar se o follow-up está pausado aguardando envio de mensagens
      const followUp = await prisma.followUp.findUnique({
        where: { id: message.followUpId }
      });
      
      if (followUp && followUp.status === 'active' && 
          followUp.paused_reason && followUp.paused_reason.includes('Aguardando envio de')) {
        
        // Verificar se ainda existem mensagens pendentes para este estágio
        // É importante encontrar TODAS as mensagens do estágio, não apenas as associadas ao passo atual
        const pendingMessages = await prisma.followUpMessage.findMany({
          where: {
            follow_up_id: message.followUpId,
            delivered: false
          }
        });
        
        // Se não houver mais mensagens pendentes, retomar o follow-up automaticamente
        if (pendingMessages.length === 0) {
          console.log(`Todas as mensagens do estágio "${message.metadata?.stage_name}" foram entregues, retomando transição de estágio`);
          
          // Importar a função dinamicamente para evitar referência circular
          const { processStageTransition } = await import('./manager');
          
          // Verificar qual o próximo estágio - usando o relacionamento correto
          const campaign = await prisma.followUpCampaign.findUnique({
            where: { id: followUp.campaign_id },
            include: {
              stages: {
                orderBy: { order: 'asc' }
              }
            }
          });
          
          // Usar os estágios do relacionamento campaign->stages
          const stages = campaign?.stages || [];
          
          // Encontrar o índice do estágio atual
          const currentStageIndex = stages.findIndex(s => s.id === followUp.current_stage_id);
          
          // Se encontrou o estágio atual e existe um próximo estágio
          if (currentStageIndex >= 0 && currentStageIndex < stages.length - 1) {
            const nextStage = stages[currentStageIndex + 1];
            
            // Registrar mensagem de sistema sobre retomada automática
            await prisma.followUpMessage.create({
              data: {
                follow_up_id: message.followUpId,
                step: -1,
                content: `Todas mensagens do estágio "${message.metadata?.stage_name}" foram entregues, retomando transição para estágio "${nextStage.name}"`,
                category: "System",
                sent_at: new Date(),
                delivered: true,
                delivered_at: new Date(),
                funnel_stage: message.metadata?.stage_name
              }
            });
            
            // Atualizar follow-up para continuar o fluxo
            await prisma.followUp.update({
              where: { id: message.followUpId },
              data: {
                waiting_for_response: false,
                paused_reason: null
              }
            });
            
            // Chamar função para continuar o processamento
            try {
              // Aguardar um breve momento para garantir que tudo seja salvo no banco
              setTimeout(async () => {
                try {
                  // Verificar novamente se o follow-up ainda está ativo
                  const currentFollowUp = await prisma.followUp.findUnique({
                    where: { id: message.followUpId }
                  });
                  
                  if (currentFollowUp && currentFollowUp.status === 'active') {
                    console.log(`Retomando transição de estágio para follow-up ${message.followUpId} após entrega de todas as mensagens`);
                    
                    // Importar apenas a função que precisamos e verificar se ela existe
                    const manager = await import('./manager');
                    
                    if (typeof manager.advanceToNextStep === 'function') {
                      await manager.advanceToNextStep(message.followUpId);
                    } else {
                      // Fallback: se não conseguir importar a função específica, faz a atualização manual
                      console.log(`Função advanceToNextStep não encontrada, tentando método alternativo`);
                      
                      // Atualizar manualmente o follow-up
                      await prisma.followUp.update({
                        where: { id: message.followUpId },
                        data: {
                          status: 'active',
                          waiting_for_response: false,
                          paused_reason: null
                        }
                      });
                      
                      // Criar mensagem de sistema informando
                      await prisma.followUpMessage.create({
                        data: {
                          follow_up_id: message.followUpId,
                          step: -1,
                          content: `Sistema retomou transição de estágio automaticamente após entrega de mensagens pendentes`,
                          category: "System",
                          sent_at: new Date(),
                          delivered: true,
                          delivered_at: new Date(),
                          funnel_stage: message.metadata?.stage_name
                        }
                      });
                    }
                  } else {
                    console.log(`Follow-up ${message.followUpId} não está mais ativo, não avançando automaticamente`);
                  }
                } catch (err) {
                  console.error('Erro ao avançar automaticamente após entrega de mensagens:', err);
                }
              }, 1000);
            } catch (err) {
              console.error('Erro ao programar avanço automático:', err);
            }
          }
        }
      }
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
  try {
    // Buscar todos os follow-ups ativos com próxima mensagem agendada
    const activeFollowUps = await prisma.followUp.findMany({
      where: {
        status: 'active',
        next_message_at: { not: null }
      },
      include: {
        messages: {
          where: {
            delivered: false
          },
          orderBy: { step_id: 'asc' }
        }
      }
    });

    console.log(`Recarregando ${activeFollowUps.length} follow-ups ativos com mensagens pendentes`);

    for (const followUp of activeFollowUps) {
      // Verificar se temos mensagens não entregues para este follow-up
      if (followUp.messages.length === 0) continue;

      // Obter a próxima mensagem a ser enviada
      const nextMessage = followUp.messages[0];
      
      // Agendar o envio
      await scheduleMessage({
        followUpId: followUp.id,
        stepIndex: 0, // Valor padrão, pois step foi removido do modelo
        message: nextMessage.content,
        scheduledTime: followUp.next_message_at || new Date(),
        clientId: followUp.client_id,
        metadata: {
          template_name: "default", // Valores padrão já que os campos foram removidos
          category: "Utility"
        }
      });

      console.log(`Reagendado envio da mensagem para follow-up ${followUp.id}`);
    }
  } catch (error) {
    console.error("Erro ao recarregar mensagens pendentes:", error);
  }
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