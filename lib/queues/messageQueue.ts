// lib/queues/messageQueue.ts

import { Queue } from 'bullmq';
import { redisConnection } from '../redis'; // Importa a conexão Redis configurada

// Nome consistente para a fila de envio de mensagens individuais
export const MESSAGE_SENDER_QUEUE = 'message-sender';

// Cria e exporta a instância da fila
export const messageQueue = new Queue(MESSAGE_SENDER_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5, // Número de tentativas em caso de falha no envio
    backoff: {
      type: 'exponential',
      delay: 10000, // Atraso inicial de 10 segundos para retentativa de envio
    },
    removeOnComplete: 5000, // Mantém os últimos 5000 jobs completos para histórico
    removeOnFail: 10000,    // Mantém os últimos 10000 jobs falhados para análise
  },
});

console.log(`[QUEUE] Fila ${MESSAGE_SENDER_QUEUE} inicializada.`);

// Listener para erros gerais da fila
messageQueue.on('error', (err) => {
  console.error(`[QUEUE ERROR] Erro na fila ${MESSAGE_SENDER_QUEUE}:`, err);
});

// Opcional: Listeners específicos para jobs nesta fila podem ser adicionados se necessário
// messageQueue.on('failed', (job, err) => {
//   console.error(`[JOB FAILED - MESSAGE] Job ${job?.id} na fila ${MESSAGE_SENDER_QUEUE} falhou:`, err);
// });
// messageQueue.on('completed', (job) => {
//   console.log(`[JOB COMPLETED - MESSAGE] Job ${job.id} concluído na fila ${MESSAGE_SENDER_QUEUE}`);
// }); 