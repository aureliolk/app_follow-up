// scripts/start-campaign-processor.ts
import { campaignProcessorWorker } from '../lib/workers/campaignProcessor';

console.log('[WorkerRunner] Iniciando Campaign Processor Worker...');

function keepAlive() {
  setTimeout(keepAlive, 1000 * 60 * 60);
}
keepAlive();

async function shutdown() {
  console.log('[WorkerRunner:CampaignProcessor] Recebido sinal de shutdown. Fechando worker...');
  try {
    await campaignProcessorWorker.close();
    console.log('[WorkerRunner:CampaignProcessor] Worker fechado.');
    process.exit(0);
  } catch (error) {
    console.error('[WorkerRunner:CampaignProcessor] Erro ao fechar worker:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown); 