// app/api/follow-up/_lib/scheduler.ts
import { prisma } from '@/lib/db';
import axios from 'axios';
// IMPORTAR o processador e helpers necessários
import { lumibotProcessor } from './initializer'; // Importa o processador definido


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

// Função processAndSendMessage (MODIFICADA para usar lumibotProcessor diretamente)
async function processAndSendMessage(messageData: ScheduledMessage): Promise<boolean> {
  // Usa lumibotProcessor diretamente importado
  try {
    const success = await lumibotProcessor.process({
      followUpId: messageData.followUpId,
      stepIndex: messageData.stepIndex, // Mantido para compatibilidade
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
  // **CHECK INICIAL DE SANIDADE (Manter)**
  if (!messageData) throw new Error("messageData ausente em scheduleMessage");
  if (!messageData.followUpId) throw new Error("followUpId ausente em messageData");
  if (!messageData.messageDbId) throw new Error("messageDbId ausente em messageData");
  // ... (outras verificações) ...

  try {
    const timeoutId = `${messageData.followUpId}-${messageData.messageDbId}`;
    console.log(`[scheduleMessage] Preparando agendamento para ${timeoutId}`);

    // Cancelar timeout existente para esta mensagem específica, se houver
    if (activeTimeouts.has(timeoutId)) {
        console.log(`[scheduleMessage] Cancelando timeout anterior para ${timeoutId}`);
        clearTimeout(activeTimeouts.get(timeoutId)!);
        activeTimeouts.delete(timeoutId);
    }

    const delay = messageData.scheduledTime.getTime() - Date.now();
    console.log(`[scheduleMessage] Delay calculado para ${timeoutId}: ${delay}ms`);

    if (delay <= 0) {
      console.log(`[scheduleMessage] Delay <= 0 para ${timeoutId}. Chamando sendMessage imediatamente.`);
      // Adicionar try-catch aqui também para isolar erros
      try {
        await sendMessage(messageData); // Chamada imediata
      } catch (immediateSendError : any ) {
        console.error(`[scheduleMessage] Erro no envio imediato para ${timeoutId}:`, immediateSendError);
        // Registrar erro no BD
        await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro envio imediato: ${immediateSendError.message}` } }).catch(() => { });
      }
      return timeoutId;
    }

    console.log(`[scheduleMessage] Agendando setTimeout para ${timeoutId} com delay ${delay}ms.`);
    const timeout = setTimeout(async () => {
      console.log(`[setTimeout Msg Callback] INICIANDO para ${timeoutId}. Chamando sendMessage...`);
      try {
        await sendMessage(messageData); // Chamada após o delay
        console.log(`[setTimeout Msg Callback] sendMessage CONCLUÍDO para ${timeoutId}.`);
      } catch (error: any) {
        console.error(`[setTimeout Msg Callback] Erro DENTRO da chamada a sendMessage para ${timeoutId}:`, error);
        try {
          await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro callback timer: ${error.message}` } });
        } catch (dbErr) { }
      } finally {
        activeTimeouts.delete(timeoutId);
        console.log(`[setTimeout Msg Callback] Timeout removido do mapa para ${timeoutId}.`);
      }
    }, delay);

    // Armazenar o timeout
    activeTimeouts.set(timeoutId, timeout);
    console.log(`[scheduleMessage] Timeout ${timeoutId} armazenado com sucesso no mapa.`);

    return timeoutId;
  } catch (error) {
      console.error(`[scheduleMessage] Erro GERAL ao agendar mensagem ${messageData.messageDbId}:`, error);
      // Tentar registrar erro no BD
      if (messageData.messageDbId) {
        await prisma.followUpMessage.update({ where: { id: messageData.messageDbId }, data: { delivered: false, error_sending: `Erro agendamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}` } }).catch(() => { });
      }
      throw error; // Relançar para quem chamou saber que falhou
  }
}

// Função sendMessage (mantida, chama processAndSendMessage e agenda próxima avaliação)
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

    // Chama o processador configurado (agora diretamente)
    success = await processAndSendMessage(messageData);
    if (!success) {
      // Tentar obter uma razão mais específica do erro do processador, se disponível
      // (Assumindo que o processador pode adicionar 'error_reason' aos metadados em caso de falha)
      // Se não houver, usar a razão padrão.
      const processorErrorReason = messageData.metadata?.error_reason;
      errorReason = processorErrorReason || 'Falha no processador de mensagens.';
    }

    // Atualiza BD
    await prisma.followUpMessage.update({
      where: { id: messageDbId },
      data: { delivered: success, delivered_at: success ? new Date() : null, error_sending: success ? null : errorReason }
    });

    if (!success) {
      console.error(`Falha ao enviar mensagem ${messageDbId}. Follow-up ${followUpId} pausado. Razão: ${errorReason}`);
      // Importar dinamicamente para evitar ciclo
      const { updateFollowUpStatus } = await import('./internal/followUpHelpers');
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Falha envio msg: ${errorReason}` });
    } else {
      console.log(`Mensagem ${messageDbId} marcada como entregue.`);
      // >>> REMOVIDO AGENDAMENTO DE AVALIAÇÃO DAQUI <<<
      // A avaliação agora é agendada por executeAIAction após chamar scheduleMessage
      // console.log(`Agendando próxima avaliação após envio bem-sucedido...`);
      // await scheduleNextEvaluation(followUpId, defaultNextEvaluationDelay, `Avaliação pós envio bem-sucedido`);
    }

  } catch (error) {
    errorReason = `Erro CRÍTICO sendMessage: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
    console.error(errorReason, error);
    try {
      await prisma.followUpMessage.update({
        where: { id: messageDbId },
        data: { delivered: false, error_sending: errorReason }
      });
      // Importar dinamicamente para evitar ciclo
      const { updateFollowUpStatus } = await import('./internal/followUpHelpers');
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: errorReason });
    } catch (dbError) {
      console.error(`Falha ao registrar erro crítico no BD para msg ${messageDbId}:`, dbError);
    }
  }
}

// --- Funções Auxiliares de Envio (Implementação mantida como antes) ---
// async function enviarHSMLumibot(...) { ... }
// async function enviarTextoLivreLumibot(...) { ... }
// (O código dessas funções está correto e pode ser mantido como na sua versão)
// --- CORREÇÃO: Cole o código dessas duas funções aqui se precisar ---
// Função auxiliar de envio para Lumibot (HSM)
async function enviarHSMLumibot(
  accountId: string,
  conversationId: string, // clientId
  token: string,
  stepData: {
      message_content: string;    // Conteúdo base do template
      template_name: string;      // Nome EXATO do HSM aprovado
      category: string;           // Categoria do template
  },
  clientName: string // Nome real do cliente para usar em {{1}}
): Promise<{success: boolean, responseData: any}> {

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
async function enviarTextoLivreLumibot(accountId: string, conversationId: string, token: string, content: string): Promise<{ success: boolean, responseData: any }> {
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


// --- Função scheduleNextEvaluation (MODIFICADA - Chama executeAIAction) ---
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

    // Gerenciar timeouts de avaliação (similar aos de mensagem)
    const evaluationTimeoutId = `eval-${followUpId}`; // ID único para avaliação
    if (activeTimeouts.has(evaluationTimeoutId)) {
      console.log(`[scheduleNextEvaluation] Cancelando avaliação anterior agendada para ${followUpId}`);
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

          // *** CORREÇÃO AQUI: Usar importação dinâmica ***
          const { determineNextAction } = await import('./ai/functionIa');
          const nextAction = await determineNextAction(followUpId);
          console.log(`[Timer Avaliação] Ação determinada para ${followUpId}:`, nextAction);

          // *** CORREÇÃO AQUI: Chamar executeAIAction ***
          const { executeAIAction } = await import('./manager'); // Ou de onde ela estiver
          await executeAIAction(followUpId, nextAction);
          // console.log(`[Timer Avaliação] TODO: Implementar executeAIAction para ${nextAction.action_type}`); // << REMOVER ESTE LOG

        } else {
          console.log(`[Timer Avaliação] Avaliação agendada para ${followUpId} ignorada (status: ${currentFollowUp?.status})`);
        }
      } catch (error) {
        console.error(`[Timer Avaliação] Erro durante avaliação agendada para ${followUpId}:`, error);
        // Importar dinamicamente para evitar ciclo
        const { updateFollowUpStatus } = await import('./internal/followUpHelpers');
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro na avaliação agendada: ${error instanceof Error ? error.message : 'Erro'}` });
      }
    }, effectiveDelay);

    // Armazenar timeout da avaliação
    activeTimeouts.set(evaluationTimeoutId, timeout);
    console.log(`Timeout de avaliação ${evaluationTimeoutId} armazenado.`);

  } catch (error) {
    console.error(`Erro ao AGENDAR avaliação para ${followUpId}:`, error);
    // Importar dinamicamente para evitar ciclo
    const { updateFollowUpStatus } = await import('./internal/followUpHelpers');
    await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro agendamento avaliação: ${error instanceof Error ? error.message : 'Erro'}` });
  }
}


// --- Função cancelScheduledMessages (MODIFICADA para incluir timers de avaliação) ---
// Função para cancelar todas as mensagens e avaliações agendadas para um follow-up
export async function cancelScheduledMessages(followUpId: string): Promise<void> {
  try {
    let cancelledCount = 0;
    const messagePrefix = `${followUpId}-`; // Prefixo para mensagens
    const evalPrefix = `eval-${followUpId}`; // Prefixo/ID para avaliações

    console.log(`[cancelScheduledMessages] Iniciando cancelamento para ${followUpId}`);

    // Iterar sobre TODOS os timeouts ativos
    for (const key of activeTimeouts.keys()) {
      // Verificar se a chave corresponde a uma mensagem OU a uma avaliação deste follow-up
      if (key.startsWith(messagePrefix) || key === evalPrefix) {
        const timeout = activeTimeouts.get(key);
        if (timeout) {
          clearTimeout(timeout);
          activeTimeouts.delete(key);
          cancelledCount++;
          console.log(`[cancelScheduledMessages] Timeout cancelado e removido: ${key}`);
        }
      }
    }

    if (cancelledCount > 0) {
      console.log(`[cancelScheduledMessages] Canceladas ${cancelledCount} ações (mensagens/avaliações) agendadas para followUp ${followUpId}.`);
    } else {
      console.log(`[cancelScheduledMessages] Nenhuma ação agendada encontrada para cancelar para followUp ${followUpId}.`);
    }
  } catch (error) {
    console.error("[cancelScheduledMessages] Erro ao cancelar ações agendadas:", error);
  }
}
// --- Fim da Função cancelScheduledMessages ---


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

    console.log(`[reloadPendingEvaluations] Recarregando ${pendingFollowUps.length} follow-ups com avaliações pendentes.`);

    for (const followUp of pendingFollowUps) {
      console.log(`[reloadPendingEvaluations] Disparando avaliação pendente para FollowUp ${followUp.id}`);
      // Chamar a função de decisão e execução imediatamente
      // Usar importação dinâmica aqui também
      const { determineNextAction } = await import('./ai/functionIa');
      const { executeAIAction } = await import('./manager');
      const { updateFollowUpStatus } = await import('./internal/followUpHelpers');

      determineNextAction(followUp.id)
        .then(action => executeAIAction(followUp.id, action))
        .catch(async (err) => {
          console.error(`[reloadPendingEvaluations] Erro ao reprocessar avaliação pendente para ${followUp.id}:`, err);
          await updateFollowUpStatus(followUp.id, 'paused', { paused_reason: `Erro reprocessamento avaliação: ${err instanceof Error ? err.message : 'Erro'}` });
        });
      // Pequeno delay para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) {
    console.error("[reloadPendingEvaluations] Erro ao recarregar avaliações pendentes:", error);
  }
}

// --- Inicialização do Scheduler (MODIFICADA para não depender de currentProcessor) ---
function initializeScheduler() {
  if (typeof window === 'undefined') {
    if (!(global as any).__schedulerInitialized) {
      console.log("Inicializando Scheduler...");
      // Define o processador padrão importado do initializer
      // setMessageProcessor(lumibotProcessor); // << REMOVIDO - Não usamos mais setMessageProcessor
      // console.log("Processador Lumibot definido no Scheduler."); // << REMOVIDO
      // Agendar recarregamento de avaliações pendentes
      setTimeout(() => {
        console.log("Verificando avaliações pendentes na inicialização...");
        reloadPendingEvaluations().catch(error => {
          console.error("Erro ao recarregar avaliações pendentes:", error);
        });
      }, 5000); // Aguarda 5 segundos
      (global as any).__schedulerInitialized = true;
      console.log("Scheduler inicializado.");
    } else {
      // console.log("Scheduler já inicializado."); // Log opcional para debug
    }
  }
}

// Chamar a inicialização do scheduler
initializeScheduler();

// Exportar funções públicas se necessário (ex: scheduleMessage, cancelScheduledMessages)
