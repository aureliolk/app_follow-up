// lib/workers/sequenceStepProcessor.ts
import { Worker } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { processAbandonedCart, processFollowUp } from '@/lib/services/sequenceService';

const QUEUE_NAME = 'sequence-steps';

/**
 * Worker que processa jobs de sequência (carrinho abandonado e inatividade).
 */
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const data = job.data as any;
    const jobType = data.jobType as string;
    if (jobType === 'abandonedCart') {
      return processAbandonedCart(data);
    } else {
      console.log(`[SEQUENCESTEPPROCESSOR] ${data}`)
      return processFollowUp(data);
    }
  },
  { connection: redisConnection }
);

worker.on('completed', (job) => {
  console.log(`[SequenceWorker] Job ${job.id} completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`[SequenceWorker] Job ${job?.id} failed:`, err);
});

export { worker };