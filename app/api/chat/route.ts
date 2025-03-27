// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateChatCompletion } from '@/lib/ai/chatService'; // Ajuste o caminho se necessário
import { CoreMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt } = await req.json();

    if (!messages || !Array.isArray(messages)) {
       return NextResponse.json({ error: 'Formato de mensagens inválido' }, { status: 400 });
    }

    // Chamar o serviço compartilhado
    const generatedText = await generateChatCompletion({ 
        messages: messages as CoreMessage[], // Cast para o tipo esperado
        systemPrompt 
    });

    // Manter a estrutura de resposta que seu código original espera
    return NextResponse.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          message: {
            role: 'assistant',
            content: generatedText // Usar o texto gerado
          },
          index: 0,
          finish_reason: 'stop' // Assumindo que sempre para
        }
      ]
    });
  } catch (error) {
    console.error('Erro na rota /api/chat:', error);
    // Verifica se o erro tem uma mensagem mais específica
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao processar solicitação de chat';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}