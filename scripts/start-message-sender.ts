// scripts/start-message-sender.ts
import { messageSenderWorker } from '../lib/workers/messageSender';

console.log('[WorkerRunner] Iniciando Message Sender Worker...');

function keepAlive() {
  setTimeout(keepAlive, 1000 * 60 * 60);
}
keepAlive();

async function shutdown() {
  console.log('[WorkerRunner:MessageSender] Recebido sinal de shutdown. Fechando worker...');
  try {
    await messageSenderWorker.close();
    console.log('[WorkerRunner:MessageSender] Worker fechado.');
    process.exit(0);
  } catch (error) {
    console.error('[WorkerRunner:MessageSender] Erro ao fechar worker:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown); 