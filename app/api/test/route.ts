import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { CoreMessage, tool, generateText } from 'ai';
import { setConversationAIStatus } from "@/lib/actions/conversationActions";
import { setCurrentWorkspaceId, listCalendarEventsTool, scheduleCalendarEventTool } from '@/lib/ai/tools/googleTools';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { openai } from '@ai-sdk/openai';


// Você pode adicionar um handler GET para simplesmente verificar se a rota está funcionando
export async function GET() {
    console.log('[API TEST] Recebida requisição GET para /api/test');
    return NextResponse.json({ success: true, message: "test pronto" });
}

export async function POST(req: NextRequest) {
    try {
      const body = await req.json();
      const systemPrompt = body.system;
      const message = body.message;
      const actualWorkspaceId = body.workspaceId;
      const actualConversationId = body.conversationId; 
      setCurrentWorkspaceId(actualWorkspaceId);

  
      // Monta as mensagens no formato esperado
      const messages: CoreMessage[] = [{ role: 'user', content: message }];

      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });

      // Chama o modelo diretamente
      const aiResponseText = await generateText({
        messages: messages,
        model: openrouter("openai/gpt-4o-mini"),
        system: `Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ${systemPrompt}`,
        tools: {
          humanTransferTool: tool({
            description: 'Transferir a conversa para um humano. Após a transferência ser confirmada internamente, informe ao usuário de forma concisa que a conversa foi transferida.',
            parameters: z.object({}),
            execute: async () => {
              // Chamar a Server Action para desativar a IA
              try {
                const aiStatusUpdated = await setConversationAIStatus(actualConversationId, false, actualWorkspaceId);
                if (aiStatusUpdated) {
                  console.log(`IA desativada para a conversa ${actualConversationId} no workspace ${actualWorkspaceId}`);
                } else {
                  console.warn(`Não foi possível desativar a IA para a conversa ${actualConversationId} no workspace ${actualWorkspaceId} através da action.`);
                }
              } catch (error) {
                console.error(`Erro ao tentar desativar a IA para a conversa ${actualConversationId}:`, error);
                return "Erro ao processar a transferência.";
              }

              return "A transferência para um humano foi processada com sucesso.";
            },
          }),
          listCalendarEventsTool,
          scheduleCalendarEventTool,
        },
        
        });

      // if( aiResponseText.toolResults.length > 0){
      //   return NextResponse.json({ response: aiResponseText.toolResults[0].result }, { status: 200 });
      // }

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
