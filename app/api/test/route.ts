import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { generateText, CoreMessage, tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { deactivateConversationAI } from '@/lib/actions/conversationActions';
import { generateChatCompletion } from '@/lib/ai/chatService';


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
    const messages: CoreMessage[] = [{ role: 'user', content: "" }];
    
    // Chama o modelo diretamente
    const aiResponseText = await generateChatCompletion({
        messages,
        systemPrompt: "Vc e uma especialista em marketing digital e precisa reengajar o cliente para que ele compre o produto, o dono do comercio pediu deixou a seguinte instruçåo ==> ${Primeiro contato do cliente depois de 30 minutos}",
        modelId: "gpt-4o",
        nameIa: "Lumibot",
        conversationId: "31fa7093-6590-4d02-8137-7d22a8c1dbbc", // Usar Non-null assertion pois verificamos activeConversation
        workspaceId: "31fa7093-6590-4d02-8137-7d22a8c1dbbc",
        clientName: "Nebs"
      });

    // Retorna a resposta da IA
    return NextResponse.json({ response: aiResponseText }, { status: 200 });

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