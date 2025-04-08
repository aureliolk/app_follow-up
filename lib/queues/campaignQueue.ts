import { Queue } from 'bullmq';
import { redisConnection } from '../redis'; // Importa a conexão Redis configurada

// Nome consistente para a fila
export const CAMPAIGN_SENDER_QUEUE = 'campaign-sender';

// Cria e exporta a instância da fila
export const campaignQueue = new Queue(CAMPAIGN_SENDER_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Número de tentativas em caso de falha
    backoff: {
      type: 'exponential',
      delay: 5000, // Atraso inicial de 5 segundos para retentativa
    },
    removeOnComplete: true, // Remove jobs da fila após sucesso
    removeOnFail: 1000,     // Mantém os últimos 1000 jobs falhados para análise
  },
});

console.log(`[QUEUE] Fila ${CAMPAIGN_SENDER_QUEUE} inicializada.`);

// Listener para erros gerais da fila (conexão, etc.)
campaignQueue.on('error', (err) => {
  console.error(`[QUEUE ERROR] Erro na fila ${CAMPAIGN_SENDER_QUEUE}:`, err);
});

// Opcional: Listener para quando um job falha todas as tentativas
// campaignQueue.on('failed', (job, err) => {
//   console.error(`[JOB FAILED] Job ${job?.id} na fila ${CAMPAIGN_SENDER_QUEUE} falhou após todas as tentativas:`, err);
//   // Aqui você poderia adicionar lógica para notificar administradores, por exemplo
// });

// Opcional: Listener para jobs ativos (começando a processar)
// campaignQueue.on('active', (job) => {
//   console.log(`[JOB ACTIVE] Job ${job.id} iniciado na fila ${CAMPAIGN_SENDER_QUEUE}`);
// });

// Opcional: Listener para jobs concluídos com sucesso
// campaignQueue.on('completed', (job) => {
//   console.log(`[JOB COMPLETED] Job ${job.id} concluído com sucesso na fila ${CAMPAIGN_SENDER_QUEUE}`);
// });
