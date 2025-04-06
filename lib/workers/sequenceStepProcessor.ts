// apps/workers/src/workers/sequenceStepProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { enviarTextoLivreLumibot } from '@/lib/channel/lumibotSender';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue';
import { FollowUpStatus, Prisma } from '@prisma/client'; // Importe Prisma para tipos
import { formatMsToDelayString, parseDelayStringToMs } from '@/lib/timeUtils'; // Importar utils

const QUEUE_NAME = 'sequence-step';

interface SequenceJobData {
  followUpId: string;
  stepRuleId: string; // ID da WorkspaceAiFollowUpRule a ser processada
  workspaceId: string; // ID do Workspace (opcional, mas útil ter)
}

// --- Função de Processamento do Job ---
async function processSequenceStepJob(job: Job<SequenceJobData>) {
  const jobId = job.id || 'unknown-sequence-job';
  const { followUpId, stepRuleId, workspaceId: jobWorkspaceId } = job.data; // jobWorkspaceId pode ser redundante se buscarmos via followUp

  console.log(`\n--- [SequenceWorker ${jobId}] INÍCIO ---`);
  console.log(`[SequenceWorker ${jobId}] Processando Step Rule ${stepRuleId} para FollowUp ${followUpId}`);

  try {
    // 1. Buscar FollowUp e dados relacionados indiretamente
    console.log(`[SequenceWorker ${jobId}] Buscando FollowUp ${followUpId}...`);
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        // <<< CORREÇÃO PRINCIPAL: INCLUIR WORKSPACE E CLIENT >>>
        workspace: {
          select: {
            id: true, // Para confirmação
            lumibot_account_id: true,
            lumibot_api_token: true,
            // Buscar TODAS as regras ordenadas para encontrar a próxima
            ai_follow_up_rules: {
              orderBy: { created_at: 'asc' },
              select: { id: true, delay_milliseconds: true, message_content: true, created_at: true },
            },
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            // Precisamos da conversa associada para obter o channel_conversation_id
            // Buscar a MAIS RECENTE conversa ATIVA do cliente neste workspace
            conversations: {
                 where: {
                     workspace_id: jobWorkspaceId, // Filtra pelo workspace correto
                     status: 'ACTIVE' // Busca apenas conversas ativas
                 },
                 orderBy: {
                     last_message_at: 'desc' // Pega a mais recente
                 },
                 take: 1,
                 select: {
                     id: true,
                     channel_conversation_id: true
                 }
            }
          },
        },
      },
    });

    if (!followUp) {
      console.warn(`[SequenceWorker ${jobId}] FollowUp ${followUpId} não encontrado. Ignorando job.`);
      // Considerar se deve lançar erro ou apenas retornar
      return { status: 'skipped', reason: 'FollowUp não encontrado' };
    }
    console.log(`[SequenceWorker ${jobId}] FollowUp encontrado. Status: ${followUp.status}`);

    // 2. Verificar Status do FollowUp
    // Usar string diretamente se não tiver o Enum importado corretamente
    if (followUp.status !== 'ACTIVE' && followUp.status !== FollowUpStatus.ACTIVE) { // Checa string e Enum
      console.log(`[SequenceWorker ${jobId}] FollowUp ${followUpId} não está ativo (Status: ${followUp.status}). Job ignorado.`);
      return { status: 'skipped', reason: `FollowUp não ativo (${followUp.status})` };
    }

    // 3. Verificar se o Workspace foi carregado (agora deve funcionar)
    if (!followUp.workspace) {
         // Este erro não deve mais ocorrer com o include correto
         console.error(`[SequenceWorker ${jobId}] ERRO INESPERADO: Workspace não incluído para FollowUp ${followUpId}. Verifique a query Prisma.`);
         throw new Error(`Workspace não encontrado nos dados do FollowUp ${followUpId}.`);
    }
     const workspaceData = followUp.workspace; // Dados do workspace carregados
     console.log(`[SequenceWorker ${jobId}] Dados do Workspace (ID: ${workspaceData.id}) carregados.`);

    // 4. Encontrar a regra ATUAL (stepRuleId) dentro das regras do workspace
    const currentRule = workspaceData.ai_follow_up_rules.find((rule: { id: string }) => rule.id === stepRuleId);
    if (!currentRule) {
        console.error(`[SequenceWorker ${jobId}] Regra de passo ${stepRuleId} não encontrada nas regras do workspace ${workspaceData.id}.`);
        throw new Error(`Regra ${stepRuleId} não encontrada para o workspace.`);
    }
     console.log(`[SequenceWorker ${jobId}] Regra atual encontrada: ID=${currentRule.id}`);

    // 5. Obter dados do Cliente e da Conversa
    const clientData = followUp.client;
    if (!clientData) {
        console.error(`[SequenceWorker ${jobId}] ERRO INESPERADO: Cliente não incluído para FollowUp ${followUpId}.`);
        throw new Error(`Cliente não encontrado nos dados do FollowUp ${followUpId}.`);
    }
    // Obter a conversa mais recente ativa (buscada no include)
    const conversationData = clientData.conversations?.[0];
    if (!conversationData?.channel_conversation_id) {
         console.warn(`[SequenceWorker ${jobId}] Nenhuma conversa ativa recente ou channel_conversation_id encontrado para o cliente ${clientData.id}. Não é possível enviar.`);
         // Decidir se deve falhar ou pular. Pular pode ser mais seguro.
         return { status: 'skipped', reason: 'Channel Conversation ID não encontrado' };
    }
    const channelConversationId = conversationData.channel_conversation_id;
     console.log(`[SequenceWorker ${jobId}] Dados do Cliente (Nome: ${clientData.name || 'N/A'}) e Conversa (ChannelID: ${channelConversationId}) OK.`);


    // 6. Obter Credenciais Lumibot
    const { lumibot_account_id, lumibot_api_token } = workspaceData;
    if (!lumibot_account_id || !lumibot_api_token) {
      console.warn(`[SequenceWorker ${jobId}] Credenciais Lumibot ausentes para workspace ${workspaceData.id}. Não é possível enviar.`);
      return { status: 'skipped', reason: 'Credenciais Lumibot ausentes' };
    }

    // 7. Formatar a Mensagem (Substituir Placeholders)
    let messageToSend = currentRule.message_content;
    console.log(`[SequenceWorker ${jobId}] Mensagem original da regra: "${messageToSend}"`);
    if (clientData.name) {
      messageToSend = messageToSend.replace(/\[NomeCliente\]/gi, clientData.name);
      console.log(`[SequenceWorker ${jobId}] Placeholder [NomeCliente] substituído.`);
    }
    // Adicionar mais placeholders conforme necessário
    console.log(`[SequenceWorker ${jobId}] Mensagem final a ser enviada: "${messageToSend}"`);

    // 8. Enviar Mensagem via Lumibot
    console.log(`[SequenceWorker ${jobId}] Enviando mensagem para Lumibot (ChannelConvID: ${channelConversationId})...`);
    const sendResult = await enviarTextoLivreLumibot(
      lumibot_account_id,
      channelConversationId,
      lumibot_api_token,
      messageToSend
    );

    // 9. Lidar com Resultado do Envio e Agendar Próximo Passo
    let nextRuleId: string | null = null;
    let nextDelayMs: number | null = null;

    if (sendResult.success) {
      console.log(`[SequenceWorker ${jobId}] Mensagem enviada com sucesso.`);

      // Encontrar a PRÓXIMA regra na sequência
      const currentRuleIndex = workspaceData.ai_follow_up_rules.findIndex((rule: { id: string }) => rule.id === stepRuleId);
      const nextRule = workspaceData.ai_follow_up_rules[currentRuleIndex + 1];

      if (nextRule) {
        nextRuleId = nextRule.id;
        nextDelayMs = Number(nextRule.delay_milliseconds); // Converter BigInt
        console.log(`[SequenceWorker ${jobId}] Próxima regra encontrada: ID=${nextRuleId}, Delay=${nextDelayMs}ms`);
        if (isNaN(nextDelayMs) || nextDelayMs < 0) {
            console.warn(`[SequenceWorker ${jobId}] Delay da próxima regra (${nextRuleId}) é inválido (${nextDelayMs}ms). Não será agendada.`);
            nextRuleId = null; // Anula agendamento
            nextDelayMs = null;
        }
      } else {
        console.log(`[SequenceWorker ${jobId}] Nenhuma regra posterior encontrada. Sequência será concluída.`);
      }

    } else {
      // O envio falhou
      console.error(`[SequenceWorker ${jobId}] Falha ao enviar mensagem via Lumibot:`, sendResult.responseData);
      // Lançar erro para BullMQ tentar novamente? Ou marcar como falha e parar?
      // Por ora, vamos lançar erro para retentativa.
      throw new Error(`Falha ao enviar mensagem do passo ${stepRuleId} via Lumibot.`);
    }

    // 10. Atualizar o FollowUp no Banco
    const updateData: Prisma.FollowUpUpdateInput = {
      current_sequence_step_order: workspaceData.ai_follow_up_rules.findIndex((r: { id: string }) => r.id === stepRuleId) + 1, // Atualiza para a ordem do passo atual
      updated_at: new Date(),
    };

    if (nextRuleId && nextDelayMs !== null) {
      // Agenda próximo passo
      updateData.next_sequence_message_at = new Date(Date.now() + nextDelayMs);
      updateData.status = 'ACTIVE'; // Mantém ativo

      // Agendar job na fila
      const nextJobData: SequenceJobData = { followUpId, stepRuleId: nextRuleId, workspaceId: workspaceData.id };
      const nextJobOptions = {
          delay: nextDelayMs,
          jobId: `seq_${followUpId}_step_${nextRuleId}`, // ID único
          removeOnComplete: true,
          removeOnFail: 5000,
      };
      try {
        await sequenceStepQueue.add('processSequenceStep', nextJobData, nextJobOptions);
        console.log(`[SequenceWorker ${jobId}] Próximo job (regra ${nextRuleId}) agendado com delay ${nextDelayMs}ms.`);
      } catch (scheduleError) {
          console.error(`[SequenceWorker ${jobId}] ERRO ao agendar PRÓXIMO job de sequência para FollowUp ${followUpId}:`, scheduleError);
          // O que fazer aqui? Falhar o job atual? Logar e continuar?
          // Por segurança, vamos lançar o erro para indicar que o agendamento falhou.
          throw new Error(`Falha ao agendar próximo passo da sequência: ${scheduleError}`);
      }

    } else {
      // Fim da sequência
      console.log(`[SequenceWorker ${jobId}] Marcando FollowUp ${followUpId} como COMPLETED.`);
      updateData.status = 'COMPLETED'; // Usar Enum se tiver
      updateData.next_sequence_message_at = null;
      updateData.completed_at = new Date();
    }

    await prisma.followUp.update({
      where: { id: followUpId },
      data: updateData,
    });
    console.log(`[SequenceWorker ${jobId}] FollowUp ${followUpId} atualizado no DB. Novo status: ${updateData.status}, NextMsgAt: ${updateData.next_sequence_message_at || 'N/A'}`);

    // Opcional: Salvar a mensagem enviada no histórico de mensagens
    try {
        await prisma.message.create({
            data: {
                conversation_id: conversationData.id, // ID da conversa encontrada
                sender_type: 'AI', // Mensagem enviada pela IA da sequência
                content: messageToSend,
                timestamp: new Date(), // Timestamp do envio
                metadata: { ruleId: currentRule.id, type: 'sequence_step_sent' }
            }
        });
        console.log(`[SequenceWorker ${jobId}] Mensagem do passo ${currentRule.id} salva no histórico da conversa ${conversationData.id}.`);
    } catch(logError) {
        console.warn(`[SequenceWorker ${jobId}] Falha ao salvar log da mensagem da sequência:`, logError);
    }


    console.log(`--- [SequenceWorker ${jobId}] FIM (Sucesso) ---`);
    return { status: 'completed', nextStepScheduled: !!nextRuleId };

  } catch (error) {
    console.error(`[SequenceWorker ${jobId}] Erro CRÍTICO ao processar job de sequência para FollowUp ${followUpId}:`, error);
    if (error instanceof Error) {
        console.error(error.stack);
    }
    console.log(`--- [SequenceWorker ${jobId}] FIM (Erro Crítico) ---`);
    // Tentar marcar FollowUp como falhado? Ou deixar BullMQ tentar novamente?
     try {
         await prisma.followUp.update({
             where: { id: followUpId },
             data: { status: 'FAILED' } // Usar Enum se tiver
         });
         console.log(`[SequenceWorker ${jobId}] FollowUp ${followUpId} marcado como FAILED devido a erro crítico.`);
     } catch (updateError) {
          console.error(`[SequenceWorker ${jobId}] Falha ao marcar FollowUp ${followUpId} como FAILED:`, updateError);
     }
    throw error; // Re-lança para BullMQ tratar como falha
  }
}

// --- Inicialização do Worker ---
console.log('[SequenceWorker] Tentando inicializar o worker...');
try {
    const sequenceWorker = new Worker<SequenceJobData>(QUEUE_NAME, processSequenceStepJob, {
      connection: redisConnection,
      concurrency: 5, // Ajustar conforme necessário
      // lockDuration: 60000 // Aumentar se o processamento + envio demorar mais que 30s
    });

    // --- Listeners de Eventos ---
    sequenceWorker.on('completed', (job: Job<SequenceJobData>, result: any) => {
      console.log(`[SequenceWorker] Job ${job.id || 'N/A'} (FollowUp: ${job.data?.followUpId}) concluído. Status: ${result?.status || 'completed'}. Próximo passo agendado: ${result?.nextStepScheduled ? 'Sim' : 'Não/Fim'}. Razão (se pulou): ${result?.reason || 'N/A'}`);
    });

    sequenceWorker.on('failed', (job: Job<SequenceJobData> | undefined, err: Error) => {
      const jobId = job?.id || 'N/A';
      const followUpId = job?.data?.followUpId || 'N/A';
      const attempts = job?.attemptsMade || 0;
      console.error(`[SequenceWorker] Job ${jobId} (FollowUp: ${followUpId}) falhou após ${attempts} tentativas:`, err.message);
       console.error(err);
    });

    sequenceWorker.on('error', (err) => {
      console.error('[SequenceWorker] Erro geral:', err);
    });

     sequenceWorker.on('stalled', (jobId: string) => {
        console.warn(`[SequenceWorker] Job ${jobId} estagnou (stalled). Verificando.`);
    });

    console.log(`[SequenceWorker] Worker iniciado e escutando a fila "${QUEUE_NAME}"...`);

} catch (initError) {
    console.error('[SequenceWorker] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1);
}