import { processAIChat } from '@/lib/ai/chatService';
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
  const cartResult = await processAIChat(
    messages,
    systemPrompt,
    modelId,
    false,
  );

  // Extrair texto, se retornado
  if (cartResult && typeof cartResult === 'object' && (cartResult as any).type === 'text') {
    return (cartResult as any).content as string;
  }

  throw new Error('IA não retornou texto válido para mensagem de carrinho abandonado.');
}

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

  // Parâmetros para IA
  const modelId = workspace.ai_model_preference || 'gpt-4o';
  // Incluir a regra como mensagem inicial para evitar prompt vazio
  const messages: CoreMessage[] = [{ role: 'user', content: rule.message_content }];

  // Chamada ao serviço de IA
  const followResult = await processAIChat(
    messages,
    // Passar systemPrompt, workspaceId e conversationId são necessários para processAIChat
    // Pelo código de processAIChat, ele precisa do workspaceId e conversationId para carregar ferramentas/estágios e contexto
    // Vamos precisar obter o conversationId do contexto aqui. Assumindo que está disponível em context.conversation.id
    workspace.id, // workspaceId: string
    context.conversation.id, // conversationId: string
    false, // streamMode: boolean
    modelId, // modelPreference?: string
    systemPrompt // additionalContext?: string - Passando o systemPrompt aqui
  );

  // Verificar o resultado retornado por processAIChat no modo não-streaming
  if (followResult && typeof followResult === 'object') {
    // Verificar se há texto no resultado
    if ('text' in followResult && typeof followResult.text === 'string' && followResult.text.length > 0) {
      return followResult.text; // Retorna o texto se ele existir
    }
    // Se não há texto, verificar se a IA retornou toolCalls
    if ('toolCalls' in followResult && Array.isArray(followResult.toolCalls) && followResult.toolCalls.length > 0) {
        // Lançar um erro específico se a IA tentou usar ferramentas em vez de gerar texto
        // Podemos incluir os nomes das ferramentas para ajudar no diagnóstico
        const toolNames = followResult.toolCalls.map(tc => tc.toolName).join(', ');
        throw new Error(`IA tentou usar ferramenta(s) (${toolNames}) em vez de gerar texto para follow-up.`);
    }
  }

  // Se não retornou texto nem toolCalls (ou o resultado não é o esperado), lançar erro genérico
  throw new Error('IA não retornou um resultado válido (texto ou toolCalls) para mensagem de follow-up.');
}