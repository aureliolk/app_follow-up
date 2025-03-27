// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createChat, loadChat } from './tools/chat-store';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt } = await req.json();
    console.log('Processing chat request with messages:', 
      messages.length > 0 ? `${messages.length} messages` : 'No messages');
    
    // Usar o prompt do sistema fornecido ou o padrão
    const systemMessage = systemPrompt || 'You are a helpful assistant for a follow-up system.';
    
    const result = await generateText({
      model: openai('gpt-3.5-turbo'),
      maxTokens: 1500,
      system: systemMessage,
      messages
    });

    // Simular o formato de resposta esperado pela função de IA
    // que espera um formato similar ao da API do OpenAI
    return NextResponse.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          message: {
            role: 'assistant',
            content: result
          },
          index: 0,
          finish_reason: 'stop'
        }
      ]
    });
  } catch (error) {
    console.error('Erro ao processar solicitação de chat:', error);
    return NextResponse.json(
      { error: 'Erro ao processar solicitação de chat' },
      { status: 500 }
    );
  }
}

