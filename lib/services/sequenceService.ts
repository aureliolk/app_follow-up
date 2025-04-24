import type { SequenceJobData } from './schedulerService';

/**
 * Processa job de carrinho abandonado, delegando a serviços especializados.
 */
import { loadAbandonedCartContext, loadFollowUpContext } from './conversationService';
import { generateCartMessage, generateFollowUpMessage } from './aiService';
import { sendWhatsAppMessage } from './channelService';
import { saveMessageRecord } from './persistenceService';
import { publishConversationUpdate, publishWorkspaceUpdate } from './notifierService';
import { scheduleSequenceJob } from './schedulerService';

/**
 * Processa job de carrinho abandonado, delegando a serviços especializados.
 */
export async function processAbandonedCart(
  jobData: SequenceJobData
): Promise<void> {
  const { conversationId, abandonedCartRuleId: ruleId, workspaceId } = jobData;
  // Carrega contexto
  const context = await loadAbandonedCartContext(conversationId, workspaceId);
  // Gera mensagem com IA
  const text = await generateCartMessage(context, ruleId);
  // Envia via WhatsApp
  const result = await sendWhatsAppMessage(
    context.workspace.whatsappPhoneNumberId,
    context.client.phone_number,
    context.workspace.whatsappAccessToken,
    text,
    context.workspace.ai_name
  );
  if (!result.success) {
    throw new Error(`Erro no envio WhatsApp (Carrinho): ${result.error}`);
  }
  // Persiste mensagem
  const saved = await saveMessageRecord({
    conversation_id: conversationId,
    sender_type: 'AI',
    content: text,
    timestamp: new Date(),
    metadata: { ruleId },
    channel_message_id: result.wamid
  });
  // Notifica UI
  await publishConversationUpdate(
    `chat-updates:${conversationId}`,
    { type: 'new_message', payload: saved }
  );
  await publishWorkspaceUpdate(
    `workspace-updates:${workspaceId}`,
    { type: 'new_message', conversationId, lastMessageTimestamp: saved.timestamp.toISOString() }
  );
  // Agenda próximo passo se houver
  const rules = context.workspace.abandonedCartRules;
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx >= 0 && idx + 1 < rules.length) {
    const next = rules[idx + 1];
    const delay = Number(next.delay_milliseconds);
    await scheduleSequenceJob(
      { conversationId, abandonedCartRuleId: next.id, workspaceId, jobType: 'abandonedCart' },
      delay,
      `acart_${conversationId}_${next.id}`
    );
  }
}

/**
 * Processa job de follow-up por inatividade, delegando a serviços especializados.
 */

/**
 * Processa job de follow-up por inatividade, delegando a serviços especializados.
 */
export async function processFollowUp(
  jobData: SequenceJobData
): Promise<void> {
  const { followUpId, stepRuleId: ruleId, workspaceId } = jobData;
  // Carrega contexto
  const context = await loadFollowUpContext(followUpId, workspaceId);
  // Gera mensagem com IA
  const text = await generateFollowUpMessage(context, ruleId);
  // Envia via WhatsApp
  const result = await sendWhatsAppMessage(
    context.workspace.whatsappPhoneNumberId,
    context.client.phone_number,
    context.workspace.whatsappAccessToken,
    text,
    context.workspace.ai_name
  );
  if (!result.success) {
    throw new Error(`Erro no envio WhatsApp (FollowUp): ${result.error}`);
  }
  // Persiste mensagem
  const conversationId = context.conversation.id;
  const saved = await saveMessageRecord({
    conversation_id: conversationId,
    sender_type: 'AI',
    content: text,
    timestamp: new Date(),
    metadata: { ruleId, followUpId },
    channel_message_id: result.wamid
  });
  // Notifica UI
  await publishConversationUpdate(
    `chat-updates:${conversationId}`,
    { type: 'new_message', payload: saved }
  );
  await publishWorkspaceUpdate(
    `workspace-updates:${workspaceId}`,
    { type: 'new_message', conversationId, lastMessageTimestamp: saved.timestamp.toISOString() }
  );
  // Agenda próximo passo se houver
  const rules = context.workspace.ai_follow_up_rules;
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx >= 0 && idx + 1 < rules.length) {
    const next = rules[idx + 1];
    const delay = Number(next.delay_milliseconds);
    await scheduleSequenceJob(
      { followUpId, stepRuleId: next.id, workspaceId, jobType: 'inactivity' },
      delay,
      `fup_${followUpId}_${next.id}`
    );
  }
}