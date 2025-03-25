/**
 * Serviço para acionar webhooks com base em eventos do sistema
 */

/**
 * Função para acionar um evento de webhook
 * @param event - Nome do evento (ex: "follow-up.created", "message.sent")
 * @param workspaceId - ID do workspace
 * @param data - Dados do evento a serem enviados
 */
export async function triggerWebhookEvent(
  event: string,
  workspaceId: string,
  data: any
): Promise<boolean> {
  try {
    // Chama a API interna de webhooks para processar o evento
    const response = await fetch('/api/webhook-trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': process.env.INTERNAL_API_KEY || 'internal-key'
      },
      body: JSON.stringify({
        event,
        workspaceId,
        data
      })
    });

    if (!response.ok) {
      console.error('Erro ao acionar webhook:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro ao acionar webhook:', error);
    return false;
  }
}

/**
 * Função para acionar eventos quando um novo follow-up é criado
 */
export async function triggerFollowUpCreated(
  workspaceId: string,
  followUpId: string,
  campaignId: string,
  clientId: string
) {
  return triggerWebhookEvent('follow-up.created', workspaceId, {
    follow_up_id: followUpId,
    campaign_id: campaignId,
    client_id: clientId
  });
}

/**
 * Função para acionar eventos quando um follow-up é concluído
 */
export async function triggerFollowUpCompleted(
  workspaceId: string,
  followUpId: string,
  campaignId: string,
  clientId: string
) {
  return triggerWebhookEvent('follow-up.completed', workspaceId, {
    follow_up_id: followUpId,
    campaign_id: campaignId,
    client_id: clientId
  });
}

/**
 * Função para acionar eventos quando um follow-up é cancelado
 */
export async function triggerFollowUpCancelled(
  workspaceId: string,
  followUpId: string,
  reason?: string
) {
  return triggerWebhookEvent('follow-up.cancelled', workspaceId, {
    follow_up_id: followUpId,
    reason
  });
}

/**
 * Função para acionar eventos quando uma mensagem é enviada
 */
export async function triggerMessageSent(
  workspaceId: string,
  followUpId: string,
  messageId: string,
  content: string
) {
  return triggerWebhookEvent('message.sent', workspaceId, {
    follow_up_id: followUpId,
    message_id: messageId,
    content
  });
}

/**
 * Função para acionar eventos quando uma resposta do cliente é recebida
 */
export async function triggerMessageReceived(
  workspaceId: string,
  followUpId: string,
  messageId: string,
  content: string
) {
  return triggerWebhookEvent('message.received', workspaceId, {
    follow_up_id: followUpId,
    message_id: messageId,
    content
  });
}