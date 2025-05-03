import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { generateText, CoreMessage, tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { setConversationAIStatus } from '@/lib/actions/conversationActions';
import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const humanTransferTool = tool({
  description: 'Transfere a conversa para um atendente humano',
  parameters: z.object({
    reason: z.string().describe('Motivo da transferência'),
    conversationId: z.string().describe('ID da conversa'),
  }),
  execute: async ({ reason, conversationId }) => {
    setConversationAIStatus(conversationId, false);
    console.log(`[Tool] Transfere a conversa para um atendente humano: ${reason}`);
    return { success: true };
  },
});


export async function POST(req: NextRequest) {
  try {
    let userMessageContent = "Me diga uma curiosidade sobre o Brasil."; // Mensagem padrão

    try {
      const body = await req.json();
      if (body && typeof body.message === 'string') {
        userMessageContent = body.message;
      }
    } catch (error) {
      // Se não houver corpo ou não for JSON, usa a mensagem padrão
      console.log("Nenhuma mensagem válida encontrada no corpo da requisição, usando padrão.");
    }

    // Monta as mensagens no formato esperado
    const messages: CoreMessage[] = [{ role: 'user', content: userMessageContent }];

    console.log("[API] Mensagem do usuário: ", userMessageContent);
    
    // Chama o modelo diretamente
    const result = await generateText({
      model: openai('gpt-4o'),
      system: `
      Id da conversa: 31fa7093-6590-4d02-8137-7d22a8c1dbbc
      Você é um assistente de atendimento da empresa Lumibot
      Você deve responder as mensagens do usuário de forma amigável e profissional.
      Se o usuário perguntar sobre a empresa, responda que você é um assistente virtual da empresa Lumibot.
      `,
      messages,
      tools: {
        humanTransfer: humanTransferTool,
      },
      maxSteps: 3,
    });

    // Retorna a resposta da IA
    return NextResponse.json({ response: result.text });

  } catch (error) {
    console.error('Erro na rota /api/ai:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido';
    return NextResponse.json(
      { error: 'Falha ao gerar a conclusão do chat', details: errorMessage },
      { status: 500 }
    );
  }
}


// curl -X POST http://localhost:3000/api/ai -H "Content-Type: application/json" -d '{"message": "Me diga uma curiosidade sobre o Brasil."}'
// curl -X POST http://localhost:3000/api/ai -H "Content-Type: application/json" -d '{"message": "Quero falar com um atendente humano. estou com problema no sistema."}'