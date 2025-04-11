import { Queue } from 'bullmq';
import { redisConnection } from '@/lib/redis';

export const WHATSAPP_OUTGOING_MEDIA_QUEUE = 'whatsapp-outgoing-media';

console.log(`[Queue Setup] Creating queue: ${WHATSAPP_OUTGOING_MEDIA_QUEUE}`);

// Create the queue instance
export const whatsappOutgoingMediaQueue = new Queue(WHATSAPP_OUTGOING_MEDIA_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Número de tentativas em caso de falha
    backoff: {
      type: 'exponential', // Estratégia de backoff exponencial
      delay: 5000, // Delay inicial de 5 segundos
    },
    removeOnComplete: true, // Remove o job da fila ao completar
    removeOnFail: 1000, // Mantém os últimos 1000 jobs falhados
  },
});

console.log(`[Queue Setup] Queue ${WHATSAPP_OUTGOING_MEDIA_QUEUE} created successfully.`); 