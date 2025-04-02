// lib/ai/chatService.ts
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { generateText, CoreMessage } from 'ai';

// Tipagem para as mensagens, similar ao que você já usa
interface ChatRequestPayload {
  messages: CoreMessage[];
  systemPrompt?: string;
}


export async function generateChatCompletion({ messages, systemPrompt }: ChatRequestPayload) {
  try {
    console.log('Gerando texto com IA. Mensagens:', messages.length);
    const systemMessage = systemPrompt || 'You are a helpful assistant.'; // Padrão genérico

    const { text } = await generateText({ // generateText retorna um objeto com a propriedade 'text'
      // model: openai('gpt-3.5-turbo'),
      model: openai('gpt-4o'),
      // model: google('gemini-2.5-pro-exp-03-25'),
      maxTokens: 1500,
      system: systemMessage,
      messages,
    });

    console.log("Texto gerado pela IA:", text);
    return text; // Retorna diretamente a string gerada

  } catch (error) {
    console.error('Erro no serviço de geração de chat:', error);
    throw error; // Propaga o erro para quem chamou
  }
}


export async function generateChatCompletionGoogle({ messages, systemPrompt }: ChatRequestPayload) {
  try {
    console.log('Gerando texto com IA. Mensagens:', messages.length);
    const systemMessage = systemPrompt || 'You are a helpful assistant.'; // Padrão genérico

    const { text } = await generateText({ // generateText retorna um objeto com a propriedade 'text'
      // model: openai('gpt-3.5-turbo'),
      // model: openai('gpt-4o'),
      model: google('gemini-2.5-pro-exp-03-25'),
      maxTokens: 1500,
      system: systemMessage,
      messages,
    });

    console.log("Texto gerado pela IA:", text);
    return text; // Retorna diretamente a string gerada

  } catch (error) {
    console.error('Erro no serviço de geração de chat:', error);
    throw error; // Propaga o erro para quem chamou
  }
}