// app/api/follow-up/_lib/internal/followUpHelpers.ts
// Funções internas para gerenciamento de follow-up

import { prisma } from '@/lib/db';
// Importa as funções de IA necessárias
import { personalizeMessageContent, determineNextAction, AIAction } from '@/app/api/follow-up/_lib/ai/functionIa';
import { scheduleMessage } from '../scheduler';
// Importa a função processFollowUpSteps de manager.ts (necessário para JUMP e CONTINUE)
// Removido 'processCurrentStep' de si mesmo, adicionado getCampaignSteps se não estiver importado de outro lugar
import { processFollowUpSteps } from '../manager';


// --- Tipagem FollowUpStep (Garantir que corresponda ao schema.prisma) ---
interface FollowUpStep {
  id: string;
  funnel_stage_id: string; // Chave estrangeira para FollowUpFunnelStage
  stage_name: string; // Nome do estágio (denormalizado ou via include)
  name: string; // Nome descritivo do passo
  template_name: string; // Nome interno do template/passo
  wait_time: string; // String original (ex: "30m")
  wait_time_ms: number; // Tempo em milissegundos
  message_content: string; // Conteúdo base da mensagem
  category: string; // Categoria (ex: 'Utility')
  order: number; // Ordem dentro do estágio
  template_name_whatsapp?: string | null; // Nome exato do HSM (opcional)
  funnel_stage?: any; // Incluído via Prisma
}
// --- Fim Tipagem ---

// Constante TEST_MODE (mantida)
const TEST_MODE = false;
console.log("MODO DE TESTE CONFIGURADO COMO:", TEST_MODE ? "ATIVADO" : "DESATIVADO");

// Função parseTimeString (mantida)
export function parseTimeString(timeStr: string): number {
  if (TEST_MODE) {
    return 30 * 1000;
  }
  if (!timeStr || timeStr.trim() === "") return 30 * 60 * 1000;
  const timeMap: Record<string, number> = { s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 86400 * 1000, minuto: 60 * 1000, hora: 3600 * 1000, dia: 86400 * 1000 };
  const match = timeStr.match(/^(\d+)([smhd])$/i) || timeStr.match(/(\d+)\s*(minuto|hora|dia)/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    return value * (timeMap[unit] || 60000);
  }
  if (/^\d+$/.test(timeStr.trim())) return parseInt(timeStr) * 60 * 1000;
  if (timeStr.toLowerCase() === "imediatamente") return 100;
  return 30 * 60 * 1000;
}


// Função updateFollowUpStatus (mantida, com paused_reason)
export async function updateFollowUpStatus(
  followUpId: string,
  status: 'active' | 'paused' | 'completed' | 'canceled',
  updates: { paused_reason?: string; completed_at?: Date; waiting_for_response?: boolean; [key: string]: any } = {}
): Promise<void> {
  try {
    const dataToUpdate: any = { status, ...updates };

    if (status === 'completed' && !updates.completed_at) {
      dataToUpdate.completed_at = new Date();
    }
    

    await prisma.followUp.update({
      where: { id: followUpId },
      data: dataToUpdate,
    });
    console.log(`Follow-up ${followUpId} atualizado para status: ${status}. Detalhes:`, updates);
  } catch (error) {
    console.error(`Erro ao atualizar status do follow-up ${followUpId} para ${status}:`, error);
    // Não relançar para não parar fluxos em background
  }
}


// Função createSystemMessage (mantida)
export async function createSystemMessage(
  followUpId: string,
  content: string
): Promise<void> {
  try {
    await prisma.followUpMessage.create({
      data: {
        follow_up_id: followUpId,
        step_id: null, // Mensagem de sistema não está atrelada a um passo específico
        content,
        is_from_client: false,
        sent_at: new Date(),
        delivered: true, // Mensagens de sistema são consideradas 'entregues' internamente
        delivered_at: new Date(),
        is_ai_generated: false // Não foi gerada pela IA para o cliente
      }
    });
  } catch (error) {
    console.error(`Erro ao criar mensagem de sistema para follow-up ${followUpId}:`, error);
  }
}


// Função normalizeStep (AJUSTADA para corresponder ao schema e novo paradigma)
export function normalizeStep(step: any): FollowUpStep {
   let waitTimeMs = step.wait_time_ms;
   if (waitTimeMs === undefined || waitTimeMs === null) {
      waitTimeMs = parseTimeString(step.wait_time || '30m');
   }
   if (TEST_MODE && waitTimeMs > 60000) {
      waitTimeMs = 30000;
   }

  return {
    id: step.id,
    funnel_stage_id: step.funnel_stage_id,
    stage_name: step.funnel_stage?.name || 'Desconhecido',
    name: step.name || step.template_name || 'Passo sem nome',
    template_name: step.template_name || 'N/A', // Nome interno
    wait_time: step.wait_time || '30m',
    wait_time_ms: waitTimeMs,
    message_content: step.message_content || '', // Conteúdo base
    category: step.category || 'Utility',
    order: step.order ?? 0,
    funnel_stage: step.funnel_stage,
  };
}


// Função getCampaignSteps (mantida como antes)
export async function getCampaignSteps(followUp: any): Promise<FollowUpStep[]> {
  if (!followUp || !followUp.campaign_id) {
    console.error("getCampaignSteps chamado sem followUp ou campaign_id válido.");
    return [];
  }
  try {
    const steps = await prisma.followUpStep.findMany({
      where: { funnel_stage: { campaign_id: followUp.campaign_id } },
      include: { funnel_stage: true },
      orderBy: [ { funnel_stage: { order: 'asc' } }, { order: 'asc' }, { wait_time_ms: 'asc' } ]
    });
    return steps.map(normalizeStep);
  } catch (error) {
    console.error(`Erro ao buscar passos da campanha para follow-up ${followUp.id}:`, error);
    return [];
  }
}



// --- Função scheduleNextEvaluation (REVISADA) ---
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
        data: { next_evaluation_at: evaluationTime }
    });

    // O agendamento real PODE ser feito por um job externo (melhor para produção)
    // OU continuar usando setTimeout para desenvolvimento/simplicidade:
    setTimeout(async () => {
      try {
        const currentFollowUp = await prisma.followUp.findUnique({
            where: { id: followUpId },
            select: { status: true }
        });

        if (currentFollowUp?.status === 'active') {
            console.log(`[Timer Avaliação] Executando avaliação agendada para FollowUp ${followUpId}`);
            // Chama a função central de decisão da IA
            const nextAction = await determineNextAction(followUpId);
            console.log(`[Timer Avaliação] Ação determinada para ${followUpId}:`, nextAction);
            // *** FASE 4: Aqui chamaríamos a função que executa a ação ***
            // await executeAIAction(followUpId, nextAction);
            console.log(`[Timer Avaliação] TODO: Implementar executeAIAction para ${nextAction.action_type}`);
        } else {
            console.log(`[Timer Avaliação] Avaliação agendada para ${followUpId} ignorada (status: ${currentFollowUp?.status})`);
        }
      } catch (error) {
        console.error(`[Timer Avaliação] Erro durante avaliação agendada para ${followUpId}:`, error);
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro na avaliação agendada: ${error instanceof Error ? error.message : 'Erro'}` });
      }
    }, effectiveDelay);

  } catch (error) {
    console.error(`Erro ao AGENDAR avaliação para ${followUpId}:`, error);
    await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro agendamento avaliação: ${error instanceof Error ? error.message : 'Erro'}` });
  }
}


// --- Função processStageAdvancement (REVISADA para o novo paradigma) ---
// Chamada por handleClientResponse ou pela IA ('CHANGE_STAGE') para mover o estágio.
// Responsabilidade: Atualizar o estágio no BD e agendar a PRIMEIRA avaliação no novo estágio.
export async function processStageAdvancement(
  followUpId: string, // Recebe apenas o ID
  targetStageId: string,
  reason: string // Motivo da mudança (ex: "Cliente respondeu", "IA decidiu avançar")
): Promise<boolean> { // Retorna true se avançou, false se houve erro
  try {
     console.log(`Processando avanço para estágio ${targetStageId} para ${followUpId}. Motivo: ${reason}`);

     // 1. Buscar FollowUp e Campanha/Estágios
     const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: { campaign: { include: { stages: { orderBy: { order: 'asc'} } } } }
     });

     if (!followUp) { console.error(`FollowUp ${followUpId} não encontrado para avanço.`); return false; }
     if (!followUp.campaign || !followUp.campaign.stages) { console.error(`Campanha/Estágios não encontrados para ${followUpId}.`); return false; }

     const currentStage = followUp.campaign.stages.find(s => s.id === followUp.current_stage_id);
     const targetStage = followUp.campaign.stages.find(s => s.id === targetStageId);

     if (!targetStage) { console.error(`Estágio alvo ${targetStageId} não encontrado na campanha ${followUp.campaign.id}.`); return false; }
     if (targetStage.id === followUp.current_stage_id) { console.log(`FollowUp ${followUpId} já está no estágio alvo ${targetStage.name}. Nenhum avanço necessário.`); return true; } // Já está lá

     const currentStageName = currentStage?.name || 'Desconhecido';
     console.log(`Avançando ${followUpId} do estágio "${currentStageName}" para "${targetStage.name}".`);

     // 2. Atualizar o follow-up para o NOVO estágio
     const nextEvaluationDelayMs = 2000; // Avaliar rapidamente (2s) após mudar estágio
     const nextEvaluationTime = new Date(Date.now() + nextEvaluationDelayMs);

     await prisma.followUp.update({
       where: { id: followUpId },
       data: {
         current_stage_id: targetStage.id,
         status: 'active', // Garante que está ativo
         waiting_for_response: false, // Resetar flags de espera
         // Manter last_response/last_response_at se aplicável (já definido antes)
         next_evaluation_at: nextEvaluationTime // Define QUANDO a IA vai olhar de novo
       }
     });
     await createSystemMessage(followUpId, `Avançou para estágio "${targetStage.name}". Motivo: ${reason}.`);
     console.log(`Follow-up ${followUpId} atualizado para Estágio: ${targetStage.name}. Próxima avaliação em ${nextEvaluationDelayMs}ms.`);

     // 3. Agendar a avaliação (usando a função revisada)
     await scheduleNextEvaluation(followUpId, nextEvaluationDelayMs, `Início do estágio ${targetStage.name}`);

     return true;

  } catch (error) {
    console.error(`Erro ao processar avanço de estágio para ${followUpId} -> ${targetStageId}:`, error);
    await updateFollowUpStatus(followUpId, 'paused', { paused_reason: `Erro avanço estágio: ${error instanceof Error ? error.message : 'Erro'}` });
    return false;
  }
}

