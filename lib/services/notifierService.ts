import { redisConnection } from '@/lib/redis';

/**
 * Publica atualização de nova mensagem no canal da conversa.
 */
export async function publishConversationUpdate(
  channel: string,
  payload: any
): Promise<void> {
  // Publica o payload no canal especificado
  await redisConnection.publish(channel, JSON.stringify(payload));
}

/**
 * Publica atualização no canal de workspace para mudanças globais.
 */
export async function publishWorkspaceUpdate(
  channel: string,
  payload: any
): Promise<void> {
  // Publica o payload no canal especificado
  await redisConnection.publish(channel, JSON.stringify(payload));
}