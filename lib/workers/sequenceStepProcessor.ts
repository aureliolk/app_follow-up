// apps/workers/src/workers/sequenceStepProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { sendWhatsappMessage } from '@/lib/channel/whatsappSender';
import { decrypt } from '@/lib/encryption';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue';
import { FollowUpStatus, Prisma, ConversationStatus, MessageSenderType } from '@prisma/client'; // Importe Prisma para tipos
import { formatMsToDelayString, parseDelayStringToMs } from '@/lib/timeUtils'; // Importar utils

const QUEUE_NAME = 'sequence-steps';

interface SequenceJobData {
  followUpId: string;
  stepRuleId: string; // ID da WorkspaceAiFollowUpRule a ser processada
  workspaceId: string; // ID do Workspace (opcional, mas útil ter)
}

// --- Função de Processamento do Job ---
async function processSequenceStepJob(job: Job<SequenceJobData>) {
  console.log(`[SequenceWorker] Tentando iniciar processamento para Job ID: ${job.id}, Step Rule ID: ${job.data?.stepRuleId}, FollowUp ID: ${job.data?.followUpId}`);

  const jobId = job.id || 'unknown-sequence-job';
  const { followUpId, stepRuleId, workspaceId: jobWorkspaceId } = job.data; // jobWorkspaceId pode ser redundante se buscarmos via followUp

  console.log(`\n--- [SequenceWorker ${jobId}] INÍCIO ---`);
  console.log(`[SequenceWorker ${jobId}] Processando Step Rule ${stepRuleId} para FollowUp ${followUpId}`);

  try {
    // 1. Buscar FollowUp e dados relacionados
    console.log(`[SequenceWorker ${jobId}] Buscando FollowUp ${followUpId}...`);
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        workspace: {
          select: {
            id: true,
            whatsappAccessToken: true,
            whatsappPhoneNumberId: true,
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
            phone_number: true,
            conversations: {
                where: { channel: 'WHATSAPP', status: ConversationStatus.ACTIVE },
                select: { id: true, status: true, is_ai_active: true, metadata: true },
                orderBy: { last_message_at: 'desc' },
                take: 1
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
    if (followUp.status !== FollowUpStatus.ACTIVE) { // Usar Enum
      console.log(`[SequenceWorker ${jobId}] FollowUp ${followUpId} não está ativo (Status: ${followUp.status}). Job ignorado.`);
      return { status: 'skipped', reason: `FollowUp não ativo (${followUp.status})` };
    }

    // 3. Verificar se o Workspace foi carregado
    if (!followUp.workspace) {
         console.error(`[SequenceWorker ${jobId}] ERRO INESPERADO: Workspace não incluído para FollowUp ${followUpId}.`);
         throw new Error(`Workspace não encontrado nos dados do FollowUp ${followUpId}.`);
    }
     const workspaceData = followUp.workspace;
     console.log(`[SequenceWorker ${jobId}] Dados do Workspace (ID: ${workspaceData.id}) carregados.`);

    // 4. Encontrar a regra ATUAL
    const currentRule = workspaceData.ai_follow_up_rules.find((rule) => rule.id === stepRuleId);
    if (!currentRule) {
        console.error(`[SequenceWorker ${jobId}] Regra de passo ${stepRuleId} não encontrada nas regras do workspace ${workspaceData.id}.`);
        throw new Error(`Regra ${stepRuleId} não encontrada para o workspace.`);
    }
     console.log(`[SequenceWorker ${jobId}] Regra atual encontrada: ID=${currentRule.id}`);

    // 5. Obter dados do Cliente e ID da Conversa
    const clientData = followUp.client;
    if (!clientData?.phone_number) {
        console.error(`[SequenceWorker ${jobId}] Cliente ou número de telefone não encontrado para FollowUp ${followUpId}.`);
        throw new Error(`Cliente ou telefone não encontrado nos dados do FollowUp ${followUpId}.`);
    }
    const clientPhoneNumber = clientData.phone_number;
    const activeConversation = clientData.conversations?.[0];
    if (!activeConversation) {
         console.warn(`[SequenceWorker ${jobId}] NENHUMA CONVERSA ATIVA encontrada para Cliente ${clientData.id} / Workspace ${workspaceData.id}. Não é possível salvar a mensagem de follow-up.`);
    } else {
        console.log(`[SequenceWorker ${jobId}] Conversa ativa encontrada: ID=${activeConversation.id}`);
    }
    console.log(`[SequenceWorker ${jobId}] Dados do Cliente (Nome: ${clientData.name || 'N/A'}, Telefone: ${clientPhoneNumber}) OK.`);

    // 6. Obter Credenciais WhatsApp e Descriptografar
    const { whatsappAccessToken, whatsappPhoneNumberId } = workspaceData;
    if (!whatsappAccessToken || !whatsappPhoneNumberId) {
      console.warn(`[SequenceWorker ${jobId}] Credenciais WhatsApp ausentes para workspace ${workspaceData.id}. Não é possível enviar.`);
      return { status: 'skipped', reason: 'Credenciais WhatsApp ausentes' };
    }

    let decryptedAccessToken: string | null = null;
    try {
        decryptedAccessToken = decrypt(whatsappAccessToken);
        if (!decryptedAccessToken) throw new Error("Token de acesso WhatsApp descriptografado está vazio.");
    } catch (decryptError: any) {
         console.error(`[SequenceWorker ${jobId}] Falha ao descriptografar token WhatsApp para Workspace ${workspaceData.id}:`, decryptError.message);
         return { status: 'failed', reason: 'Falha ao descriptografar token WhatsApp' };
    }

    // 7. Formatar a Mensagem
    let messageToSend = currentRule.message_content;
    console.log(`[SequenceWorker ${jobId}] Mensagem original da regra: "${messageToSend}"`);
    if (clientData.name) {
      messageToSend = messageToSend.replace(/\\[NomeCliente\\]/gi, clientData.name);
      console.log(`[SequenceWorker ${jobId}] Placeholder [NomeCliente] substituído.`);
    }
    console.log(`[SequenceWorker ${jobId}] Mensagem final a ser enviada: "${messageToSend}"`);

    // 8. Enviar Mensagem via WhatsApp
    console.log(`[SequenceWorker ${jobId}] Enviando mensagem para WhatsApp (Número: ${clientPhoneNumber})...`);
    let sendSuccess = false;
    let errorMessage: string | null = null;
    let sentMessageIdFromWhatsapp: string | null = null;
    try {
        const sendResult = await sendWhatsappMessage(
            whatsappPhoneNumberId,
            clientPhoneNumber,
            decryptedAccessToken,
            messageToSend
        );
        if (sendResult.success && sendResult.messageId) {
            sendSuccess = true;
            sentMessageIdFromWhatsapp = sendResult.messageId;
        } else {
            errorMessage = JSON.stringify(sendResult.error || 'Erro desconhecido no envio WhatsApp');
        }
    } catch (sendError: any) {
        errorMessage = `Exceção durante envio WhatsApp: ${sendError.message}`;
        console.error(`[SequenceWorker ${jobId}] Exceção ao enviar mensagem via WhatsApp para ${clientPhoneNumber}:`, sendError);
    }

    // 9. Lidar com Resultado do Envio, Salvar Mensagem, Publicar, Agendar Próximo Passo
    let nextRuleId: string | null = null;
    let nextDelayMs: number | null = null;

    if (sendSuccess) {
      console.log(`[SequenceWorker ${jobId}] Mensagem enviada com sucesso (WPP ID: ${sentMessageIdFromWhatsapp}).`);

      if (activeConversation) {
          try {
              const savedMessage = await prisma.message.create({
                  data: {
                      conversation_id: activeConversation.id,
                      sender_type: MessageSenderType.AI,
                      content: messageToSend,
                      timestamp: new Date(),
                      channel_message_id: sentMessageIdFromWhatsapp,
                      metadata: {
                          followUpId: followUpId,
                          stepRuleId: stepRuleId,
                      }
                  },
                  select: { id: true, conversation_id: true, content: true, timestamp: true, sender_type: true }
              });
              console.log(`[SequenceWorker ${jobId}] Mensagem de follow-up ${savedMessage.id} salva para Conv ${activeConversation.id}.`);

              try {
                  const conversationChannel = `chat-updates:${activeConversation.id}`;
                  const conversationPayloadString = JSON.stringify(savedMessage);
                  await redisConnection.publish(conversationChannel, conversationPayloadString);
                  console.log(`[SequenceWorker ${jobId}] Mensagem ${savedMessage.id} publicada no canal Redis da CONVERSA: ${conversationChannel}`);
              } catch (publishConvError) {
                  console.error(`[SequenceWorker ${jobId}] Falha ao publicar mensagem ${savedMessage.id} no Redis (Canal Conversa):`, publishConvError);
              }

              try {
                  const workspaceChannel = `workspace-updates:${workspaceData.id}`;
                  const workspacePayload = {
                       type: 'new_message',
                       conversationId: activeConversation.id,
                       channel: 'WHATSAPP',
                       status: activeConversation.status,
                       is_ai_active: activeConversation.is_ai_active,
                       lastMessageTimestamp: savedMessage.timestamp.toISOString(),
                       last_message_at: savedMessage.timestamp.toISOString(),
                       clientId: clientData.id,
                       clientName: clientData.name,
                       clientPhone: clientData.phone_number,
                       lastMessageContent: savedMessage.content,
                       lastMessageSenderType: savedMessage.sender_type,
                       metadata: activeConversation.metadata,
                  };
                  await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
                  console.log(`[SequenceWorker ${jobId}] Notificação ENRIQUECIDA (follow-up) publicada no canal Redis do WORKSPACE: ${workspaceChannel}`);
              } catch (publishWsError) {
                  console.error(`[SequenceWorker ${jobId}] Falha ao publicar notificação de follow-up no Redis (Canal Workspace):`, publishWsError);
              }

          } catch (saveError) {
              console.error(`[SequenceWorker ${jobId}] ERRO ao salvar mensagem de follow-up para Conv ${activeConversation.id}:`, saveError);
          }
      } else {
          console.warn(`[SequenceWorker ${jobId}] Conversa ativa não encontrada. Mensagem enviada ("${messageToSend}") não será salva no histórico.`);
      }

      // Encontrar a PRÓXIMA regra na sequência
      const currentRuleIndex = workspaceData.ai_follow_up_rules.findIndex((rule) => rule.id === stepRuleId);
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
      console.error(`[SequenceWorker ${jobId}] Falha ao enviar mensagem via WhatsApp:`, errorMessage);
      // Lançar erro para BullMQ tentar novamente (ou ter tratamento de falha customizado)
      throw new Error(`Falha ao enviar mensagem do passo ${stepRuleId} via WhatsApp: ${errorMessage}`);
    }

    // 10. Atualizar o FollowUp no Banco
    const updateData: Prisma.FollowUpUpdateInput = {
      current_sequence_step_order: workspaceData.ai_follow_up_rules.findIndex((r) => r.id === stepRuleId) + 1,
      updated_at: new Date(),
    };

    if (nextRuleId && nextDelayMs !== null) {
      // Agenda próximo passo
      updateData.next_sequence_message_at = new Date(Date.now() + nextDelayMs);
      updateData.status = FollowUpStatus.ACTIVE; // Manter ativo (usar Enum)

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
          throw new Error(`Falha ao agendar próximo passo da sequência: ${scheduleError}`);
      }

    } else {
      // Fim da sequência
      console.log(`[SequenceWorker ${jobId}] Marcando FollowUp ${followUpId} como COMPLETED.`);
      updateData.status = FollowUpStatus.COMPLETED; // Usar Enum
      updateData.next_sequence_message_at = null;
      updateData.completed_at = new Date();
    }

    await prisma.followUp.update({
      where: { id: followUpId },
      data: updateData,
    });
    console.log(`[SequenceWorker ${jobId}] FollowUp ${followUpId} atualizado no DB. Novo status: ${updateData.status}, NextMsgAt: ${updateData.next_sequence_message_at || 'N/A'}`);

    console.log(`--- [SequenceWorker ${jobId}] FIM (Sucesso) ---`);
    return { status: 'completed', nextStepScheduled: !!nextRuleId };

  } catch (error: any) {
    console.error(`[SequenceWorker ERROR ${job?.id}] Erro processando step ${stepRuleId} para FollowUp ${followUpId}:`, error);
     try {
         await prisma.followUp.update({
             where: { id: followUpId },
             data: { status: FollowUpStatus.FAILED } // Usar Enum
         });
         console.log(`[SequenceWorker ${jobId}] FollowUp ${followUpId} marcado como FAILED devido a erro crítico.`);
     } catch (updateError) {
          console.error(`[SequenceWorker ${jobId}] Falha ao marcar FollowUp ${followUpId} como FAILED:`, updateError);
     }
    throw error; // Re-lança para BullMQ
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

    // <<< ADICIONAR LISTENERS DE DEBUG >>>
    sequenceWorker.on('active', (job: Job<SequenceJobData>) => {
      // Este evento dispara QUANDO o worker pega um job para processar.
      console.log(`[SequenceWorker EVENT] Job ATIVO: ${job.id || 'N/A'} (FollowUp: ${job.data?.followUpId})`);
    });

    console.log(`[SequenceWorker] Worker iniciado e escutando a fila "${QUEUE_NAME}"...`);

} catch (initError) {
    console.error('[SequenceWorker] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1);
}