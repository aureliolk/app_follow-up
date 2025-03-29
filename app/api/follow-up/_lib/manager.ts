// app/api/follow-up/_lib/manager.ts
// Versão refatorada do gerenciador de follow-up

import { prisma } from '@/lib/db';
import { scheduleMessage, cancelScheduledMessages } from './scheduler';
// CORRIGIDO: Importar determineNextAction em vez de decideNextStepWithAI
import { analyzeClientResponse, determineNextAction, generateAIResponse, AIAction, personalizeMessageContent } from '@/app/api/follow-up/_lib/ai/functionIa';


// CORRIGIDO: Importar APENAS as funções necessárias e renomeadas de followUpHelpers
import {
  parseTimeString,            // Mantida
  updateFollowUpStatus,       // Mantida
  createSystemMessage,        // Mantida
  getCampaignSteps,           // Mantida
  // processCurrentStep,      // REMOVIDA (obsoleta no novo fluxo principal)
  // determineNextStep,       // REMOVIDA (substituída por determineNextAction)
  processStageAdvancement,    // Mantida (usada por handleClientResponse)
  // processActiveFollowUpResponse, // REMOVIDA (lógica movida para handleClientResponse)
  scheduleNextEvaluation,     // RENOMEADA/REFATORADA de scheduleNextStepExecution
  normalizeStep,              // Adicionada se for usada aqui, senão remover
} from './internal/followUpHelpers';

// *** FASE 4: Função para EXECUTAR a ação decidida pela IA ***
// (Coloque esta função aqui ou importe de 'actionExecutor.ts')
export async function executeAIAction(followUpId: string, action: AIAction): Promise<void> {
  console.log(`Executando Ação IA para ${followUpId}: ${action.action_type} - ${action.reason}`);

  switch (action.action_type) {
    case 'SEND_MESSAGE': // **** IMPLEMENTAR ESTE CASO ****
      try {
        const followUp = await prisma.followUp.findUnique({
          where: { id: followUpId },
          include: { campaign: { include: { stages: true } } }
        });
        if (!followUp || !followUp.campaign?.idLumibot || !followUp.campaign?.tokenAgentLumibot) {
          throw new Error("Dados de FollowUp ou Campanha/Lumibot ausentes para SEND_MESSAGE.");
        }
        const currentStage = followUp.campaign.stages.find(s => s.id === followUp.current_stage_id);
        const clientName = followUp.client_id;

        let content = '';
        let stepMetaData = {
          id: null as string | null,
          name: action.template_name || '', // Nome interno
          category: 'Utility',
          whatsappName: null as string | null | undefined
        };

        if (action.content_source === 'template' && action.template_name) {
          const baseStep = await prisma.followUpStep.findFirst({
            where: {
              template_name: action.template_name, // Busca pelo nome interno
              funnel_stage_id: followUp.current_stage_id || "" // Apenas no estágio atual
            },
            include: { funnel_stage: true } // Para pegar nome do estágio
          });
          if (!baseStep) throw new Error(`Template base "${action.template_name}" não encontrado no estágio ${currentStage?.name}.`);

          const normalizedBaseStep = normalizeStep(baseStep); // Normaliza para pegar campos corretos
          content = normalizedBaseStep.message_content;
          stepMetaData.id = normalizedBaseStep.id; // ID do passo/template usado
          stepMetaData.category = normalizedBaseStep.category;
          stepMetaData.whatsappName = normalizedBaseStep.template_name; // Nome HSM
          stepMetaData.name = normalizedBaseStep.template_name; // Nome interno
        } else if (action.content_source === 'generate') {
          console.warn("Ação SEND_MESSAGE com source 'generate' - conteúdo deveria vir da IA. Usando 'reason' como fallback.");
          content = action.reason;
        }

        if (!content || content.trim() === '') {
          throw new Error("Conteúdo final da mensagem está vazio ou inválido.");
        }

        // Personalizar se aplicável (NÃO HSM)
        if (action.content_source === 'template' && !action.is_hsm) {
          console.log(`Personalizando template (não-HSM) "${stepMetaData.name}"...`);
          content = await personalizeMessageContent(content, followUp.client_id, followUpId, {
            stage_name: currentStage?.name || 'Desconhecido',
            template_name: stepMetaData.name
          });
          console.log(`Conteúdo personalizado: "${content.substring(0, 50)}..."`);
        }


        // Criar registro da mensagem
        const messageRecord = await prisma.followUpMessage.create({
          data: {
            follow_up_id: followUpId,
            content: content,
            is_ai_generated: action.content_source === 'generate',
            template_used: stepMetaData.name, // Nome interno do template base
            is_from_client: false,
            sent_at: new Date(),
            delivered: false,
            step_id: stepMetaData.id // Associar ao step_id se usou template
          }
        });
        console.log(`Registro da mensagem ${messageRecord.id} criado no BD.`);


        const messageDbIdToSchedule = messageRecord.id; // Garantir que temos o ID

        console.log(stepMetaData.whatsappName)
        // Agendar o envio
        await scheduleMessage({
          followUpId: followUpId,
          messageDbId: messageDbIdToSchedule,
          stepIndex: -1,
          contentToSend: content,
          scheduledTime: new Date(Date.now() + (action.delay_ms || 100)),
          clientId: followUp.client_id,
          accountIdLumibot: followUp.campaign.idLumibot,
          tokenAgentLumibot: followUp.campaign.tokenAgentLumibot,
          isAIMessage: action.content_source === 'generate',
          isHSM: action.is_hsm,
          templateNameWhatsapp: stepMetaData.whatsappName,
          templateName: stepMetaData.name,
          templateCategory: stepMetaData.category,
          templateParams: { "1": clientName },
          metadata: { 
            ai_reason: action.reason
          }
        });

        // **** CÁLCULO SIMPLIFICADO DA PRÓXIMA AVALIAÇÃO ****
        let nextEvalDelayMs = 60 * 60 * 1000; // Default 1 hora
        let evalReasonPart = "próxima avaliação padrão";

        if (action.content_source === 'template' && stepMetaData.id) {
            const sentStep = await prisma.followUpStep.findUnique({
                where: { id: stepMetaData.id },
                select: { wait_time_ms: true, wait_time: true, template_name: true }
            });
            if (sentStep && sentStep.wait_time_ms) {
                nextEvalDelayMs = sentStep.wait_time_ms; // Usa o tempo definido pelo usuário para ESTE passo
                evalReasonPart = `aguardando tempo padrão (${sentStep.wait_time}) após passo '${sentStep.template_name}'`;
                console.log(`Usando delay padrão do passo enviado (${stepMetaData.id}): ${nextEvalDelayMs}ms.`);
            } else {
                console.warn(`Não foi possível encontrar wait_time_ms para o passo ${stepMetaData.id}. Usando delay padrão.`);
            }
        } else if (action.content_source === 'generate') {
            nextEvalDelayMs = 5 * 60 * 1000; // Ex: 5 minutos para diálogo
            evalReasonPart = "verificação rápida após resposta gerada pela IA";
            console.log(`IA gerou resposta, agendando avaliação curta: ${nextEvalDelayMs}ms.`);
        }

        await scheduleNextEvaluation(followUpId, nextEvalDelayMs, `IA: ${action.reason}. Agendando ${evalReasonPart}.`);
        // **** FIM DO CÁLCULO SIMPLIFICADO ****

      } catch (err) {
        console.error(`Erro ao executar SEND_MESSAGE para ${followUpId}:`, err);
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro ao enviar msg IA: ${err instanceof Error ? err.message : 'Erro'}` });
        // Agendar reavaliação mesmo em caso de erro
        await scheduleNextEvaluation(followUpId, 30 * 60 * 1000, `Reavaliação após falha no envio`);
      }
      break;

    case 'CHANGE_STAGE': // **** IMPLEMENTAR ESTE CASO ****
      await processStageAdvancement(followUpId, action.target_stage_id, `IA: ${action.reason}`);
      // processStageAdvancement já agenda a próxima avaliação
      break;

    case 'SCHEDULE_EVALUATION': // **** IMPLEMENTAR ESTE CASO ****
      await scheduleNextEvaluation(followUpId, action.delay_ms, `IA: ${action.reason}`);
      break;

    // Casos PAUSE, REQUEST_HUMAN_REVIEW, COMPLETE (já estavam ok)
    case 'PAUSE':
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `IA: ${action.reason}` });
      await createSystemMessage(followUpId, `Follow-up pausado pela IA. Motivo: ${action.reason}`);
      break;
    case 'REQUEST_HUMAN_REVIEW':
      await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `IA: Revisão Humana - ${action.reason}`, needs_human_review: true }); // Adicionar campo needs_human_review ao schema
      await createSystemMessage(followUpId, `🚨 Revisão Humana Solicitada pela IA. Motivo: ${action.reason}`);
      // TODO: Notificar humano
      break;
    case 'COMPLETE':
      await updateFollowUpStatus(followUpId, 'completed', { completed_at: new Date() });
      await createSystemMessage(followUpId, `Follow-up concluído pela IA. Motivo: ${action.reason}`);
      break;

    default:
      console.warn(`Ação IA desconhecida recebida para ${followUpId}:`, action);
      await scheduleNextEvaluation(followUpId, 60 * 60 * 1000, `Fallback: Ação IA desconhecida`);
  }
}
// --- Fim Função executeAIAction ---


// --- Função Principal de Processamento (Revisada) ---
// Agora chamada principalmente pelo setTimeout de scheduleNextEvaluation
export async function processFollowUpSteps(followUpId: string): Promise<void> {
  try {
    console.log(`[processFollowUpSteps] Iniciando para ${followUpId}`);
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      // Incluir apenas o necessário para a decisão
      select: { id: true, status: true, next_evaluation_at: true }
    });

    if (!followUp) {
      console.error(`[processFollowUpSteps] FollowUp ${followUpId} não encontrado.`);
      return;
    }

    if (followUp.status !== 'active') {
      console.log(`[processFollowUpSteps] FollowUp ${followUpId} não está ativo (status: ${followUp.status}). Processamento ignorado.`);
      return;
    }

    // Verificação opcional de tempo de avaliação (se houver concorrência)
    // const agora = Date.now();
    // if (followUp.next_evaluation_at && new Date(followUp.next_evaluation_at).getTime() > agora) {
    //   console.log(`[processFollowUpSteps] Avaliação para ${followUpId} ainda não é necessária (agendada para ${followUp.next_evaluation_at}).`);
    //   return; // Evita processamento prematuro se chamado incorretamente
    // }

    console.log(`[processFollowUpSteps] Determinando próxima ação para ${followUpId}...`);
    // Chama a função central de decisão da IA
    const nextAction = await determineNextAction(followUpId);

    // Executa a ação decidida
    await executeAIAction(followUpId, nextAction);

    console.log(`[processFollowUpSteps] Processamento concluído para ${followUpId}. Ação executada: ${nextAction.action_type}`);

  } catch (error) {
    console.error(`[processFollowUpSteps] Erro ao processar follow-up ${followUpId}:`, error);
    // Pausar o follow-up em caso de erro inesperado no fluxo principal
    await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro inesperado no processamento: ${error instanceof Error ? error.message : 'Erro'}` });
  }
}


// --- Função handleClientResponse (REVISADA) ---
export async function handleClientResponse(
  clientId: string,
  message: string,
  followUpIdInput?: string
): Promise<void> {
  try {
    console.log('=== DADOS DA RESPOSTA DO CLIENTE (handleClientResponse) ===');
    console.log({ followUpIdInput, clientId, message });

    // 1. Buscar FollowUp Ativo/Pausado
    const activeOrPausedFollowUp = await prisma.followUp.findFirst({
      where: {
        client_id: clientId,
        status: { in: ['active', 'paused'] },
        ...(followUpIdInput ? { id: followUpIdInput } : {})
      },
      include: { campaign: { include: { stages: { orderBy: { order: 'asc' } } } } },
      orderBy: { updated_at: 'desc' }
    });

    if (!activeOrPausedFollowUp) {
      console.log(`Nenhum follow-up ativo ou pausado encontrado para ${clientId}.`);
      // Poderia iniciar um novo follow-up aqui? Ou apenas ignorar.
      return;
    }
    const followUpId = activeOrPausedFollowUp.id;
    const followUp = activeOrPausedFollowUp; // Renomear para clareza

    // 2. Cancelar TODAS as ações futuras agendadas (mensagens E avaliações)
    await cancelScheduledMessages(followUpId); // Cancela mensagens
    // Precisamos de uma forma de cancelar os setTimeouts de scheduleNextEvaluation.
    // Uma abordagem é armazená-los em um mapa similar a activeTimeouts.
    // Por enquanto, apenas cancelamos mensagens. A avaliação pode rodar, mas a IA decidirá com base na nova resposta.
    console.log(`Mensagens agendadas canceladas para ${followUpId} devido à resposta do cliente.`);

    // 3. Registrar Mensagem do Cliente
    const clientMessageRecord = await prisma.followUpMessage.create({
      data: {
        follow_up_id: followUpId,
        content: message,
        is_from_client: true,
        delivered: true,
        delivered_at: new Date(),
        sent_at: new Date(), // Hora que recebemos
        is_ai_generated: false
      }
    });
    console.log(`Mensagem do cliente registrada (DB ID: ${clientMessageRecord.id})`);

    // 4. Atualizar FollowUp com last_response e REATIVAR se estava pausado
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        last_response: message,
        last_response_at: new Date(),
        last_client_message_at: new Date(), // Atualiza a janela de 24h
        waiting_for_response: false,
        status: 'active', // Garante que esteja ativo após resposta
        paused_reason: null // Limpa motivo da pausa, se houver
      }
    });
    console.log(`FollowUp ${followUpId} atualizado e ativado.`);


    // 5. Analisar Resposta com IA
    const aiAnalysis = await analyzeClientResponse(clientId, message, followUpId);
    console.log("Análise de IA da resposta:", aiAnalysis);
    // Registrar análise no BD
    await prisma.followUpAIAnalysis.create({
      data: { /* ... dados da análise ... */ follow_up_id: followUpId, message_id: clientMessageRecord.id, sentiment: aiAnalysis.sentiment, intent: aiAnalysis.intent, topics: aiAnalysis.topics, next_action: aiAnalysis.nextAction, suggested_stage: aiAnalysis.suggested_stage }
    });
    console.log(`Análise de IA registrada.`);


    // 6. Determinar e Executar a Próxima Ação
    // A resposta do cliente é o GATILHO para a IA decidir o que fazer AGORA.
    console.log(`Determinando ação da IA após resposta do cliente para ${followUpId}...`);
    const nextAction = await determineNextAction(followUpId); // IA considera a resposta recente e a análise

    await executeAIAction(followUpId, nextAction);

    console.log(`Processamento da resposta do cliente para ${followUpId} concluído.`);

  } catch (error) {
    console.error("Erro GERAL em handleClientResponse:", error);
  }
}


// --- Funções resumeFollowUp e advanceToNextStep (OBSOLETAS) ---
// Com o novo paradigma, a retomada e o avanço são gerenciados pela IA
// através de `determineNextAction` e `executeAIAction`.
/*
export async function resumeFollowUp(followUpId: string): Promise<void> {
  console.warn("Função resumeFollowUp é obsoleta. Use a API para enviar uma mensagem ou aguarde a próxima avaliação da IA.");
}

export async function advanceToNextStep(followUpId: string): Promise<void> {
   console.warn("Função advanceToNextStep é obsoleta. A IA gerencia o fluxo.");
}
*/


// Exportar parseTimeString se ainda for usado externamente
export { parseTimeString };

// --- Fim do arquivo manager.ts ---