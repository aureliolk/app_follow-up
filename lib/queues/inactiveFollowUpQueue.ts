// Exemplo em lib/queues/inactiveFollowUpQueue.ts
import { Queue } from 'bullmq';
import { redisConnection } from '@/packages/shared-lib/src/redis';

const INACTIVE_QUEUE_NAME = 'inactive-follow-up';

export const inactiveFollowUpQueue = new Queue(INACTIVE_QUEUE_NAME, {
    connection: redisConnection,
    // Default options podem ser ajustados se necessário para esta fila
    defaultJobOptions: {
        attempts: 2, // Talvez menos tentativas para follow-up?
        backoff: { type: 'exponential', delay: 5000 }, // Backoff maior?
        removeOnComplete: true,
        removeOnFail: 5000, // Manter mais falhas para análise?
    }
});

console.log(`🚀 Fila BullMQ "${INACTIVE_QUEUE_NAME}" inicializada.`);
inactiveFollowUpQueue.on('error', (error) => {
    console.error(`❌ Erro na fila BullMQ "${INACTIVE_QUEUE_NAME}":`, error);
});