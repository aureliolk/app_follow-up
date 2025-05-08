// lib/ai/chatService.ts
import { generateText, CoreMessage, tool, LanguageModel, Tool } from 'ai';
import { z } from 'zod';
import { getModelInstance } from './modelSelector';
import { setConversationAIStatus } from '../actions/conversationActions';
import { setCurrentWorkspaceId, listCalendarEventsTool, scheduleCalendarEventTool } from '@/lib/ai/tools/googleTools';


// Tipagem para as mensagens, adicionando modelId e context
export interface ChatRequestPayload {
  messages: CoreMessage[];
  systemPrompt?: string;
  modelId: string;
  nameIa?: string;
  clientName: string;
  conversationId: string;
  workspaceId: string; // Adicionando workspaceId aqui
  tools?: Record<string, Tool<any, any>>;
  context?: {
    toolResponses?: Array<{
      toolCallId: string;
      toolName: string;
      args: any;
      result: any;
    }>;
    [key: string]: any;
  };
}

// Função unificada para gerar chat completion
export async function generateChatCompletion({ 
  messages, 
  systemPrompt, 
  modelId, 
  conversationId,
  workspaceId,
  tools,
  context,
  clientName
}: ChatRequestPayload) {
  try {
    // 1. Obter a instância do modelo
    const modelInstance = getModelInstance(modelId);
    setCurrentWorkspaceId(workspaceId);


    const baseInstructions = `
    Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
    Timezone do cliente: America/Sao_Paulo
    Nome do cliente: ${clientName}
    Id da conversa: ${conversationId}
    Voce e capaz de Escutar audio e ver imagens. se o cliente pergunta se vc pode ver uma imagem, vc deve responder que sim. se o cliente pergunta se vc pode ouvir um audio, vc deve responder que sim.
    `;
    
    const systemMessage = `${systemPrompt} ${baseInstructions}`;


    const { text, toolResults } = await generateText({
      model: modelInstance,
      maxTokens: 4096, // Pode ser configurável
      system: systemMessage,
      messages,
      tools: {
        humanTransferTool: tool({
          description: 'Execute essa funcao quando o cliente solicitar a transferencia para um humano.',
          parameters: z.object({}),
          execute: async () => {
            // Chamar a Server Action para desativar a IA
            try {
              const aiStatusUpdated = await setConversationAIStatus(conversationId, false, workspaceId);
              if (aiStatusUpdated) {
                console.log(`IA desativada para a conversa ${conversationId} no workspace ${workspaceId}`);
              } else {
                console.warn(`Não foi possível desativar a IA para a conversa ${conversationId} no workspace ${workspaceId} através da action.`);
              }
            } catch (error) {
              console.error(`Erro ao tentar desativar a IA para a conversa ${conversationId}:`, error);
              return "Erro ao processar a transferência.";
            }

            return "A transferência para um humano foi processada com sucesso.";
          },
        }),
        scheduleCalendarEventTool,
      } // Passa as ferramentas carregadas
    });

    console.log(`[chatService] toolResults:`, toolResults);

    if(toolResults.length > 0){
      if( toolResults[0].toolName === 'scheduleCalendarEventTool'){
        const result = toolResults[0].result;
        if (typeof result === 'object' && result !== null && 'responseText' in result && typeof result.responseText === 'string') {
          return { response: result.responseText };
        }
      }
      
      return { response: toolResults[0].result };
    }

    return { response: text };

  } catch (error) {
    console.error(`[chatService] Erro no serviço de geração de chat com modelo ${modelId} para Conv ${conversationId}:`, error);
    // Re-lançar o erro para que o chamador possa tratá-lo
    throw error; // Ou retornar um objeto de erro padronizado
    // return { type: 'error', error: (error instanceof Error ? error.message : String(error)) };
  }
}