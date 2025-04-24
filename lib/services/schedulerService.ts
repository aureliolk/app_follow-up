import { Queue, JobsOptions } from 'bullmq';
import { redisConnection } from '@/lib/redis';

// Definição do nome da fila consistente com workers
const SEQUENCE_QUEUE_NAME = 'sequence-steps';

// Instância da fila de sequência
const sequenceQueue = new Queue(SEQUENCE_QUEUE_NAME, { connection: redisConnection });

/**
 * Dados de job para sequência de eventos (carrinho ou inatividade).
 */
export interface SequenceJobData {
  [key: string]: any;
}

/**
 * Agenda um job na fila de sequência com delay opcional.
 */
export async function scheduleSequenceJob(
  jobData: SequenceJobData,
  delay: number,
  jobId?: string
): Promise<void> {
  const options: JobsOptions = { delay, jobId, removeOnComplete: true, removeOnFail: 5000 };
  // TODO: Ajustar nome de tarefa se necessário
  await sequenceQueue.add('processSequenceStep', jobData, options);
}