// apps/workers/src/workers/sequenceStepProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/packages/shared-lib/src/redis';
import { prisma } from '@/packages/shared-lib/src/db';
import { sequenceStepQueue } from '../queues/sequenceStepQueue';
import { enviarTextoLivreLumibot } from '@/packages/shared-lib/src/channel/lumibotSender';
import { ConversationStatus, MessageSenderType } from '@prisma/client';

const QUEUE_NAME = 'sequence-step';

interface SequenceStepJobData {
  followUpId: string;
  stepRuleId: string; // ID da WorkspaceAiFollowUpRule a ser enviada
  // workspaceId não é mais necessário passar aqui, vamos derivar
}

async function processSequenceStepJob(job: Job<SequenceStepJobData>) {
  const { followUpId, stepRuleId } = job.data; // Removido workspaceId daqui
  const jobId = job.id || 'unknown-sequence-job';
  console.log(`\n--- [SequenceWorker ${jobId}] INÍCIO ---`);
  console.log(`[SequenceWorker ${jobId}] Processando Step Rule ${stepRuleId} para FollowUp ${followUpId}`);

  try {
    // 1. Buscar FollowUp e dados relacionados indiretamente
    console.log(`[SequenceWorker ${jobId}] Buscando FollowUp ${followUpId}...`);
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      select: {
        id: true,
        status: true,
        client_id: true, // Pegar o ID do cliente
        campaign: {      // Usar a relação com Campanha (que existe)
           select: {
              workspaces: { // Da campanha, ir para a tabela de junção
                 select: {
                    workspace: { // Da junção, ir para o Workspace
                        select: {
                            id: true, // Pegar o ID do workspace
                            lumibot_account_id: true,
                            lumibot_api_token: true,
                            ai_follow_up_rules: { // E as regras diretamente do workspace
                              orderBy: { created_at: 'asc' },
                              select: { id: true, message_content: true, delay_milliseconds: true }
                            }
                        }
                    }
                 },
                 take: 1
              }
           }
        },
      },
    });

    if (!followUp) {
      console.warn(`[SequenceWorker ${jobId}] FollowUp ${followUpId} não encontrado. Ignorando job.`);
      return { status: 'skipped', reason: 'FollowUp não encontrado' };
    }

    // 1.1 Derivar dados do Workspace
    const workspaceData = followUp.campaign?.workspaces?.[0]?.workspace;
    if (!workspaceData) {
        console.error(`[SequenceWorker ${jobId}] Workspace não encontrado para a Campanha do FollowUp ${followUpId}.`);
        throw new Error(`Workspace não encontrado para a Campanha do FollowUp ${followUpId}.`);
    }
    const derivedWorkspaceId = workspaceData.id;
    console.log(`[SequenceWorker ${jobId}] Workspace ID derivado: ${derivedWorkspaceId}`);

    // 1.2 Buscar Client (para placeholder de nome)
    const client = await prisma.client.findUnique({
        where: { id: followUp.client_id },
        select: { name: true }
    });

    // 1.3 Buscar Conversation (para channel_conversation_id)
    console.log(`[SequenceWorker ${jobId}] Buscando Conversation para Cliente ${followUp.client_id} no Workspace ${derivedWorkspaceId}...`);
    const conversation = await prisma.conversation.findFirst({
        where: { client_id: followUp.client_id, workspace_id: derivedWorkspaceId }, // Condições corretas
        orderBy: { created_at: 'desc' },
        select: { channel_conversation_id: true }
    });

    const channelConversationId = conversation?.channel_conversation_id;
    if (!channelConversationId) {
         console.warn(`[SequenceWorker ${jobId}] Não foi possível encontrar channel_conversation_id para FollowUp ${followUpId}. Verifique a relação Cliente/Conversa.`);
         return { status: 'skipped', reason: 'channel_conversation_id não encontrado' };
    }
    console.log(`[SequenceWorker ${jobId}] channel_conversation_id encontrado: ${channelConversationId}`);


    // --- Validações Iniciais ---
    const activeStatuses = ["active", "started"];
    if (!activeStatuses.includes(followUp.status.toLowerCase())) {
       console.log(`[SequenceWorker ${jobId}] FollowUp ${followUpId} não está ativo (Status: ${followUp.status}). Parando sequência.`);
       return { status: 'skipped', reason: `Status do FollowUp: ${followUp.status}` };
    }
    console.log(`[SequenceWorker ${jobId}] FollowUp está ativo.`);

    // 3. Encontrar a Regra/Step Atual e a Próxima
    const allRules = workspaceData.ai_follow_up_rules || []; // Usa regras do workspaceData
    const currentRuleIndex = allRules.findIndex(rule => rule.id === stepRuleId);

    if (currentRuleIndex === -1) {
        console.error(`[SequenceWorker ${jobId}] Regra atual (ID: ${stepRuleId}) não encontrada na lista de regras do workspace ${derivedWorkspaceId}.`);
        throw new Error(`Regra ${stepRuleId} não encontrada para o workspace.`);
    }
    const currentRule = allRules[currentRuleIndex];
    const nextRule = allRules[currentRuleIndex + 1];
    console.log(`[SequenceWorker ${jobId}] Regra atual encontrada: Ordem ${currentRuleIndex + 1}, ID: ${currentRule.id}`);
     if (nextRule) {
         console.log(`[SequenceWorker ${jobId}] Próxima regra: Ordem ${currentRuleIndex + 2}, ID: ${nextRule.id}`);
     } else {
         console.log(`[SequenceWorker ${jobId}] Esta é a última regra da sequência.`);
     }


    // 4. Formatar a Mensagem
    let messageToSend = currentRule.message_content;
    console.log(`[SequenceWorker ${jobId}] Mensagem original: "${messageToSend}"`);
    if (client?.name) { // Usa o 'client' buscado separadamente
      messageToSend = messageToSend.replace(/\[NomeCliente\]/gi, client.name);
      console.log(`[SequenceWorker ${jobId}] Placeholder [NomeCliente] substituído.`);
    }
    console.log(`[SequenceWorker ${jobId}] Mensagem final a ser enviada: "${messageToSend}"`);

    // 5. Obter Credenciais do Canal
    const { lumibot_account_id, lumibot_api_token } = workspaceData; // Usa credenciais do workspaceData
    if (!lumibot_account_id || !lumibot_api_token) {
      console.warn(`[SequenceWorker ${jobId}] Credenciais Lumibot ausentes para workspace ${derivedWorkspaceId}. Não é possível enviar.`);
      throw new Error(`Credenciais Lumibot ausentes para workspace ${derivedWorkspaceId}.`);
    }
    console.log(`[SequenceWorker ${jobId}] Credenciais Lumibot OK.`);

    // 6. Enviar Mensagem
    console.log(`[SequenceWorker ${jobId}] Chamando enviarTextoLivreLumibot para channel_conv_id ${channelConversationId}...`);
    const sendResult = await enviarTextoLivreLumibot(
      lumibot_account_id,
      channelConversationId, // Usa a variável correta
      lumibot_api_token,
      messageToSend
    );

    // 7. Lidar com o Resultado do Envio
     if (!sendResult.success) {
       console.error(`[SequenceWorker ${jobId}] Falha ao enviar mensagem da sequência via Lumibot:`, sendResult.responseData);
       throw new Error(`Falha ao enviar passo da sequência ${stepRuleId} para Lumibot: ${JSON.stringify(sendResult.responseData)}`);
     }
     console.log(`[SequenceWorker ${jobId}] Mensagem do passo ${stepRuleId} enviada com sucesso.`);

    // 8. Atualizar o FollowUp
    const updateData: { current_sequence_step_order: number; next_sequence_message_at?: Date | null; status?: string } = {
        current_sequence_step_order: currentRuleIndex + 1,
    };

    // 9. Agendar o Próximo Passo ou Finalizar
    if (nextRule) {
      const delayMs = Number(nextRule.delay_milliseconds);
      if (delayMs > 0) {
        const nextSendTime = new Date(Date.now() + delayMs);
        updateData.next_sequence_message_at = nextSendTime;

        const nextJobData: SequenceStepJobData = {
          followUpId: followUpId,
          stepRuleId: nextRule.id, // ID da *próxima* regra
          // Não precisa mais passar workspaceId, será derivado novamente
        };

        console.log(`[SequenceWorker ${jobId}] Agendando próximo passo (Rule: ${nextRule.id}) com delay ${delayMs}ms.`);
        await sequenceStepQueue.add('processSequenceStep', nextJobData, {
          delay: delayMs,
          removeOnComplete: true,
          removeOnFail: 10000,
        });
        console.log(`[SequenceWorker ${jobId}] Próximo job agendado.`);

      } else {
        console.warn(`[SequenceWorker ${jobId}] Próxima regra (ID: ${nextRule.id}) tem delay inválido (${delayMs}ms). Não agendando.`);
        updateData.next_sequence_message_at = null;
      }
    } else {
      console.log(`[SequenceWorker ${jobId}] Fim da sequência. Marcando FollowUp como COMPLETED.`);
      updateData.status = 'COMPLETED';
      updateData.next_sequence_message_at = null;
    }

    // Atualizar o registro FollowUp no banco
    await prisma.followUp.update({
      where: { id: followUpId },
      data: updateData,
    });
    console.log(`[SequenceWorker ${jobId}] Status do FollowUp atualizado.`);

    console.log(`--- [SequenceWorker ${jobId}] FIM (Sucesso) ---`);
    return { status: 'completed' };

  } catch (error) {
    console.error(`[SequenceWorker ${jobId}] Erro CRÍTICO ao processar job de sequência para FollowUp ${followUpId}:`, error);
    if (error instanceof Error) {
        console.error(error.stack);
    }
    console.log(`--- [SequenceWorker ${jobId}] FIM (Erro Crítico) ---`);
    throw error; // Re-lança para BullMQ tratar como falha
  }
}

// --- Inicialização do Worker (mantém como estava) ---
console.log(`[SequenceWorker] Tentando inicializar o worker para a fila "${QUEUE_NAME}"...`);
try {
    const sequenceWorker = new Worker<SequenceStepJobData>(QUEUE_NAME, processSequenceStepJob, {
      connection: redisConnection,
      concurrency: 5,
    });

    sequenceWorker.on('completed', (job: Job<SequenceStepJobData>, result: any) => {
      console.log(`[SequenceWorker] Job ${job.id || 'N/A'} (FollowUp: ${job.data?.followUpId}, Rule: ${job.data?.stepRuleId}) concluído. Status: ${result?.status || 'N/A'}`);
    });

    sequenceWorker.on('failed', (job: Job<SequenceStepJobData> | undefined, err: Error) => {
      const jobId = job?.id || 'N/A';
      const followUpId = job?.data?.followUpId || 'N/A';
      const attempts = job?.attemptsMade || 0;
      console.error(`[SequenceWorker] Job ${jobId} (FollowUp: ${followUpId}) falhou após ${attempts} tentativas:`, err.message);
      console.error(err);
    });

    sequenceWorker.on('error', (err) => {
      console.error('[SequenceWorker] Erro geral:', err);
    });

    console.log(`[SequenceWorker] Worker iniciado e escutando a fila "${QUEUE_NAME}"...`);

} catch (initError) {
    console.error('[SequenceWorker] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1);
}