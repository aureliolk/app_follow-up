// lib/queues/messageProcessingQueue.ts
import { Queue } from 'bullmq';
import { redisConnection } from '@meuprojeto/shared-lib/src/redis';

const QUEUE_NAME = 'message-processing';

// Exporta a instância da fila
export const messageProcessingQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3, // Tenta reprocessar 3 vezes em caso de falha
        backoff: {
            type: 'exponential',
            delay: 1000, // Espera 1s, depois 2s, depois 4s
        },
        removeOnComplete: true, // Remove jobs bem-sucedidos
        removeOnFail: 1000, // Mantém jobs falhos por 1000 jobs
    }
});

console.log(`🚀 Fila BullMQ "${QUEUE_NAME}" inicializada.`);

// Opcional: Event listeners para a fila
messageProcessingQueue.on('error', (error) => {
     console.error(`❌ Erro na fila BullMQ "${QUEUE_NAME}":`, error);
});