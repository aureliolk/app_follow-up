// lib/ai/chatService.ts
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { generateText, CoreMessage, LanguageModel } from 'ai';

// Tipagem para as mensagens, adicionando modelId
export interface ChatRequestPayload {
  messages: CoreMessage[];
  systemPrompt?: string;
  modelId: string;
  nameIa?: string;
}

// Função unificada para gerar chat completion
export async function generateChatCompletion({ messages, systemPrompt, modelId }: ChatRequestPayload) {
  try {
    console.log(`Gerando texto com IA. Modelo: ${modelId}, Mensagens: ${messages.length}`);
    const systemMessage = systemPrompt || 'You are a helpful assistant.'; // Padrão genérico

    let modelInstance: LanguageModel;

    // Lógica para selecionar o modelo dinamicamente
    if (modelId.startsWith('gpt-')) {
      modelInstance = openai(modelId as any); // Assume que qualquer 'gpt-' é OpenAI
    } else if (modelId.startsWith('gemini-')) {
      modelInstance = google(modelId as any); // Assume que qualquer 'gemini-' é Google
    } else {
      // Tratar caso de modelId desconhecido ou inválido
      console.error(`Modelo de IA desconhecido ou não suportado: ${modelId}`);
      // Poderia usar um modelo padrão ou lançar um erro mais específico
      // Usando GPT-4o como fallback por enquanto, mas idealmente lançar erro
      console.warn(`Usando modelo fallback: gpt-4o`);
      modelInstance = openai('gpt-4o');
      // throw new Error(`Modelo de IA não suportado: ${modelId}`);
    }

    const { text } = await generateText({
      model: modelInstance,
      maxTokens: 1500,
      system: systemMessage,
      messages,
    });

    console.log("Texto gerado pela IA:", text);
    return text; // Retorna diretamente a string gerada

  } catch (error) {
    console.error(`Erro no serviço de geração de chat com modelo ${modelId}:`, error);
    // Re-lançar o erro para que o chamador possa tratá-lo
    throw error;
  }
}