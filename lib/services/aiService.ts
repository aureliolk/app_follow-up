import { generateChatCompletion } from '@/lib/ai/chatService';
import type { CoreMessage } from 'ai';
import { AbandonedCartContext, FollowUpContext } from './conversationService';

/**
 * Gera conteúdo de mensagem para carrinho abandonado via IA.
 * @param context Contexto carregado com conversa, client e workspace
 * @param ruleId ID da regra de carrinho a ser aplicada
 */
export async function generateCartMessage(
  context: AbandonedCartContext,
  ruleId: string
): Promise<string> {
  const { conversation, client, workspace } = context;
  const rule = workspace.abandonedCartRules.find(r => r.id === ruleId);
  if (!rule) {
    throw new Error(`Regra de carrinho ${ruleId} não encontrada no workspace ${workspace.id}`);
  }
  // Construir prompt do sistema
  const systemPrompt = `${workspace.ai_default_system_prompt} === Você é um profissional de marketing e vendas. Sua missão é abordar o cliente para recuperar seu carrinho abandonado. Utilize essa instruçåo determinada pelo usuário: ${rule.message_content}`;
  // Parâmetros para IA
  const modelId = workspace.ai_model_preference || 'gpt-4o';
  const clientName = client.name || '';
  // Incluir a regra como mensagem inicial para evitar prompt vazio
  const messages: CoreMessage[] = [{ role: 'user', content: rule.message_content }];
  // Chamada ao serviço de IA
  const text = await generateChatCompletion({
    messages,
    systemPrompt,
    modelId,
    nameIa: workspace.ai_name,
    clientName,
    conversationId: conversation.id,
    workspaceId: workspace.id
  });
  return text;
}

/**
 * Gera conteúdo de mensagem para follow-up por inatividade via IA ou lógica definida.
 */

/**
 * Gera conteúdo de mensagem para follow-up por inatividade via IA.
 * @param context Contexto com followUp, client e workspace
 * @param ruleId ID da regra de follow-up a ser aplicada
 */
export async function generateFollowUpMessage(
  context: FollowUpContext,
  ruleId: string
): Promise<string> {
  const {  client, workspace } = context;
  const rule = workspace.ai_follow_up_rules.find(r => r.id === ruleId);
  if (!rule) {
    throw new Error(`Regra de inatividade ${ruleId} não encontrada no workspace ${workspace.id}`);
  }
  // Construir prompt do sistema
  const systemPrompt = `${workspace.ai_default_system_prompt} === Evie uma mensagem de follow-up para o cliente ${client.name} com as seguinte regra: ${rule.message_content}`;

  console.log('systemPrompt', systemPrompt);
  // Parâmetros para IA
  const modelId = workspace.ai_model_preference || 'gpt-4o';
  const clientName = client.name || '';
  // Incluir a regra como mensagem inicial para evitar prompt vazio
  const messages: CoreMessage[] = [{ role: 'user', content: rule.message_content }];
  // Chamada ao serviço de IA
  const text = await generateChatCompletion({
    messages,
    systemPrompt,
    modelId,
    nameIa: workspace.ai_name,
    clientName,
    conversationId: context.conversation.id,
    workspaceId: workspace.id
  });
  return text;
}