"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateChatCompletion = generateChatCompletion;
exports.generateChatCompletionGoogle = generateChatCompletionGoogle;
// lib/ai/chatService.ts
const openai_1 = require("@ai-sdk/openai");
const google_1 = require("@ai-sdk/google");
const ai_1 = require("ai");
async function generateChatCompletion({ messages, systemPrompt }) {
    try {
        console.log('Gerando texto com IA. Mensagens:', messages.length);
        const systemMessage = systemPrompt || 'You are a helpful assistant.'; // Padrão genérico
        const { text } = await (0, ai_1.generateText)({
            // model: openai('gpt-3.5-turbo'),
            model: (0, openai_1.openai)('gpt-4o'),
            // model: google('gemini-2.5-pro-exp-03-25'),
            maxTokens: 1500,
            system: systemMessage,
            messages,
        });
        console.log("Texto gerado pela IA:", text);
        return text; // Retorna diretamente a string gerada
    }
    catch (error) {
        console.error('Erro no serviço de geração de chat:', error);
        throw error; // Propaga o erro para quem chamou
    }
}
async function generateChatCompletionGoogle({ messages, systemPrompt }) {
    try {
        console.log('Gerando texto com IA. Mensagens:', messages.length);
        const systemMessage = systemPrompt || 'You are a helpful assistant.'; // Padrão genérico
        const { text } = await (0, ai_1.generateText)({
            // model: openai('gpt-3.5-turbo'),
            // model: openai('gpt-4o'),
            model: (0, google_1.google)('gemini-2.5-pro-exp-03-25'),
            maxTokens: 1500,
            system: systemMessage,
            messages,
        });
        console.log("Texto gerado pela IA:", text);
        return text; // Retorna diretamente a string gerada
    }
    catch (error) {
        console.error('Erro no serviço de geração de chat:', error);
        throw error; // Propaga o erro para quem chamou
    }
}
//# sourceMappingURL=chatService.js.map