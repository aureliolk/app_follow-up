// lib/queues/messageProcessingQueue.ts
import { Queue } from 'bullmq';
// import { redisConnection } from '@/lib/redis'; // <<< Mudar
import { redisConnection } from '../redis.js'; // <<< Usar caminho relativo com .js

const QUEUE_NAME = 'message-processing';

// Exporta a instância da fila
export const messageProcessingQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection, // <<< Usa a conexão importada corretamente
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 1000,
    }
});

console.log(`🚀 Fila BullMQ "${QUEUE_NAME}" inicializada.`);

messageProcessingQueue.on('error', (error) => {
     console.error(`❌ Erro na fila BullMQ "${QUEUE_NAME}":`, error);
});