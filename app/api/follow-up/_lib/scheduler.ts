// app/api/follow-up/_lib/scheduler.ts
import { prisma } from '@/lib/db';
import axios from 'axios';
import { lumibotProcessor } from './initializer'; // Importa o processador definido

// <<< IMPORTAÇÕES ESTÁTICAS (NOVO) >>>
import { determineNextAction } from './ai/functionIa';
import { executeAIAction } from './manager';
import { updateFollowUpStatus } from './internal/followUpHelpers';
// <<< FIM IMPORTAÇÕES ESTÁTICAS >>>

console.log("Scheduler Module Reloaded - V_RENAME_TEST", new Date().toISOString());

// Mapa para armazenar timeouts ativos (mensagens e avaliações)
export const activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

// Interface para as mensagens agendadas (mantida)
export interface ScheduledMessage { // EXPORTAR a interface
  followUpId: string;
  messageDbId: string;
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
  metadata?: {
    ai_reason?: string;
    [key: string]: any;
  };
}

// Interface para o processador personalizado (mantida)
export interface MessageProcessor { // EXPORTAR a interface
  process: (dataToSend: { followUpId: string; stepIndex: number; message: string; clientId: string; metadata?: any }) => Promise<boolean>;
}


// Função processAndSendMessage (Inalterada em relação à última versão)
async function processAndSendMessage(messageData: ScheduledMessage): Promise<boolean> {
  try {
    const success = await lumibotProcessor.process({
      followUpId: messageData.followUpId,
      stepIndex: messageData.stepIndex,
      message: messageData.contentToSend,
      clientId: messageData.clientId,
      metadata: {
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

// Função scheduleMessage (Inalterada em relação à última versão)
export async function scheduleMessage(messageData: ScheduledMessage): Promise<string> {
  if (!messageData) throw new Error("messageData ausente em scheduleMessage");
  if (!messageData.followUpId) throw new Error("followUpId ausente em messageData");
  if (!messageData.messageDbId) throw new Error("messageDbId ausente em messageData");

  try {
    const timeoutId = `${messageData.followUpId}-${messageData.messageDbId}`;
    console.log(`[scheduleMessage] Preparando agendamento para ${timeoutId}`);
    if (activeTimeouts.has(timeoutId)) {
      console.log(`[scheduleMessage] Cancelando timeout anterior para ${timeoutId}`);
      clearTimeout(activeTimeouts.get(timeoutId)!);
      activeTimeouts.delete(timeoutId);
    }
    const delay = messageData.scheduledTime.getTime() - Date.now();
    console.log(`[scheduleMessage] Delay calculado para ${timeoutId}: ${delay}ms`);

    if (delay <= 0) {
      console.log(`[scheduleMessage] Delay <= 0 para ${timeoutId}. Chamando sendMessage imediatamente.`);
      try {
        await sendMessage(messageData);
      } catch (immediateSendError: any) {
        console.error(`[scheduleMessage] Erro no envio imediato para ${timeoutId}:`, immediateSendError);
        await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro envio imediato: ${immediateSendError.message}` } }).catch(() => { });
      }
      return timeoutId;
    }

    console.log(`[scheduleMessage] Agendando setTimeout para ${timeoutId} com delay ${delay}ms.`);
    const timeout = setTimeout(async () => {
      console.log(`[setTimeout Msg Callback] INICIANDO para ${timeoutId}. Chamando sendMessage...`);
      try {
        await sendMessage(messageData);
        console.log(`[setTimeout Msg Callback] sendMessage CONCLUÍDO para ${timeoutId}.`);
      } catch (error: any) {
        console.error(`[setTimeout Msg Callback] Erro DENTRO da chamada a sendMessage para ${timeoutId}:`, error);
        try {
          await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro callback timer: ${error.message}` } });
        } catch (dbErr) { }
      } finally {
        if (activeTimeouts.get(timeoutId) === timeout) { // Evitar double delete
          activeTimeouts.delete(timeoutId);
          console.log(`[setTimeout Msg Callback] Timeout removido do mapa para ${timeoutId}.`);
        }
      }
    }, delay);
    activeTimeouts.set(timeoutId, timeout);
    console.log(`[scheduleMessage] Timeout ${timeoutId} armazenado. Mapa atual:`, Array.from(activeTimeouts.keys())); // LOG DETALHADO DO MAPA
    return timeoutId;
  } catch (error) {
    console.error(`[scheduleMessage] Erro GERAL ao agendar mensagem ${messageData.messageDbId}:`, error);
    if (messageData.messageDbId) {
      await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro agendamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}` } }).catch(() => { });
    }
    throw error;
  }
}

// Função sendMessage (Inalterada em relação à última versão)
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
    success = await processAndSendMessage(messageData);
    if (!success) {
      const processorErrorReason = messageData.metadata?.error_reason;
      errorReason = processorErrorReason || 'Falha no processador de mensagens.';
    }
    await prisma.followUpMessage.update({
      where: { id: messageDbId },
      data: { delivered: success, delivered_at: success ? new Date() : null, error_sending: success ? null : errorReason }
    });
    if (!success) {
      console.error(`Falha ao enviar mensagem ${messageDbId}. Follow-up ${followUpId} pausado. Razão: ${errorReason}`);
      // Usar import estático (movido para o topo)
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Falha envio msg: ${errorReason}` });
    } else {
      console.log(`Mensagem ${messageDbId} marcada como entregue.`);
    }
  } catch (error) {
    errorReason = `Erro CRÍTICO sendMessage: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
    console.error(errorReason, error);
    try {
      await prisma.followUpMessage.update({
        where: { id: messageDbId },
        data: { delivered: false, error_sending: errorReason }
      });
      // Usar import estático (movido para o topo)
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: errorReason });
    } catch (dbError) {
      console.error(`Falha ao registrar erro crítico no BD para msg ${messageDbId}:`, dbError);
    }
  }
}


// Função auxiliar de envio para Lumibot (HSM)
export async function enviarHSMLumibot(
  accountId: string,
  conversationId: string, // clientId
  token: string,
  stepData: {
    message_content: string;    // Conteúdo base do template
    template_name: string;      // Nome EXATO do HSM aprovado
    category: string;           // Categoria do template
  },
  clientName: string // Nome real do cliente para usar em {{1}}
): Promise<{ success: boolean, responseData: any }> {

  const apiUrl = `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const headers = { 'Content-Type': 'application/json', 'api_access_token': token };

  // --- Montando o corpo ---
  const body: any = {
    content: stepData.message_content,
    message_type: "outgoing",
    template_params: {
      name: stepData.template_name,
      category: stepData.category || "UTILITY",
      language: "pt_BR",
    }
  };

  // Adiciona processed_params APENAS se a mensagem contiver {{1}} e clientName for válido
  if (stepData.message_content.includes('{{1}}') && clientName) {
    body.template_params.processed_params = { "1": clientName };
  }
  // --- Fim da montagem do corpo ---

  console.log(`[Lumibot Processor] Enviando HSM: ${apiUrl}, Payload:`, JSON.stringify(body));
  try {
    const response = await axios.post(apiUrl, body, { headers });
    console.log(`[Lumibot Processor] Resposta Lumibot (HSM): Status ${response.status}`);
    return { success: response.status >= 200 && response.status < 300, responseData: response.data };
  } catch (err: any) {
    console.error(`[Lumibot Processor] Erro ao enviar HSM (${stepData.template_name}): ${err.message}`, err.response?.data);
    return { success: false, responseData: err.response?.data || { error: err.message } };
  }
}

// Função auxiliar de envio para Lumibot (Texto Livre)
export async function enviarTextoLivreLumibot(accountId: string, conversationId: string, token: string, content: string): Promise<{ success: boolean, responseData: any }> {
  const apiUrl = `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const headers = { 'Content-Type': 'application/json', 'api_access_token': token };
  const body = { content: content, message_type: "outgoing" }; // Confirmar message_type
  console.log(`[Lumibot Processor] Enviando Texto Livre: ${apiUrl}, Payload:`, JSON.stringify(body));
  try {
    const response = await axios.post(apiUrl, body, { headers });
    console.log(`[Lumibot Processor] Resposta Lumibot (Texto Livre): Status ${response.status}`);
    // Usar >= 200 e < 300 para cobrir outros status de sucesso como 201, 202
    return { success: response.status >= 200 && response.status < 300, responseData: response.data };
  } catch (err: any) {
    console.error(`[Lumibot Processor] Erro ao enviar Texto Livre: ${err.message}`, err.response?.data);
    return { success: false, responseData: err.response?.data || { error: err.message } };
  }
}
// --- Fim Funções Auxiliares de Envio ---


export async function scheduleNextEvaluation(
  followUpId: string,
  delayMs: number,
  reason: string
): Promise<void> {
  console.log(`[scheduleNextEvaluation] ENTRY POINT for ${followUpId}. Delay: ${delayMs}ms. Razão: ${reason}`);
  try {
    const effectiveDelay = Math.max(delayMs, 1000);
    const evaluationTime = new Date(Date.now() + effectiveDelay);
    console.log(`[scheduleNextEvaluation] Agendando avaliação para ${followUpId} em ${effectiveDelay / 1000}s.`);

    // Atualiza o follow-up com o próximo tempo de avaliação
    await prisma.followUp.update({
      where: { id: followUpId },
      data: { next_evaluation_at: evaluationTime }
    });

    const evaluationTimeoutId = `eval-${followUpId}`;
    // Limpa timer anterior
    if (activeTimeouts.has(evaluationTimeoutId)) {
      console.log(`[scheduleNextEvaluation] Limpando timer anterior ${evaluationTimeoutId}`);
      clearTimeout(activeTimeouts.get(evaluationTimeoutId)!);
      activeTimeouts.delete(evaluationTimeoutId);
    } else {
      console.log(`[scheduleNextEvaluation] Nenhuma avaliação anterior encontrada para ${evaluationTimeoutId}.`);
    }

    console.log(`[scheduleNextEvaluation] SETTING NEW setTimeout for ${evaluationTimeoutId}, delay: ${effectiveDelay}ms.`);
    const timeout = setTimeout(async () => {
      const logPrefix = `[TIMER CALLBACK ${evaluationTimeoutId}]`;
      console.log(`${logPrefix} --------------------- START CALLBACK ---------------------`);

      // Verifica se este timer ainda é o ativo
      if (activeTimeouts.get(evaluationTimeoutId) !== timeout) {
        console.log(`${logPrefix} Timer obsoleto ignorado.`);
        console.log(`${logPrefix} --------------------- END CALLBACK (OBSOLETO) ---------------------`);
        // NÃO removemos do mapa aqui, pois o timer mais novo já deve ter feito isso
        return;
      }
      // Remove do mapa AGORA que estamos processando ESTE timeout
      activeTimeouts.delete(evaluationTimeoutId);
      console.log(`${logPrefix} Timeout removido do mapa.`);

      try {
        console.log(`${logPrefix} 1. Buscando status atual do FollowUp ${followUpId}...`);
        const currentFollowUp = await prisma.followUp.findUnique({
          where: { id: followUpId },
          select: { status: true }
        });
        console.log(`${logPrefix} 2. Status encontrado: ${currentFollowUp?.status}`);

        if (currentFollowUp?.status === 'active') {
          console.log(`${logPrefix} 3. Status é 'active'. PRE-determineNextAction`);
          // *** Determine Action ***
          const { determineNextAction } = await import('./ai/functionIa'); // Mantendo dinâmico
          console.log(`${logPrefix} 3.1 Importou determineNextAction`); // LOG EXTRA
          let nextAction;
          try {
            nextAction = await determineNextAction(followUpId);
            console.log(`${logPrefix} 4. POST-determineNextAction. Ação:`, JSON.stringify(nextAction, null, 2));
          } catch (determineError) {
            console.error(`${logPrefix} ERRO DENTRO de determineNextAction:`, determineError);
            throw determineError; // Relança para o catch principal do callback
          }


          // *** Execute Action ***
          const { executeAIAction } = await import('./manager'); // Mantendo dinâmico
          console.log(`${logPrefix} 4.1 Importou executeAIAction`); // LOG EXTRA
          console.log(`${logPrefix} 5. >>>>> PRE-executeAIAction <<<<<`);
          try {
            // await executeAIAction(followUpId, nextAction); // <<< CHAMADA CRÍTICA >>>
            console.log(`${logPrefix} 6. >>>>> POST-executeAIAction (SUCESSO) <<<<<`);
            // <<< ADICIONAR console.trace() ONDE O LOG TODO APARECIA >>>
            console.log(`${logPrefix} !!! PONTO DE VERIFICAÇÃO ANTES DA SUPOSTA EXECUÇÃO !!!`);
            console.trace(`${logPrefix} TRACE: Contexto de execução do Timer Callback`);
            // <<< FIM DA ADIÇÃO >>>
          } catch (executeError) {
            console.error(`${logPrefix} ERRO DENTRO de executeAIAction:`, executeError);
            throw executeError;
          }
          console.log(`${logPrefix} 6. >>>>> POST-executeAIAction (NÃO CHAMADO NESTE TESTE) <<<<<`);

        } else {
          console.log(`${logPrefix} FollowUp status é '${currentFollowUp?.status}'. Ignorando avaliação.`);
        }
      } catch (error) {
        console.error(`${logPrefix} ERRO NO CALLBACK DO TIMER para ${followUpId}:`, error);
        try {
          const { updateFollowUpStatus } = await import('./internal/followUpHelpers'); // Mantendo dinâmico
          await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro na avaliação agendada: ${error instanceof Error ? error.message : 'Erro'}` });
        } catch (pauseError) {
          console.error(`${logPrefix} Falha ao pausar follow-up após erro:`, pauseError);
        }
      } finally {
        console.log(`${logPrefix} --------------------- END CALLBACK ---------------------`);
      }
    }, effectiveDelay);

    activeTimeouts.set(evaluationTimeoutId, timeout);
    console.log(`[scheduleNextEvaluation] Timeout ${evaluationTimeoutId} STORED.`);
    
  } catch (error) {
    console.error(`[scheduleNextEvaluation] Erro GERAL ao AGENDAR avaliação para ${followUpId}:`, error);
    try {
      const { updateFollowUpStatus } = await import('./internal/followUpHelpers'); // Mantendo dinâmico
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro agendamento avaliação: ${error instanceof Error ? error.message : 'Erro'}` });
    } catch (pauseError) {
      console.error(`[scheduleNextEvaluation] Falha ao pausar follow-up após erro no agendamento:`, pauseError);
    }
  }
}

export async function scheduleNextEvaluation_V2( // <<< RENOMEADA
  followUpId: string,
  delayMs: number,
  reason: string
): Promise<void> {
  console.log(`[scheduleNextEvaluation_V2] ENTERED for ${followUpId}. Delay: ${delayMs}ms. Razão: ${reason}`); // <<< Log com nome atualizado
  try {
    const effectiveDelay = Math.max(delayMs, 1000);
    const evaluationTime = new Date(Date.now() + effectiveDelay);
    console.log(`[scheduleNextEvaluation_V2] Agendando avaliação para ${followUpId} em ${effectiveDelay / 1000}s.`);
    await prisma.followUp.update({
      where: { id: followUpId },
      data: { next_evaluation_at: evaluationTime }
    });
    const evaluationTimeoutId = `eval-${followUpId}`;
    if (activeTimeouts.has(evaluationTimeoutId)) {
      console.log(`[scheduleNextEvaluation_V2] Limpando timer anterior ${evaluationTimeoutId}`);
      clearTimeout(activeTimeouts.get(evaluationTimeoutId)!);
      activeTimeouts.delete(evaluationTimeoutId);
    } else {
        console.log(`[scheduleNextEvaluation_V2] Nenhuma avaliação anterior encontrada para ${evaluationTimeoutId}.`);
    }

    console.log(`[scheduleNextEvaluation_V2] SETTING NEW setTimeout for ${evaluationTimeoutId}, delay: ${effectiveDelay}ms.`);
    const timeout = setTimeout(async () => {
      const logPrefix = `[TIMER CALLBACK ${evaluationTimeoutId}]`;
      console.log(`${logPrefix} --------------------- START CALLBACK (V2) ---------------------`); // Identificador V2

      if (activeTimeouts.get(evaluationTimeoutId) === timeout) {
          activeTimeouts.delete(evaluationTimeoutId);
          console.log(`${logPrefix} Timeout removido do mapa.`);
      } else {
          console.warn(`${logPrefix} WARNING: Timeout no mapa era diferente ou já removido? Ignorando remoção.`);
      }

      try {
        console.log(`${logPrefix} 1. Buscando status atual...`);
        const currentFollowUp = await prisma.followUp.findUnique({
          where: { id: followUpId },
          select: { status: true }
        });
        console.log(`${logPrefix} 2. Status encontrado: ${currentFollowUp?.status}`);

        if (currentFollowUp?.status === 'active') {
          console.log(`${logPrefix} 3. Status ativo. PRE-determineNextAction`);
          const nextAction = await determineNextAction(followUpId);
          console.log(`${logPrefix} 4. POST-determineNextAction. Ação:`, JSON.stringify(nextAction, null, 2));

          console.log(`${logPrefix} 5. >>>>> PRE-executeAIAction <<<<<`);
          await executeAIAction(followUpId, nextAction); // <<< MANTENDO A CHAMADA REAL AGORA >>>
          console.log(`${logPrefix} 6. >>>>> POST-executeAIAction (SUCESSO) <<<<<`);

        } else {
          console.log(`${logPrefix} FollowUp status é '${currentFollowUp?.status}'. Ignorando avaliação.`);
        }
      } catch (error) {
        console.error(`${logPrefix} ERRO NO CALLBACK DO TIMER:`, error);
        try {
           await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro na avaliação agendada: ${error instanceof Error ? error.message : 'Erro'}` });
        } catch (pauseError) {
           console.error(`${logPrefix} Falha ao pausar follow-up após erro:`, pauseError);
        }
      } finally {
          console.log(`${logPrefix} --------------------- END CALLBACK (V2) ---------------------`);
      }
    }, effectiveDelay);

    activeTimeouts.set(evaluationTimeoutId, timeout);
    console.log(`[scheduleNextEvaluation_V2] Timeout ${evaluationTimeoutId} STORED. Mapa atual:`, Array.from(activeTimeouts.keys())); // LOG DETALHADO DO MAPA

  } catch (error) {
    console.error(`[scheduleNextEvaluation_V2] Erro GERAL ao AGENDAR avaliação:`, error); // Log com nome atualizado
    try {
       await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro agendamento avaliação: ${error instanceof Error ? error.message : 'Erro'}` });
    } catch (pauseError) {
       console.error(`[scheduleNextEvaluation_V2] Falha ao pausar follow-up após erro no agendamento:`, pauseError);
    }
  }
}

// --- Função cancelScheduledMessages (Inalterada em relação à última versão) ---
export async function cancelScheduledMessages(followUpId: string): Promise<void> {
  try {
    let cancelledCount = 0;
    const messagePrefix = `${followUpId}-`;
    const evalPrefix = `eval-${followUpId}`;
    console.log(`[cancelScheduledMessages] Iniciando cancelamento para ${followUpId}`);
    console.log(`[cancelScheduledMessages] Timers ATIVOS ANTES DO LOOP:`, Array.from(activeTimeouts.keys())); // LOG ANTES
    for (const key of activeTimeouts.keys()) {
      if (key.startsWith(messagePrefix) || key === evalPrefix) {
        const timeout = activeTimeouts.get(key);
        if (timeout) {
          clearTimeout(timeout);
          activeTimeouts.delete(key);
          cancelledCount++;
          console.log(`[cancelScheduledMessages] Timeout cancelado e removido: ${key}. Mapa atual:`, Array.from(activeTimeouts.keys())); // LOG DURANTE
        }
      }
    }
    if (cancelledCount > 0) {
      console.log(`[cancelScheduledMessages] Canceladas ${cancelledCount} ações agendadas para followUp ${followUpId}.`);
    } else {
      console.log(`[cancelScheduledMessages] Nenhuma ação agendada encontrada para cancelar para followUp ${followUpId}.`);
    }
    console.log(`[cancelScheduledMessages] Timers ATIVOS APÓS O LOOP:`, Array.from(activeTimeouts.keys())); // LOG DEPOIS
  } catch (error) {
    console.error("[cancelScheduledMessages] Erro ao cancelar ações agendadas:", error);
  }
}

// --- reloadPendingEvaluations (Inalterada em relação à última versão) ---
export async function reloadPendingEvaluations(): Promise<void> {
  try {
    const now = new Date();
    const pendingFollowUps = await prisma.followUp.findMany({
      where: {
        status: 'active',
        next_evaluation_at: { lte: now }
      },
      select: { id: true }
    });
    console.log(`[reloadPendingEvaluations] Recarregando ${pendingFollowUps.length} follow-ups com avaliações pendentes.`);
    for (const followUp of pendingFollowUps) {
      console.log(`[reloadPendingEvaluations] Disparando avaliação pendente para FollowUp ${followUp.id}`);
      // <<< USA IMPORT ESTÁTICO >>>
      determineNextAction(followUp.id)
        .then(action => executeAIAction(followUp.id, action))
        .catch(async (err) => {
          console.error(`[reloadPendingEvaluations] Erro ao reprocessar avaliação pendente para ${followUp.id}:`, err);
          await updateFollowUpStatus(followUp.id, 'paused', { paused_reason: `Erro reprocessamento avaliação: ${err instanceof Error ? err.message : 'Erro'}` });
        });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) {
    console.error("[reloadPendingEvaluations] Erro ao recarregar avaliações pendentes:", error);
  }
}

// --- Inicialização do Scheduler (Inalterada em relação à última versão) ---
function initializeScheduler() {
  if (typeof window === 'undefined') {
    if (!(global as any).__schedulerInitialized) {
      console.log("Inicializando Scheduler...");
      setTimeout(() => {
        console.log("Verificando avaliações pendentes na inicialização...");
        reloadPendingEvaluations().catch(error => {
          console.error("Erro ao recarregar avaliações pendentes:", error);
        });
      }, 5000);
      (global as any).__schedulerInitialized = true;
      console.log("Scheduler inicializado.");
    }
  }
}
initializeScheduler();

// Nota: Cole as implementações de enviarHSMLumibot e enviarTextoLivreLumibot aqui se necessário.