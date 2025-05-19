import pusher from '@/lib/pusher';

/**
 * Publica atualização de nova mensagem no canal da conversa.
 */
export async function publishConversationUpdate(
  channel: string,
  payload: any
): Promise<void> {
  await pusher.trigger(channel, payload.type, JSON.stringify(payload));
}

/**
 * Publica atualização no canal de workspace para mudanças globais.
 */
export async function publishWorkspaceUpdate(
  channel: string,
  payload: any
): Promise<void> {
  await pusher.trigger(channel, payload.type, JSON.stringify(payload));
}