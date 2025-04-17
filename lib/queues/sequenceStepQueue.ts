// apps/workers/src/queues/sequenceStepQueue.ts
import { Queue } from 'bullmq';
import { redisConnection } from '@/lib/redis';

const SEQUENCE_QUEUE_NAME = 'sequence-steps';

export const sequenceStepQueue = new Queue(SEQUENCE_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3, // Tentativas para enviar um passo da sequência
        backoff: { type: 'exponential', delay: 60000 }, // Backoff maior (1 min, 2 min, 4 min)
        removeOnComplete: true, // Remove jobs bem-sucedidos
        removeOnFail: 10000,     // Mantém mais jobs falhos para análise
    }
});

console.log(`🚀 Fila BullMQ "${SEQUENCE_QUEUE_NAME}" inicializada.`);

sequenceStepQueue.on('error', (error) => {
    console.error(`❌ Erro na fila BullMQ "${SEQUENCE_QUEUE_NAME}":`, error);
});