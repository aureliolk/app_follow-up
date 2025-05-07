import { type NextRequest, NextResponse } from 'next/server';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue'; // Importar a fila
import { z } from 'zod';
import { generateChatCompletion } from '@/lib/ai/chatService';
import { CoreMessage } from 'ai';


// Você pode adicionar um handler GET para simplesmente verificar se a rota está funcionando
export async function GET() {
    console.log('[API TEST] Recebida requisição GET para /api/test');
    return NextResponse.json({ success: true, message: "test pronto" });
}

export async function POST(req: NextRequest) {
    try {
      let userMessageContent = "Me diga uma curiosidade sobre o Brasil."; // Mensagem padrão
      const body = await req.json();
      const systemPrompt = body.system;

  
      // Monta as mensagens no formato esperado
      const messages: CoreMessage[] = [{ role: 'user', content: "" }];
      
      // Chama o modelo diretamente
      const aiResponseText = await generateChatCompletion({
        messages: messages,
        systemPrompt: systemPrompt,
        modelId: "gpt-4o-mini",
        nameIa: "gpt-4o-mini",
        conversationId: "",
        workspaceId: "",
        clientName: "",
        tools: {
          "get_current_weather": {
            description: "Get the current weather in a given location",
            parameters: z.object({
              location: z.string(),
            }),
          },
        },
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
