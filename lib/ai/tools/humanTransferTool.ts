// lib/ai/tools/humanTransferTool.ts
import { tool } from 'ai';
import { z } from 'zod';
import { setConversationAIStatus } from '@/lib/actions/conversationActions';

export const humanTransferTool = tool({
  description: 'Transfere a conversa para um atendente humano quando explicitamente solicitado pelo cliente ou quando a IA não consegue mais ajudar.',
  parameters: z.object({
    reason: z.string().describe('Motivo da transferência'),
    conversationId: z.string().describe('O ID da conversa atual que precisa ser transferida.'),
    workspaceId: z.string().describe('O ID do workspace atual que precisa ser transferido.'),
  }),
  execute: async ({ reason, conversationId, workspaceId }) => {
    try {
      console.log(`[Tool|HumanTransfer] Iniciando transferência para conv ${conversationId}. Motivo: ${reason}`);
      // Chama a action para desativar a IA (status = false)
      // const success = await setConversationAIStatus(conversationId, false);
      // if (success) {
      //   console.log(`[Tool|HumanTransfer] IA desativada com sucesso para conv ${conversationId}.`);
      //   // TODO: Adicionar lógica adicional aqui se necessário (ex: notificar supervisores)
      //   return { success: true, message: "Transferência iniciada." };
      // } else {
      //   console.error(`[Tool|HumanTransfer] Falha ao desativar IA (setConversationAIStatus retornou false) para conv ${conversationId}.`);
      //   return { success: false, message: "Falha ao iniciar transferência (erro interno ao definir status da IA)." };
      // }
      // Simulando a chamada à action (comentada no momento)
      const success = await setConversationAIStatus(conversationId, false, workspaceId);
      if (success) {
        console.log(`[Tool|HumanTransfer] IA desativada (simulado) com sucesso para conv ${conversationId}.`);
        // TODO: Adicionar lógica adicional aqui se necessário (ex: notificar supervisores)
        return { success: true, message: "Transferência simulada iniciada." }; // Retorno explícito
      } else {
        console.error(`[Tool|HumanTransfer] Falha simulada ao desativar IA (setConversationAIStatus retornou false) para conv ${conversationId}.`);
        return { success: false, message: "Falha simulada ao iniciar transferência (erro interno ao definir status da IA)." }; // Retorno explícito
      }
    } catch (error: any) {
      console.error(`[Tool|HumanTransfer] Erro ao executar transferência para conv ${conversationId}:`, error);
       return { success: false, message: `Erro ao iniciar transferência: ${error.message || 'Erro desconhecido'}` };
    }
  },
}); 