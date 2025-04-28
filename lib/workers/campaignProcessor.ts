// lib/workers/campaignProcessor.ts

import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { CAMPAIGN_SENDER_QUEUE } from '@/lib/queues/campaignQueue';
import { prisma } from '@/lib/db';
import { messageQueue, MESSAGE_SENDER_QUEUE } from '@/lib/queues/messageQueue';
import { calculateNextValidSendTime } from '@/lib/timeUtils';

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
          // Calcula o próximo horário válido a partir do último agendamento
          // NOTA: O primeiro contato usa intervalSeconds a partir de 'agora', os subsequentes a partir do anterior.
          const nextValidTime = calculateNextValidSendTime(
              lastScheduleTime,
              scheduledCount === 0 ? 0 : updatedCampaign.sendIntervalSeconds, // Primeiro envio é imediato (delay 0 a partir do 1º slot), os outros têm intervalo
              updatedCampaign.allowedSendStartTime,
              updatedCampaign.allowedSendEndTime,
              allowedDays
          );

          // Calcula o delay em milissegundos a partir de AGORA
          const now = Date.now();
          let delay = nextValidTime.getTime() - now;
          if (delay < 0) delay = 0; // Garante que o delay não seja negativo

          const jobData = {
              campaignContactId: contact.id,
              campaignId: campaignId,
              workspaceId: updatedCampaign.workspaceId,
              // Adicionar outros dados necessários para o envio (ex: channelId, template info se não for buscado depois)
          };

          try {
              await messageQueue.add(MESSAGE_SENDER_QUEUE, jobData, {
                  delay: delay, // Adiciona o job com o delay calculado
                  jobId: `msg-${contact.id}` // ID de job único e previsível (opcional)
              });
              scheduledCount++;
              console.log(`[CampaignProcessor] Job para contato ${contact.id} agendado com delay ${delay}ms para ${nextValidTime.toISOString()}`);
          } catch (queueError) {
             console.error(`[CampaignProcessor] Falha ao adicionar job à ${MESSAGE_SENDER_QUEUE} para contato ${contact.id}:`, queueError);
             // Decidir como tratar: parar tudo? Marcar contato como falho? Continuar?
             // Por enquanto, loga o erro e continua para os próximos contatos.
             // TODO: Melhorar tratamento de erro aqui.
          }

          // Atualiza o ponto de partida para o cálculo do próximo contato
          lastScheduleTime = nextValidTime;
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