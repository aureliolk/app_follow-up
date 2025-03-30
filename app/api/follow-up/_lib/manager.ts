// app/api/follow-up/_lib/manager.ts
// Versão refatorada do gerenciador de follow-up

import { prisma } from '@/lib/db';
import { scheduleMessage, cancelScheduledMessages, scheduleNextEvaluation_V2 } from './scheduler';
// CORRIGIDO: Importar determineNextAction em vez de decideNextStepWithAI
import { analyzeClientResponse, determineNextAction, generateAIResponse, AIAction, personalizeMessageContent } from '@/app/api/follow-up/_lib/ai/functionIa';


// CORRIGIDO: Importar APENAS as funções necessárias e renomeadas de followUpHelpers
import {
  parseTimeString,
  updateFollowUpStatus,
  createSystemMessage,
  getCampaignSteps,
  processStageAdvancement,
  normalizeStep,
} from './internal/followUpHelpers';

// *** FASE 4: Função para EXECUTAR a ação decidida pela IA ***
// (Coloque esta função aqui ou importe de 'actionExecutor.ts')
export async function executeAIAction(followUpId: string, action: AIAction): Promise<void> {
  console.log(`Executando Ação IA para ${followUpId}: ${action.action_type} - ${action.reason}`);

  switch (action.action_type) {
    case 'SEND_MESSAGE':
      try {
        // Buscar dados necessários do FollowUp e Campanha
        const followUp = await prisma.followUp.findUnique({
          where: { id: followUpId },
          include: {
            campaign: { include: { stages: { include: { steps: true } } } }, // Inclui steps para info do estágio
            messages: { orderBy: { sent_at: 'desc' }, take: 1, where: { is_from_client: true } } // Pega a última msg do cliente
          }
        });

        if (!followUp || !followUp.campaign?.idLumibot || !followUp.campaign?.tokenAgentLumibot) {
          throw new Error("Dados de FollowUp ou Campanha/Lumibot ausentes para SEND_MESSAGE.");
        }
        const currentStage = followUp.campaign.stages.find(s => s.id === followUp.current_stage_id);
        const clientName = followUp.client_id; // Usar ID como fallback inicial (pode ser melhorado buscando nome real)

        let contentToSend = '';
        let messageIsAiGenerated = false;
        let stepMetaData = {
          id: null as string | null,
          name: action.template_name || null, // Nome interno do template ou null
          category: 'Utility',
          whatsappName: null as string | null | undefined,
          waitTimeMs: 60 * 60 * 1000 // Default 1 hora para próxima avaliação
        };

        // Lógica baseada na fonte do conteúdo
        if (action.content_source === 'template' && action.template_name) {
          console.log(`Processando envio de template: ${action.template_name}`);
          const baseStep = await prisma.followUpStep.findFirst({
            where: { template_name: action.template_name, funnel_stage_id: followUp.current_stage_id || "" },
            include: { funnel_stage: true }
          });
          if (!baseStep) throw new Error(`Template base "${action.template_name}" não encontrado no estágio ${currentStage?.name}.`);

          const normalizedBaseStep = normalizeStep(baseStep);
          contentToSend = normalizedBaseStep.message_content;
          stepMetaData.id = normalizedBaseStep.id;
          stepMetaData.category = normalizedBaseStep.category;
          stepMetaData.whatsappName = normalizedBaseStep.template_name; // Nome HSM se houver
          stepMetaData.name = normalizedBaseStep.template_name; // Nome interno
          stepMetaData.waitTimeMs = normalizedBaseStep.wait_time_ms; // Usar espera definida no passo

          // Personalizar se for template e NÃO for HSM
          if (!action.is_hsm) {
            console.log(`Personalizando template (não-HSM) "${stepMetaData.name}"...`);
            contentToSend = await personalizeMessageContent(contentToSend, followUp.client_id, followUpId, {
              stage_name: currentStage?.name || 'Desconhecido',
              template_name: stepMetaData.name
            });
            console.log(`Conteúdo personalizado: "${contentToSend.substring(0, 50)}..."`);
          }

        } else if (action.content_source === 'generate') {
          console.log("Gerando resposta da IA para o cliente...");
          let generatedContent = '';
          const lastClientMessage = followUp.messages[0]; // Já buscamos a última do cliente
          if (!lastClientMessage || !lastClientMessage.content) {
            console.warn(`Não foi possível encontrar a última mensagem do cliente para usar como contexto para generateAIResponse. Usando fallback.`);
            // Fallback: Usar a 'reason' da IA ou uma mensagem genérica
            contentToSend = action.reason || "Olá! Recebi sua mensagem. Como posso ajudar?";
            // Ou talvez chamar generateAIResponse sem a mensagem do cliente? Depende da implementação dela.
            // Exemplo alternativo:
            // const stageInfo = { /* ... */ };
            // contentToSend = await generateAIResponse(followUp.client_id, "", followUpId, stageInfo);
          } else {
            const stageInfo = {
              id: currentStage?.id,
              name: currentStage?.name,
              purpose: currentStage?.description
            };
            try {
              // <<< CHAMADA REAL À FUNÇÃO DE GERAÇÃO >>>
              generatedContent = await generateAIResponse(
                followUp.client_id,
                lastClientMessage.content,
                followUpId,
                stageInfo
              );

              console.log(`Conteúdo gerado pela IA: "${generatedContent.substring(0, 100)}..."`);
            } catch (genError) {
              console.error("Erro ao chamar generateAIResponse:", genError);
              generatedContent = action.reason || "Desculpe, não consegui processar sua solicitação agora."; // Usar reason ou outra msg de erro
            }
          }
          contentToSend = generatedContent; // <<< CORREÇÃO CRÍTICA AQUI
          messageIsAiGenerated = true;
          stepMetaData.name = "ai_generated_response";
          stepMetaData.waitTimeMs = 5 * 60 * 1000; // Avaliação curta (5 min) após gerar resposta
          console.log(`Conteúdo gerado pela IA: "${contentToSend.substring(0, 100)}..."`);
        }

        // Validação final do conteúdo
        if (!contentToSend || contentToSend.trim() === '') {
          if (action.reason) {
            console.warn("Conteúdo final da mensagem está vazio. Usando 'reason' como último recurso.");
            contentToSend = action.reason;
          } else {
            throw new Error("Conteúdo final da mensagem está vazio ou inválido.");
          }
        }

        // Criar registro da mensagem no BD
        const messageRecord = await prisma.followUpMessage.create({
          data: {
            follow_up_id: followUpId,
            content: contentToSend,
            is_ai_generated: messageIsAiGenerated,
            template_used: stepMetaData.name,
            is_from_client: false,
            sent_at: new Date(),
            delivered: false,
            step_id: stepMetaData.id
          }
        });
        console.log(`Registro da mensagem ${messageRecord.id} criado no BD.`);

        // Agendar o envio da mensagem
        await scheduleMessage({
          followUpId: followUpId,
          messageDbId: messageRecord.id,
          stepIndex: -1,
          contentToSend: contentToSend,
          scheduledTime: new Date(Date.now() + (action.delay_ms || 100)), // Envio quase imediato
          clientId: followUp.client_id,
          accountIdLumibot: followUp.campaign.idLumibot!,
          tokenAgentLumibot: followUp.campaign.tokenAgentLumibot!,
          isAIMessage: messageIsAiGenerated,
          isHSM: action.is_hsm, // Usar o is_hsm final da decisão da IA (pós-correção)
          templateNameWhatsapp: stepMetaData.whatsappName,
          templateName: stepMetaData.name || "",
          templateCategory: stepMetaData.category,
          // Não incluir templateParams aqui, deixar para o processador buscar nome
          metadata: {
            ai_reason: action.reason
          }
        });

        // Agendar a próxima avaliação da IA
        const nextEvalDelayMs = stepMetaData.waitTimeMs;
        const evalReasonPart = messageIsAiGenerated
          ? "verificação rápida após resposta gerada pela IA"
          : `aguardando tempo padrão (${(nextEvalDelayMs / 60000).toFixed(0)} min) após passo '${stepMetaData.name}'`;

        // << Certifique-se que o nome da função aqui é o correto (V2 ou normal) >>
        await scheduleNextEvaluation_V2(followUpId, nextEvalDelayMs, `IA: ${action.reason}. Agendando ${evalReasonPart}.`);

      } catch (err) {
        console.error(`Erro ao executar SEND_MESSAGE para ${followUpId}:`, err);
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro ao enviar msg IA: ${err instanceof Error ? err.message : 'Erro desconhecido'}` });
        // << Certifique-se que o nome da função aqui é o correto (V2 ou normal) >>
        await scheduleNextEvaluation_V2(followUpId, 30 * 60 * 1000, `Reavaliação após falha no envio`);
      }
      break;

    case 'CHANGE_STAGE':
      try {
        await processStageAdvancement(followUpId, action.target_stage_id, `IA: ${action.reason}`);
        // processStageAdvancement já chama scheduleNextEvaluation_V2 (ou a versão correta)
      } catch (err) {
        console.error(`Erro ao executar CHANGE_STAGE para ${followUpId}:`, err);
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro ao mudar estágio: ${err instanceof Error ? err.message : 'Erro'}` });
      }
      break;

    case 'SCHEDULE_EVALUATION':
      try {
        // << Certifique-se que o nome da função aqui é o correto (V2 ou normal) >>
        await scheduleNextEvaluation_V2(followUpId, action.delay_ms, `IA: ${action.reason}`);
      } catch (err) {
        console.error(`Erro ao executar SCHEDULE_EVALUATION para ${followUpId}:`, err);
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro ao agendar avaliação: ${err instanceof Error ? err.message : 'Erro'}` });
      }
      break;

    case 'PAUSE':
      try {
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `IA: ${action.reason}` });
        await createSystemMessage(followUpId, `Follow-up pausado pela IA. Motivo: ${action.reason}`);
      } catch (err) {
        console.error(`Erro ao executar PAUSE para ${followUpId}:`, err);
        // Tentar pausar mesmo assim, se falhou ao criar msg sistema
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `IA: ${action.reason} (falha ao logar msg sistema)` }).catch(() => { });
      }
      break;

    case 'REQUEST_HUMAN_REVIEW':
      try {
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `IA: Revisão Humana - ${action.reason}`, needs_human_review: true }); // Adicionar campo needs_human_review ao schema se necessário
        await createSystemMessage(followUpId, `🚨 Revisão Humana Solicitada pela IA. Motivo: ${action.reason}`);
        // TODO: Implementar notificação para humano
      } catch (err) {
        console.error(`Erro ao executar REQUEST_HUMAN_REVIEW para ${followUpId}:`, err);
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `IA: Revisão Humana - ${action.reason} (falha ao logar msg sistema)`, needs_human_review: true }).catch(() => { });
      }
      break;

    case 'COMPLETE':
      try {
        await updateFollowUpStatus(followUpId, 'completed', { completed_at: new Date() });
        await createSystemMessage(followUpId, `Follow-up concluído pela IA. Motivo: ${action.reason}`);
      } catch (err) {
        console.error(`Erro ao executar COMPLETE para ${followUpId}:`, err);
        await updateFollowUpStatus(followUpId, 'completed', { completed_at: new Date(), paused_reason: `(falha ao logar msg sistema)` }).catch(() => { });
      }
      break;

    default:
      console.warn(`Ação IA desconhecida recebida para ${followUpId}:`, action);
      // << Certifique-se que o nome da função aqui é o correto (V2 ou normal) >>
      await scheduleNextEvaluation_V2(followUpId, 60 * 60 * 1000, `Fallback: Ação IA desconhecida`);
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
      data: { /* ... dados da análise ... */ follow_up_id: followUpId, message_id: clientMessageRecord.id, sentiment: aiAnalysis.sentiment, intent: aiAnalysis.intent, topics: aiAnalysis.topics, next_action: aiAnalysis.nextAction || "", suggested_stage: aiAnalysis.suggestedStage }
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

// Exportar parseTimeString se ainda for usado externamente
export { parseTimeString };

// --- Fim do arquivo manager.ts ---