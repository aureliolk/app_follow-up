// lib/ai/modelSelector.ts
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { LanguageModel } from 'ai';

export function getModelInstance(modelId: string): LanguageModel {
  console.log(`[modelSelector] Selecting model instance for ID: ${modelId}`);

  // Lógica para selecionar o modelo dinamicamente
  if (modelId.startsWith('gpt-')) {
    return openai(modelId as any); // OpenAI padrão
  } else if (modelId.startsWith('gemini-')) {
    return google(modelId as any); // Google padrão
  } else if (modelId.startsWith('openrouter/')) {
    // Usar OpenRouter
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      throw new Error('A chave de API do OpenRouter (OPENROUTER_API_KEY) não está configurada no ambiente.');
    }
    console.log('[modelSelector] OpenRouter API Key is present.');
    const openrouter = createOpenRouter({
      apiKey: openRouterApiKey,
      // Opcional: Adicionar cabeçalhos personalizados se necessário
      // headers: {
      //   'HTTP-Referer': 'YOUR_SITE_URL',
      //   'X-Title': 'YOUR_APP_NAME',
      // },
    });
    const modelName = modelId.split('openrouter/')[1];
    console.log(`[modelSelector] Using OpenRouter model: ${modelName}`);
    return openrouter(modelName);
  } else {
    // Tratar caso de modelId desconhecido ou inválido
    console.error(`[modelSelector] Modelo de IA desconhecido ou não suportado: ${modelId}`);
    // Usando GPT-4o como fallback por enquanto
    console.warn(`[modelSelector] Usando modelo fallback: gpt-4o`);
    return openai('gpt-4o');
  }
} 