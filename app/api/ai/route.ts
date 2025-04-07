import { NextRequest, NextResponse } from 'next/server';
// Ajuste o caminho relativo se sua estrutura for diferente
// Importar também o tipo ChatRequestPayload
import { generateChatCompletion, ChatRequestPayload } from '../../../lib/ai/chatService';

export async function POST(req: NextRequest) {
  try {
    let userMessageContent = "Me diga uma curiosidade sobre o Brasil."; // Mensagem padrão
    try {
      // Tenta ler o corpo da requisição como JSON
      const body = await req.json();
      // Se houver um corpo e uma propriedade 'message' string, usa ela
      if (body && typeof body.message === 'string') {
        userMessageContent = body.message;
      }
    } catch (error) {
       // Ignora o erro se não houver corpo ou não for JSON, usa a mensagem padrão
       console.log("Nenhuma mensagem válida encontrada no corpo da requisição, usando padrão.");
    }

    // Monta o payload esperado pela função generateChatCompletion
    // Adiciona a tipagem explícita ChatRequestPayload
    const payload: ChatRequestPayload = {
        messages: [{ role: 'user', content: userMessageContent }],
        modelId: 'gpt-4o' // Adicionar modelId (temporariamente hardcoded)
        // Você pode adicionar um systemPrompt aqui se desejar testá-lo
        // systemPrompt: "Seja conciso."
    };

    // Chama a função do serviço de chat
    const aiResponse = await generateChatCompletion(payload);

    // Retorna a resposta da IA
    return NextResponse.json({ response: aiResponse });

  } catch (error) {
    console.error('Erro na rota /api/ai:', error);
    // Extrai a mensagem de erro de forma segura
    const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido';
    // Retorna uma resposta de erro padronizada
    return NextResponse.json({ error: 'Falha ao gerar a conclusão do chat', details: errorMessage }, { status: 500 });
  }
} 