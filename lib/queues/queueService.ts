import { Queue, JobsOptions } from 'bullmq';
import { redisConnection } from '@/lib/redis';
// import { messageProcessingQueue } from './messageProcessingQueue'; // Comentar
// import { sequenceStepQueue } from './sequenceStepQueue'; // Comentar

// Nomes das filas (manter consistentes com os workers)
const SEQUENCE_STEP_QUEUE_NAME = 'sequence-steps';
const MESSAGE_PROCESSING_QUEUE_NAME = 'message-processing';

// --- Instâncias das Filas ---
// Usamos a conexão Redis importada
const sequenceStepQueue = new Queue(SEQUENCE_STEP_QUEUE_NAME, {
  connection: redisConnection,
});

const messageProcessingQueue = new Queue(MESSAGE_PROCESSING_QUEUE_NAME, {
  connection: redisConnection,
});

// --- Funções para Adicionar Jobs ---

// Tipos para os dados dos jobs (importar de um local centralizado se já definidos, ou definir aqui)
interface SequenceStepJobData {
  followUpId: string;
  stepRuleId: string;
  workspaceId: string;
}

interface MessageProcessingJobData {
  conversationId: string;
  clientId: string;
  newMessageId: string;
  workspaceId: string;
  receivedTimestamp: number;
}

/**
 * Adiciona um job à fila de processamento de passos da sequência.
 * @param data Dados do job.
 * @param options Opções do job (ex: delay, jobId).
 */
export async function addSequenceStepJob(
  data: SequenceStepJobData,
  options?: JobsOptions
): Promise<void> {
  try {
    await sequenceStepQueue.add('processSequenceStep', data, options);
    console.log(`[QueueService] Job adicionado à fila ${SEQUENCE_STEP_QUEUE_NAME}:`, data);
  } catch (error) {
    console.error(`[QueueService] Erro ao adicionar job à fila ${SEQUENCE_STEP_QUEUE_NAME}:`, error);
    throw error; // Propaga o erro para quem chamou
  }
}

/**
 * Adiciona um job à fila de processamento de mensagens recebidas.
 * @param data Dados do job.
 * @param options Opções do job.
 */
export async function addMessageProcessingJob(
  data: MessageProcessingJobData,
  options?: JobsOptions
): Promise<void> {
  try {
    await messageProcessingQueue.add('processIncomingMessage', data, options);
    console.log(`[QueueService] Job adicionado à fila ${MESSAGE_PROCESSING_QUEUE_NAME}:`, data);
  } catch (error) {
    console.error(`[QueueService] Erro ao adicionar job à fila ${MESSAGE_PROCESSING_QUEUE_NAME}:`, error);
    throw error;
  }
}

// Opcional: Exportar as próprias filas se precisar de mais controle (ex: pausar, limpar) de fora
// export { sequenceStepQueue, messageProcessingQueue }; 