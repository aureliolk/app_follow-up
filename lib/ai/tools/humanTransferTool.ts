// lib/ai/tools/humanTransferTool.ts
import { tool } from 'ai';
import { z } from 'zod';
import { deactivateConversationAI } from '@/lib/actions/conversationActions';

export const humanTransferTool = tool({
  description: 'Transfere a conversa para um atendente humano quando explicitamente solicitado pelo cliente ou quando a IA não consegue mais ajudar.',
  parameters: z.object({
    conversationId: z.string().describe('ID da conversa atual'),
  }),
  execute: async ({ conversationId }) => {
    try {
      // A Server Action já deve lidar com a lógica e o feedback para o usuário (via SSE, etc.)
      await deactivateConversationAI(conversationId);
      console.log(`[Tool:humanTransfer] Transferência para humano iniciada para conversa: ${conversationId}`);
      // A resposta para o usuário deve vir da desativação da IA ou do primeiro humano a responder.
      // Retornar uma mensagem aqui pode causar duplicação ou confusão.
      return { 
        success: true, 
        message: "Transferência solicitada.", // Mensagem interna para o log da ferramenta
        status: 'pending' // Indica que a ação foi iniciada, mas a conversa continua
      };
    } catch (error) {
        console.error(`[Tool:humanTransfer] Erro ao tentar transferir conversa ${conversationId}:`, error);
        return { 
          success: false, 
          message: "Ocorreu um erro ao tentar transferir para um humano.",
          status: 'error'
        };
    }
  },
}); 