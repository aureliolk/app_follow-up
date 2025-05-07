// lib/ai/chatService.ts
import { generateText, CoreMessage, tool, LanguageModel, Tool } from 'ai';
import { z } from 'zod';
import { getModelInstance } from './modelSelector';

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

    // 2. Preparar o System Prompt
    //    A lógica de instruções específicas (como calendário) deve vir das descrições das ferramentas
    //    ou ser injetada no systemPrompt ANTES de chamar esta função.
    //    Mantendo as instruções básicas por enquanto.
    const baseInstructions = `
    Nome do cliente: ${clientName}
    Id da conversa: ${conversationId}
    Voce e capaz de Escutar audio e ver imagens. se o cliente pergunta se vc pode ver uma imagem, vc deve responder que sim. se o cliente pergunta se vc pode ouvir um audio, vc deve responder que sim.
    Ferramentas disponíveis: ${Object.keys(tools).join(', ')}. Use as descrições das ferramentas para saber como e quando usá-las.
    `;
    console.log(`[chatService] Ferramentas recebidas:`, Object.keys(tools));
    
    const systemMessage = `${systemPrompt || 'Você é um assistente prestativo.'} ${baseInstructions}`;

    console.log(`[chatService] Gerando texto com IA. Modelo: ${modelId}, Mensagens: ${messages.length}, Workspace: ${workspaceId}`);
    
    // 3. Chamar generateText com o modelo e ferramentas recebidos
    const { text, toolCalls, toolResults, finishReason, usage } = await generateText({
      model: modelInstance,
      maxTokens: 1500, // Pode ser configurável
      system: systemMessage,
      messages,
      tools: tools, // Passa as ferramentas carregadas
    });

    // Log detalhado da resposta
    console.log(`[chatService] Resposta da IA para Conv ${conversationId}:`, {
        finishReason,
        usage,
        hasText: !!text,
        toolCallsCount: toolCalls?.length || 0,
        toolResultsCount: toolResults?.length || 0,
    });


    if (text) {
      console.log(`[chatService] Texto gerado pela IA para Conv ${conversationId}:`, text);
      return {
        type: 'text',
        content: text
      };
    }

    if (toolCalls && toolCalls.length > 0) {
        console.log(`[chatService] IA solicitou chamadas de ferramenta para Conv ${conversationId}:`, toolCalls);
        // Retorna as chamadas de ferramenta para serem processadas pelo chamador
        return {
            type: 'tool_calls',
            calls: toolCalls
        };
    }
    
    // Caso inesperado (sem texto e sem tool calls)
    console.warn(`[chatService] IA não retornou texto nem chamadas de ferramenta para Conv ${conversationId}. FinishReason: ${finishReason}`);
    return {
        type: 'empty',
        content: null
    };

  } catch (error) {
    console.error(`[chatService] Erro no serviço de geração de chat com modelo ${modelId} para Conv ${conversationId}:`, error);
    // Re-lançar o erro para que o chamador possa tratá-lo
    throw error; // Ou retornar um objeto de erro padronizado
    // return { type: 'error', error: (error instanceof Error ? error.message : String(error)) };
  }
}