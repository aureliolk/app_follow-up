// lib/workers/campaignProcessor.ts

import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { CAMPAIGN_SENDER_QUEUE } from '@/lib/queues/campaignQueue';
import { prisma } from '@/lib/db';
import { messageQueue, MESSAGE_SENDER_QUEUE } from '@/lib/queues/messageQueue';
import { calculateNextValidSendTime } from '@/lib/timeUtils'; // scheduling simplified
import { MessageSenderType, Prisma } from '@prisma/client';
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils';
import pusher from '@/lib/pusher';
import { createDeal, getPipelineStages } from '@/lib/actions/pipelineActions';
import { getOrCreateConversation } from '../services/createConversation';

// <<< INÍCIO: Função Auxiliar para Substituir Variáveis >>>
/**
 * Substitui placeholders como {{key}} em uma string de template
 * pelos valores correspondentes em um objeto de variáveis.
 * @param template A string do template.
 * @param variables Um objeto onde as chaves são os identificadores das variáveis (ex: "1", "body1") e os valores são o que substituir.
 * @returns A string com as variáveis substituídas.
 */
function substituteTemplateVariables(template: string, variables: Record<string, string>): string {
    if (!template) return ''; // Retorna vazio se o template for nulo/vazio
    let substitutedMessage = template;
    if (variables && typeof variables === 'object') {
        for (const key in variables) {
            // Escapa caracteres especiais na chave para usar em RegExp
            const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\\\$&');
            // Cria RegExp para encontrar {{key}} globalmente
            const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
            substitutedMessage = substitutedMessage.replace(regex, variables[key] || ''); // Substitui ou usa string vazia se valor for null/undefined
        }
    }
     // Adicional: Remover quaisquer placeholders {{...}} que não foram substituídos?
     // substitutedMessage = substitutedMessage.replace(/\\{\\{.*?\\}\\}/g, ''); // Opcional
    return substitutedMessage;
}
// <<< FIM: Função Auxiliar >>>

console.log(`[Worker] Inicializando Worker para a fila: ${CAMPAIGN_SENDER_QUEUE}`);

/**
 * Worker que processa o início de uma campanha de disparo em massa.
 * Recebe o campaignId, busca os contatos e agenda os envios individuais.
 */
const campaignProcessorWorker = new Worker(
  CAMPAIGN_SENDER_QUEUE,
  async (job: Job<{ campaignId: string }>) => {
    const { campaignId } = job.data;
    console.log(`[CampaignProcessor] Recebido job ${job.id} para processar campanha: ${campaignId}`);

    if (!campaignId) {
        console.error(`[CampaignProcessor] Erro: Job ${job.id} não contém campaignId.`);
        throw new Error("Job data is missing campaignId");
    }

    try {
      // 1. Buscar detalhes da campanha e contatos PENDING
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          contacts: {
            where: { status: 'PENDING' }, // Apenas contatos pendentes
            orderBy: { createdAt: 'asc' }, // Processar na ordem de criação
          },
        },
      });

      if (!campaign) {
        console.error(`[CampaignProcessor] Campanha ${campaignId} não encontrada.`);
        throw new Error(`Campaign ${campaignId} not found.`);
      }

      // Se a campanha não estiver PENDING, já foi processada ou está pausada/falhou
      if (campaign.status !== 'PENDING') {
        console.log(`[CampaignProcessor] Campanha ${campaignId} não está PENDING (status: ${campaign.status}). Pulando.`);
        return; // Job concluído sem fazer nada, pois não está no estado inicial esperado
      }

      const contactsToProcess = campaign.contacts;

      // 5. Se não houver contatos PENDING
      if (!contactsToProcess || contactsToProcess.length === 0) {
        console.log(`[CampaignProcessor] Campanha ${campaignId} não possui contatos PENDING. Marcando como COMPLETED.`);
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'COMPLETED' }, // Marcar como concluída
        });
        // TODO: Notificar via SSE?
        return; // Job concluído
      }

      // 2. Mudar status da Campanha para 'RUNNING'
      console.log(`[CampaignProcessor] Atualizando status da campanha ${campaignId} para RUNNING.`);
      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'RUNNING' },
      });
      // TODO: Notificar via SSE?

      console.log(`[CampaignProcessor] ${contactsToProcess.length} contatos PENDING encontrados para a campanha ${campaignId}. Iniciando agendamento...`);

      // <<< Parsear allowedDays (vem como string JSON) >>>
      let allowedDays: number[] = [];
      try {
        allowedDays = JSON.parse(updatedCampaign.allowedSendDays);
        if (!Array.isArray(allowedDays) || !allowedDays.every(d => typeof d === 'number' && d >= 0 && d <= 6)) {
             throw new Error('Formato inválido para allowedSendDays');
        }
      } catch(parseError) {
        console.error(`[CampaignProcessor] Erro ao parsear allowedSendDays para campanha ${campaignId}:`, updatedCampaign.allowedSendDays, parseError);
        // Tratar o erro - talvez falhar o job ou usar um padrão (ex: todos os dias)?
        // Por enquanto, falha o job para evitar comportamento inesperado.
        throw new Error("Falha ao parsear allowedSendDays da campanha.");
      }

      // <<< Lógica de Agendamento (Passos 3 e 4) >>>
      let lastScheduleTime = new Date(); // Começa a calcular a partir de agora
      let scheduledCount = 0;

      for (const contact of contactsToProcess) {
          // <<< INÍCIO: Lógica de Criação de Conversa e Follow-up >>>
          let shouldScheduleMessage = true; // Flag para controlar se o job de envio deve ser agendado
          let conversationId: string | null = null; // <<< Variável para guardar o ID da conversa >>>
          let clientId: string | null = null; // <<< Variável para guardar o ID do cliente >>>
          let createdMessageId: string | null = null; // <<< Variável para guardar ID da msg criada >>>

          try {
              const clientPhoneNumberRaw = contact.contactInfo;
              const standardizedPhoneNumber = standardizeBrazilianPhoneNumber(clientPhoneNumberRaw);

              if (!standardizedPhoneNumber) {
                  console.warn(`[CampaignProcessor ${job.id}] Número de contato inválido ou não padronizável: ${clientPhoneNumberRaw} para Contato ${contact.id}. Marcando como FAILED.`);
                  await prisma.campaignContact.update({
                      where: { id: contact.id },
                      data: { status: 'FAILED', error: 'Número de telefone inválido ou não padronizável.' },
                  });
                  shouldScheduleMessage = false; // Não agendar mensagem
                  continue; // Pula para o próximo contato no loop
              }

              console.log(`[CampaignProcessor ${job.id}] Padronizado ${clientPhoneNumberRaw} -> ${standardizedPhoneNumber}. Buscando/Criando conversa para Contato ${contact.id}...`);

              const { conversation, client, conversationWasCreated, clientWasCreated } = await getOrCreateConversation(
                  updatedCampaign.workspaceId, // Usar o workspaceId da campanha atualizada
                  standardizedPhoneNumber,
                  contact.contactName || undefined // Passa o nome se existir
              );
              conversationId = conversation.id; // <<< Armazena ID da conversa >>>
              clientId = client.id; // <<< Armazena ID do cliente >>>
              console.log(`[CampaignProcessor ${job.id}] Conversa ${conversation.id} ${conversationWasCreated ? 'CRIADA' : 'recuperada'} para Cliente ${client.id} (Contato Campanha: ${contact.id}) (${clientWasCreated ? 'NOVO CLIENTE' : 'CLIENTE EXISTENTE'})`);

              // <<< INÍCIO: Lógica para criar Deal se novo cliente >>>
              if (clientWasCreated) {
                  console.log(`[CampaignProcessor ${job.id}] Novo cliente ${client.id} criado via campanha. Tentando criar Deal no Kanban...`);
                  try {
                      const stages = await getPipelineStages(updatedCampaign.workspaceId);
                      if (stages && stages.length > 0) {
                          const firstStage = stages[0];
                          const dealName = `Lead Campanha: ${client.name || client.phone_number}`;
                          
                          await createDeal(updatedCampaign.workspaceId, {
                              name: dealName,
                              stageId: firstStage.id,
                              clientId: client.id,
                              value: null, // Ou 0, ou um valor padrão se aplicável
                          });
                          console.log(`[CampaignProcessor ${job.id}] Deal "${dealName}" criado com sucesso para cliente ${client.id} no estágio "${firstStage.name}".`);
                      } else {
                          console.warn(`[CampaignProcessor ${job.id}] Nenhum estágio de pipeline encontrado para workspace ${updatedCampaign.workspaceId}. Deal não criado para novo cliente ${client.id} da campanha.`);
                      }
                  } catch (dealError) {
                      console.error(`[CampaignProcessor ${job.id}] Erro ao criar Deal para novo cliente ${client.id} da campanha:`, dealError);
                      // Não interromper o processamento da campanha por isso, apenas logar.
                  }
              }
              // <<< FIM: Lógica para criar Deal se novo cliente >>>

          } catch (convFollowUpError) {
              console.error(`[CampaignProcessor ${job.id}] Erro crítico durante getOrCreateConversation ou setup de FollowUp para Contato ${contact.id}:`, convFollowUpError);
              // Marcar contato como FAILED
               await prisma.campaignContact.update({
                   where: { id: contact.id },
                   data: { status: 'FAILED', error: `Erro ao criar/buscar conversa ou iniciar follow-up: ${convFollowUpError instanceof Error ? convFollowUpError.message : String(convFollowUpError)}` },
               });
               shouldScheduleMessage = false; // Não agendar mensagem
               continue; // Pula para o próximo contato no loop
          }
          // <<< FIM: Lógica de Criação de Conversa e Follow-up >>>

          // Só agenda o envio se a criação/verificação da conversa e follow-up ocorreram sem erros críticos
          if (shouldScheduleMessage && conversationId && clientId) { // <<< Adiciona verificação de conversationId e clientId

             // <<< INÍCIO: Salvar Mensagem Inicial e Notificar UI >>>
             try {
                const scheduledTimestamp = new Date(); // Hora em que foi agendada
                const savedMessage = await prisma.message.create({
                   data: {
                      conversation_id: conversationId,
                      sender_type: MessageSenderType.SYSTEM, // Ou AGENT se apropriado
                      content: substituteTemplateVariables(
                          updatedCampaign.message, // Template original
                          (typeof contact.variables === 'object' && contact.variables !== null && !Array.isArray(contact.variables))
                            ? contact.variables as Record<string, string>
                            : {} // Objeto de variáveis do contato
                      ),
                      status: 'PENDING', // <<< ALTERADO de 'SCHEDULED' para 'PENDING' >>>
                      timestamp: scheduledTimestamp, // Hora do agendamento
                      metadata: {
                         campaignId: updatedCampaign.id,
                         campaignContactId: contact.id,
                         isCampaignMessage: true,
                         ...(updatedCampaign.isTemplate && {
                             templateName: updatedCampaign.templateName,
                             templateLanguage: updatedCampaign.templateLanguage,
                             // Incluir variáveis aqui se necessário/disponível?
                         })
                      } as Prisma.JsonObject, // <<< Usar Prisma.JsonObject >>>
                      channel_message_id: null,
                      // workspace_id não é campo direto aqui, é via conversation
                   },
                   // Incluir dados para notificação se necessário (ex: cliente)
                   include: { conversation: { select: { client: true } } }
                });
                createdMessageId = savedMessage.id;
                console.log(`[CampaignProcessor ${job.id}] Mensagem inicial ${savedMessage.id} salva (PENDING) para Conv ${conversationId}`); // <<< Log ajustado >>>

                // Notificar front-end via Pusher
                const pusherChannel = `private-workspace-${updatedCampaign.workspaceId}`;
                await pusher.trigger(pusherChannel, 'new_message', JSON.stringify({ type: 'new_message', payload: savedMessage }));
                console.log(`[CampaignProcessor ${job.id}] Evento 'new_message' enviado via Pusher para ${pusherChannel}`);

             } catch (saveMsgError) {
                 console.error(`[CampaignProcessor ${job.id}] Erro ao salvar mensagem inicial PENDING ou notificar UI para Contato ${contact.id}:`, saveMsgError);
                 // Marcar contato como FAILED e pular agendamento
                 await prisma.campaignContact.update({
                     where: { id: contact.id },
                     data: { status: 'FAILED', error: `Erro ao salvar/notificar mensagem inicial: ${saveMsgError instanceof Error ? saveMsgError.message : String(saveMsgError)}` },
                 });
                 shouldScheduleMessage = false; // Redundante devido ao continue, mas seguro
                 continue; // Pula para o próximo contato
             }
             // <<< FIM: Salvar Mensagem Inicial e Notificar UI >>>

              // --- Código existente para agendar job na messageQueue --- 
              if (!createdMessageId) { // Checagem extra de segurança
                 console.error(`[CampaignProcessor ${job.id}] Erro INTERNO: createdMessageId não foi definido antes de agendar envio para contato ${contact.id}`);
                 await prisma.campaignContact.update({ where: { id: contact.id }, data: { status: 'FAILED', error: 'Erro interno: Falha ao obter ID da mensagem salva.' } });
                 continue;
              }

              // Calcula o próximo horário válido...
              const nextValidTime = calculateNextValidSendTime(
                  lastScheduleTime,
                  scheduledCount === 0 ? 0 : updatedCampaign.sendIntervalSeconds,
                  updatedCampaign.allowedSendStartTime,
                  updatedCampaign.allowedSendEndTime,
                  allowedDays
              );
              // Calcula o delay...
              const now = Date.now();
              let delay = nextValidTime.getTime() - now;
              if (delay < 0) delay = 0;

              const messageJobData = { // Renomeado para clareza
                  campaignContactId: contact.id,
                  campaignId: campaignId,
                  workspaceId: updatedCampaign.workspaceId,
                  messageIdToUpdate: createdMessageId, // <<< Passa o ID da mensagem criada
                  conversationId: conversationId, // <<< ADICIONADO >>>
                  scheduledSendTime: nextValidTime.toISOString(), // <<< Passa a hora agendada
              };

              try {
                  // Atualiza o status do contato antes de colocar o job na fila
                  await prisma.campaignContact.update({
                      where: { id: contact.id },
                      data: { status: 'SCHEDULED' }
                  });

                  await messageQueue.add(MESSAGE_SENDER_QUEUE, messageJobData, {
                      delay: delay,
                      jobId: `msg-${contact.id}` // Ou usar messageIdToUpdate? `msg-${createdMessageId}`
                  });
                  scheduledCount++;
                  console.log(`[CampaignProcessor] Job para contato ${contact.id} (Msg ${createdMessageId}) agendado com delay ${delay}ms para ${nextValidTime.toISOString()}`);

              } catch (queueError) {
                 console.error(`[CampaignProcessor] Falha ao adicionar job à ${MESSAGE_SENDER_QUEUE} para contato ${contact.id} (Msg ${createdMessageId}):`, queueError);
                 // Marcar contato como FAILED e a mensagem também?
                 await prisma.campaignContact.update({
                     where: { id: contact.id },
                     data: { status: 'FAILED', error: `Falha ao agendar job de envio na fila: ${queueError instanceof Error ? queueError.message : String(queueError)}` },
                 });
                 // <<< Corrigir atualização da mensagem em caso de falha >>>
                 try {
                     // Buscar metadados existentes
                     const existingMessage = await prisma.message.findUnique({ where: { id: createdMessageId }, select: { metadata: true } });
                     const currentMetadata = (typeof existingMessage?.metadata === 'object' && existingMessage.metadata !== null) ? existingMessage.metadata : {};

                     await prisma.message.update({
                         where: { id: createdMessageId },
                         data: {
                             status: 'FAILED', // <<< Usar string literal >>>
                             metadata: { // <<< Armazenar erro em metadata >>>
                                ...currentMetadata,
                                queueError: `Falha ao agendar job de envio na fila: ${queueError instanceof Error ? queueError.message : String(queueError)}`
                             }
                         }
                     });
                 } catch (updateMsgError) {
                     console.error(`[CampaignProcessor] Falha ANINHADA ao tentar marcar mensagem ${createdMessageId} como FAILED após erro na fila:`, updateMsgError);
                 }
                 // <<< Fim Correção >>>
                 // TODO: Melhorar tratamento de erro aqui.
              }

              // Atualiza o ponto de partida para o cálculo do próximo contato
              lastScheduleTime = nextValidTime;
          } // Fim if (shouldScheduleMessage)
      }

      console.log(`[CampaignProcessor] ${scheduledCount} de ${contactsToProcess.length} contatos agendados para campanha ${campaignId}.`);

      // O status da campanha permanece RUNNING. Será marcado como COMPLETED
      // pelo messageSenderWorker quando o último contato for processado (ou falhar).
      // Remover a simulação de trabalho:
      // await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`[CampaignProcessor] Erro ao processar job ${job.id} para campanha ${campaignId}:`, error);
      // Lança o erro para que BullMQ possa tentar novamente ou marcar como falho
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Processa até 5 jobs simultaneamente (ajustar conforme necessário)
    limiter: {      // Exemplo: Limita a 100 jobs processados a cada 10 segundos
      max: 100,
      duration: 10000,
    },
  }
);

campaignProcessorWorker.on('completed', (job: Job<{ campaignId: string }>) => {
  console.log(`[CampaignProcessor] Job ${job.id} para campanha ${job.data.campaignId} concluído.`);
});

campaignProcessorWorker.on('failed', (job: Job<{ campaignId: string }> | undefined, err: Error) => {
  if (job) {
    console.error(`[CampaignProcessor] Job ${job.id} para campanha ${job.data?.campaignId} falhou:`, err);
  } else {
    console.error(`[CampaignProcessor] Um job falhou sem ID definido:`, err);
  }
});

campaignProcessorWorker.on('error', err => {
    // Erros de conexão Redis, etc.
    console.error('[CampaignProcessor] Erro no worker:', err);
});

export { campaignProcessorWorker }; 