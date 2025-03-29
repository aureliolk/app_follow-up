// app/api/follow-up/_lib/scheduler.ts
import { prisma } from '@/lib/db';
import axios from 'axios';
// IMPORTAR o processador e helpers necessários
import { lumibotProcessor } from './initializer'; // Importa o processador definido
import { updateFollowUpStatus } from './internal/followUpHelpers';
import { determineNextAction } from './ai/functionIa'; // Para reload
import { executeAIAction } from './manager'; // Para reload

// Mapa para armazenar timeouts ativos (mensagens e avaliações)
export const activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

// Interface para as mensagens agendadas (mantida)
export interface ScheduledMessage { // EXPORTAR a interface
  followUpId: string;
  messageDbId: string; // <<< JÁ ESTÁ CORRETO AQUI! MANTENHA COMO CAMPO PRÓPRIO.
  stepIndex: number;
  contentToSend: string;
  scheduledTime: Date;
  clientId: string;
  accountIdLumibot: string;
  tokenAgentLumibot: string;
  isAIMessage: boolean;
  isHSM: boolean;
  templateNameWhatsapp?: string | null;
  templateName?: string; // Nome interno
  templateCategory?: string;
  templateParams?: Record<string, string>;

  // 'metadata' agora é só para dados extras/opcionais
  metadata?: {
    ai_reason?: string; // Razão da IA (para logs)
    [key: string]: any; // Permite outros dados, se necessário
  };
}

// Interface para o processador personalizado (mantida)
export interface MessageProcessor { // EXPORTAR a interface
  process: (dataToSend: { followUpId: string; stepIndex: number; message: string; clientId: string; metadata?: any }) => Promise<boolean>;
}

// Variável para guardar o processador atual (mantida)
let currentProcessor: MessageProcessor | null = null;

// Função para definir o processador (mantida e exportada)
export function setMessageProcessor(processor: MessageProcessor): void {
  if (currentProcessor) {
    console.warn("Aviso: Tentando redefinir o MessageProcessor. Isso não é usual.");
  }
  currentProcessor = processor;
  console.log("MessageProcessor configurado com sucesso.");
}

// Função para obter o processador (mantida e exportada)
export function getMessageProcessor(): MessageProcessor | null {
  return currentProcessor;
}

// Função processAndSendMessage (mantida como antes, chama getMessageProcessor)
async function processAndSendMessage(messageData: ScheduledMessage): Promise<boolean> {
  const processor = getMessageProcessor();
  if (!processor) {
    console.error(`ERRO CRÍTICO: Nenhum processador de mensagens configurado ao tentar enviar msg ${messageData.messageDbId}.`);
    await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: 'Erro Interno: Processador de msg não configurado' } }).catch(dbErr => { });
    return false;
  }
  try {
    // Passa os metadados completos para o processador ter acesso a isHSM etc.
    const success = await processor.process({
      followUpId: messageData.followUpId,
      stepIndex: messageData.stepIndex,
      message: messageData.contentToSend,
      clientId: messageData.clientId,
      metadata: { // Passar todos os metadados relevantes
        messageDbId: messageData.messageDbId,
        isHSM: messageData.isHSM,
        templateNameWhatsapp: messageData.templateNameWhatsapp,
        templateName: messageData.templateName,
        templateCategory: messageData.templateCategory,
        templateParams: messageData.templateParams,
        isAIMessage: messageData.isAIMessage,
        ...(messageData.metadata || {})
      }
    });
    return success;
  } catch (error) {
    console.error(`Erro ao executar processador de mensagens para msg ${messageData.messageDbId}:`, error);
    await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro Processador: ${error instanceof Error ? error.message : 'Erro desconhecido'}` } }).catch(dbErr => { });
    return false;
  }
}

// Função scheduleMessage (mantida como antes)
export async function scheduleMessage(messageData: ScheduledMessage): Promise<string> {
  // ... (lógica como antes, chama sendMessage no timeout) ...
  // **CHECK INICIAL DE SANIDADE (Manter)**
  if (!messageData) throw new Error("messageData ausente em scheduleMessage");
  // ... (outras verificações) ...
  try {
    const timeoutId = `${messageData.followUpId}-${messageData.messageDbId}`;
    console.log(`[scheduleMessage] Preparando agendamento para ${timeoutId}`);
    // ... (logs, cancelamento de timeout existente) ...
    const delay = messageData.scheduledTime.getTime() - Date.now();
    console.log(`[scheduleMessage] Delay calculado para ${timeoutId}: ${delay}ms`);

    if (delay <= 0) {
      console.log(`[scheduleMessage] Delay <= 0 para ${timeoutId}. Chamando sendMessage imediatamente.`);
      // Adicionar try-catch aqui também para isolar erros
      try {
        await sendMessage(messageData);
      } catch (immediateSendError : any ) {
        console.error(`[scheduleMessage] Erro no envio imediato para ${timeoutId}:`, immediateSendError);
        // Registrar erro no BD
        await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro envio imediato: ${immediateSendError.message}` } }).catch(() => { });
      }
      return timeoutId;
    }

    console.log(`[scheduleMessage] Agendando setTimeout para ${timeoutId} com delay ${delay}ms.`);
    const timeout = setTimeout(async () => {
      // **** LOG DENTRO DO CALLBACK ****
      console.log(`[setTimeout Callback] INICIANDO para ${timeoutId}. Chamando sendMessage...`);
      try {
        await sendMessage(messageData);
        console.log(`[setTimeout Callback] sendMessage CONCLUÍDO para ${timeoutId}.`);
      } catch (error: any) {
        console.error(`[setTimeout Callback] Erro DENTRO da chamada a sendMessage para ${timeoutId}:`, error);
        // O erro já deve ser tratado dentro de sendMessage, mas logamos aqui também.
        // Tentar registrar erro no BD como fallback
        try {
          await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro callback timer: ${error.message}` } });
        } catch (dbErr) { }

      } finally {
        activeTimeouts.delete(timeoutId);
        console.log(`[setTimeout Callback] Timeout removido do mapa para ${timeoutId}.`);
      }
    }, delay);

    // Armazenar o timeout
    activeTimeouts.set(timeoutId, timeout);
    console.log(`[scheduleMessage] Timeout ${timeoutId} armazenado com sucesso no mapa.`);

    return timeoutId;
  } catch (error) { /* ... tratamento de erro ... */ throw error; }
}

// Função sendMessage (mantida, chama processAndSendMessage)
async function sendMessage(messageData: ScheduledMessage): Promise<void> {
  const { followUpId, messageDbId, metadata } = messageData;
  let success = false;
  let errorReason = 'Erro desconhecido no envio';

  try {
    console.log(`===== INICIANDO ENVIO DE MENSAGEM (DB ID: ${messageDbId}) =====`);
    const followUp = await prisma.followUp.findUnique({ where: { id: followUpId }, select: { status: true } });

    if (!followUp || followUp.status !== 'active') {
      errorReason = `Envio cancelado: Follow-up ${followUpId} não ativo (status: ${followUp?.status}).`;
      console.log(errorReason);
      await prisma.followUpMessage.update({ where: { id: messageDbId }, data: { delivered: false, error_sending: errorReason } }).catch(() => { });
      return;
    }

    // Chama o processador configurado
    success = await processAndSendMessage(messageData);
    if (!success) {
      errorReason = metadata?.error_reason || 'Falha no processador de mensagens.'; // Tenta pegar razão do metadata se o processador a definir
    }

    // Atualiza BD e agenda próxima avaliação se sucesso
    await prisma.followUpMessage.update({
      where: { id: messageDbId },
      data: { delivered: success, delivered_at: success ? new Date() : null, error_sending: success ? null : errorReason }
    });

    if (!success) {
      console.error(`Falha ao enviar mensagem ${messageDbId}. Follow-up ${followUpId} pausado. Razão: ${errorReason}`);
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Falha envio msg: ${errorReason}` });
    } else {
      console.log(`Mensagem ${messageDbId} marcada como entregue.`);
      // Agendar próxima avaliação
      const defaultNextEvaluationDelay = 60 * 60 * 1000; // 1 hora
      await scheduleNextEvaluation(followUpId, defaultNextEvaluationDelay, `Avaliação pós envio bem-sucedido`);
    }

  } catch (error) {
    errorReason = `Erro CRÍTICO sendMessage: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
    console.error(errorReason, error);
    try {
      await prisma.followUpMessage.update({
        where: { id: messageDbId },
        data: { delivered: false, error_sending: errorReason }
      });
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: errorReason });
    } catch (dbError) {
      console.error(`Falha ao registrar erro crítico no BD para msg ${messageDbId}:`, dbError);
    }
  }
}


// --- Funções Auxiliares de Envio (Implementar corretamente) ---
async function enviarHSMLumibot(
  accountId: string,
  conversationId: string, // clientId
  token: string,
  // Receber dados relevantes do passo/template
  stepData: {
      message_content: string;    // Conteúdo base do template
      template_name: string;      // Nome EXATO do HSM aprovado
      category: string;           // Categoria do template
  },
  clientName: string // Nome real do cliente para usar em {{1}}
): Promise<{success: boolean, responseData: any}> {

  const apiUrl = `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const headers = { 'Content-Type': 'application/json', 'api_access_token': token };

  // --- Montando o corpo EXATAMENTE como especificado ---
  const body = {
      content: stepData.message_content, // Conteúdo base do template do seu BD
      message_type: "outgoing",         // Fixo
      template_params: {
        name: stepData.template_name,         // Nome EXATO do HSM
        category: stepData.category || "UTILITY", // Categoria do passo (com fallback)
        language: "pt_BR",                // Fixo
        processed_params : {
          "1": clientName                 // Nome do cliente para substituir {{1}}
          // Adicionar "2": valor2, etc., se o template tiver mais variáveis
        }
      }
    };
  // --- Fim da montagem do corpo ---

  console.log(`[Lumibot Processor] Enviando HSM: ${apiUrl}, Payload:`, JSON.stringify(body));
  try {
      const response = await axios.post(apiUrl, body, { headers });
      console.log(`[Lumibot Processor] Resposta Lumibot (HSM): Status ${response.status}`);
      // Usar >= 200 e < 300 para cobrir outros status de sucesso como 201, 202
      return { success: response.status >= 200 && response.status < 300, responseData: response.data };
  } catch (err: any) {
      console.error(`[Lumibot Processor] Erro ao enviar HSM (${stepData.template_name}): ${err.message}`, err.response?.data);
      return { success: false, responseData: err.response?.data || { error: err.message } };
  }
}

async function enviarTextoLivreLumibot(accountId: string, conversationId: string, token: string, content: string): Promise<boolean> {
  const apiUrl = `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const headers = { 'Content-Type': 'application/json', 'api_access_token': token };
  const body = { content: content, message_type: "outgoing" }; // outgoing ou text? Confirmar
  console.log(`Enviando Texto Livre: ${apiUrl}, Payload:`, JSON.stringify(body));
  try {
    const response = await axios.post(apiUrl, body, { headers });
    console.log(`Resposta Lumibot (Texto Livre): Status ${response.status}`);
    return response.status === 200 || response.status === 201;
  } catch (err: any) {
    console.error(`Erro ao enviar Texto Livre: ${err.message}`, err.response?.data);
    return false;
  }
}

// --- Função scheduleNextEvaluation (IMPLEMENTAÇÃO COMPLETA AQUI) ---
// Agenda a PRÓXIMA VEZ que a IA deve AVALIAR o follow-up
export async function scheduleNextEvaluation(
  followUpId: string,
  delayMs: number,
  reason: string // Motivo pelo qual a avaliação está sendo agendada
): Promise<void> {
  try {
    const effectiveDelay = Math.max(delayMs, 1000); // Mínimo 1 segundo
    const evaluationTime = new Date(Date.now() + effectiveDelay);

    console.log(`Agendando PRÓXIMA AVALIAÇÃO da IA para followUp ${followUpId} em ${effectiveDelay / 1000}s. Motivo: ${reason}`);

    // Atualiza o follow-up com o próximo tempo de avaliação
    await prisma.followUp.update({
      where: { id: followUpId },
      data: { next_evaluation_at: evaluationTime } // Certifique-se que este campo existe no schema FollowUp
    });

    // O agendamento real PODE ser feito por um job externo (melhor para produção)
    // OU continuar usando setTimeout para desenvolvimento/simplicidade:

    // Gerenciar timeouts de avaliação (similar aos de mensagem)
    const evaluationTimeoutId = `eval-${followUpId}`; // ID único para avaliação
    if (activeTimeouts.has(evaluationTimeoutId)) {
      console.log(`Cancelando avaliação anterior agendada para ${followUpId}`);
      clearTimeout(activeTimeouts.get(evaluationTimeoutId)!);
      activeTimeouts.delete(evaluationTimeoutId);
    }

    const timeout = setTimeout(async () => {
      activeTimeouts.delete(evaluationTimeoutId); // Remover antes de executar
      try {
        const currentFollowUp = await prisma.followUp.findUnique({
          where: { id: followUpId },
          select: { status: true }
        });

        if (currentFollowUp?.status === 'active') {
          console.log(`[Timer Avaliação] Executando avaliação agendada para FollowUp ${followUpId}`);
          // Chama a função central de decisão da IA
          // Importar dinamicamente para evitar ciclos, se necessário, ou garantir importação no topo
          const { determineNextAction } = await import('./ai/functionIa');
          const nextAction = await determineNextAction(followUpId);
          console.log(`[Timer Avaliação] Ação determinada para ${followUpId}:`, nextAction);

          // Chamar a função que executa a ação
          const { executeAIAction } = await import('../_lib/manager'); // Ou de onde ela estiver
          await executeAIAction(followUpId, nextAction);

        } else {
          console.log(`[Timer Avaliação] Avaliação agendada para ${followUpId} ignorada (status: ${currentFollowUp?.status})`);
        }
      } catch (error) {
        console.error(`[Timer Avaliação] Erro durante avaliação agendada para ${followUpId}:`, error);
        // Importar updateFollowUpStatus aqui se necessário
        const { updateFollowUpStatus } = await import('./internal/followUpHelpers');
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro na avaliação agendada: ${error instanceof Error ? error.message : 'Erro'}` });
      }
    }, effectiveDelay);

    // Armazenar timeout da avaliação
    activeTimeouts.set(evaluationTimeoutId, timeout);
    console.log(`Timeout de avaliação ${evaluationTimeoutId} armazenado.`);


  } catch (error) {
    console.error(`Erro ao AGENDAR avaliação para ${followUpId}:`, error);
    // Importar updateFollowUpStatus aqui se necessário
    const { updateFollowUpStatus } = await import('./internal/followUpHelpers');
    await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro agendamento avaliação: ${error instanceof Error ? error.message : 'Erro'}` });
  }
}


// --- Função cancelScheduledMessages (DEFINIÇÃO PRECISA ESTAR AQUI) ---
// Função para cancelar todas as mensagens e avaliações agendadas para um follow-up
export async function cancelScheduledMessages(followUpId: string): Promise<void> {
  try {
    let cancelledCount = 0;
    const prefix = `${followUpId}-`;
    const evalPrefix = `eval-${followUpId}`;

    // Iterar sobre TODOS os timeouts ativos
    for (const key of activeTimeouts.keys()) {
      // Verificar se a chave corresponde a uma mensagem OU a uma avaliação deste follow-up
      if (key.startsWith(prefix) || key === evalPrefix) {
        const timeout = activeTimeouts.get(key);
        if (timeout) {
          clearTimeout(timeout);
          activeTimeouts.delete(key);
          cancelledCount++;
          console.log(`Timeout cancelado e removido: ${key}`);
        }
      }
    }

    if (cancelledCount > 0) {
      console.log(`Canceladas ${cancelledCount} ações (mensagens/avaliações) agendadas para followUp ${followUpId}.`);
    } else {
      console.log(`Nenhuma ação agendada encontrada para cancelar para followUp ${followUpId}.`);
    }
  } catch (error) {
    console.error("Erro ao cancelar ações agendadas:", error);
  }
}



// --- Fim da Função cancelScheduledMessages ---
// NOTE: reloadPendingMessages precisará ser adaptada para o novo fluxo com 'next_evaluation_at'
export async function reloadPendingMessages(): Promise<void> {
  console.warn("TODO: Implementar reloadPendingMessages para o novo fluxo baseado em next_evaluation_at");
  // A lógica antiga que reagendava mensagens individuais não se aplica diretamente.
  // O ideal é buscar followups ativos com next_evaluation_at no passado e chamar determineNextAction para eles.
}


// --- reloadPendingMessages (Adaptada para avaliações) ---
export async function reloadPendingEvaluations(): Promise<void> {
  try {
    const now = new Date();
    // Buscar follow-ups ativos que DEVERIAM ter sido avaliados
    const pendingFollowUps = await prisma.followUp.findMany({
      where: {
        status: 'active',
        next_evaluation_at: { lte: now } // Menor ou igual a agora
      },
      select: { id: true } // Pegar apenas IDs
    });

    console.log(`Recarregando ${pendingFollowUps.length} follow-ups com avaliações pendentes.`);

    for (const followUp of pendingFollowUps) {
      console.log(`Disparando avaliação pendente para FollowUp ${followUp.id}`);
      // Chamar a função de decisão e execução imediatamente
      determineNextAction(followUp.id)
        .then(action => executeAIAction(followUp.id, action))
        .catch(async (err) => {
          console.error(`Erro ao reprocessar avaliação pendente para ${followUp.id}:`, err);
          await updateFollowUpStatus(followUp.id, 'paused', { paused_reason: `Erro reprocessamento avaliação: ${err.message}` });
        });
      // Pequeno delay para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) {
    console.error("Erro ao recarregar avaliações pendentes:", error);
  }
}

// --- Inicialização do Scheduler ---
function initializeScheduler() {
  if (typeof window === 'undefined') {
    if (!(global as any).__schedulerInitialized) {
      console.log("Inicializando Scheduler...");
      // Define o processador padrão importado do initializer
      setMessageProcessor(lumibotProcessor);
      console.log("Processador Lumibot definido no Scheduler.");
      // Agendar recarregamento de avaliações pendentes
      setTimeout(() => {
        console.log("Verificando avaliações pendentes na inicialização...");
        reloadPendingEvaluations().catch(error => {
          console.error("Erro ao recarregar avaliações pendentes:", error);
        });
      }, 5000); // Aguarda 5 segundos
      (global as any).__schedulerInitialized = true;
      console.log("Scheduler inicializado.");
    }
  }
}

// Chamar a inicialização do scheduler
initializeScheduler();