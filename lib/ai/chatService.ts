// lib/ai/chatService.ts
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { generateText, CoreMessage, tool, LanguageModel } from 'ai';
import { z } from 'zod';
import { 
  checkCalendarAvailabilityTool, 
  scheduleCalendarEventTool,
  setCurrentWorkspaceId 
} from '@/lib/ai/tools/googleCalendarTools';
import { prisma } from '@/lib/db';


// Tipagem para as mensagens, adicionando modelId e context
export interface ChatRequestPayload {
  messages: CoreMessage[];
  systemPrompt?: string;
  modelId: string;
  nameIa?: string;
  conversationId: string;
  workspaceId: string; // Adicionando workspaceId aqui
  context?: {
    toolResponses?: Array<{
      status?: string;
      data?: {
        responseText?: string;
        [key: string]: any;
      };
      [key: string]: any;
    }>;
    [key: string]: any;
  };
}

const humanTransferTool = tool({
  description: 'Transfere a conversa para um atendente humano',
  parameters: z.object({
    conversationId: z.string().describe('ID da conversa'),
  }),
  execute: async ({ conversationId }) => {
    console.log(`[Tool] Transfere a conversa para um atendente humano: ${conversationId}`);
    return { 
      success: true,
      message: 'Certo! Estou transferindo seu atendimento para um humano. Um atendente irá continuar esta conversa em breve. Obrigado pela sua paciência!',
      status: 'success',
      data: {
        responseText: 'Certo! Estou transferindo seu atendimento para um humano. Um atendente irá continuar esta conversa em breve. Obrigado pela sua paciência!'
      }
     };
  },
});


// Função para verificar se o workspace tem uma conexão Google válida
async function hasGoogleConnection(workspaceId: string): Promise<boolean> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { google_refresh_token: true }
    });
    
    return !!workspace?.google_refresh_token;
  } catch (error) {
    console.error('Erro ao verificar conexão Google:', error);
    return false;
  }
}


// Função unificada para gerar chat completion
export async function generateChatCompletion({ 
  messages, 
  systemPrompt, 
  modelId, 
  conversationId,
  workspaceId,
  context
}: ChatRequestPayload) {
  try {
    // Configurar o ID do workspace atual para as ferramentas de calendário
    if (workspaceId) {
      setCurrentWorkspaceId(workspaceId);
    }
    
    // Verificar se o workspace tem conexão com o Google
    const hasGoogleCalendar = workspaceId ? await hasGoogleConnection(workspaceId) : false;
    
    let calendarInstructions = '';
    if (hasGoogleCalendar) {
      calendarInstructions = `Você pode verificar a agenda do Google Calendar e agendar eventos quando o cliente solicitar.      
      IMPORTANTE SOBRE DATAS E CALENDÁRIO:
      1. Sempre use datas FUTURAS ao verificar disponibilidade e agendar eventos.
      2. Nunca use datas no passado.
      3. Para verificar a agenda de "hoje", use a data atual: ${new Date().toISOString().split('T')[0]}.
      4. Para verificar a agenda de "amanhã", adicione 1 dia à data atual.
      5. Ao usar checkCalendarAvailability ou scheduleCalendarEvent, use o formato ISO correto (YYYY-MM-DDTHH:MM:SS).
      6. Jamais tente verificar datas como "13/10/2023" ou outras datas no passado.`;
    } else {
      calendarInstructions = 'Se o cliente perguntar sobre agendamento ou verificação de calendário, informe que ele precisa conectar sua conta do Google no menu de integrações primeiro.';
    }
    
    const extraInstructions = `
    Id da conversa: ${conversationId}
    Voce e capaz de Escutar audio e ver imagens. se o cliente pergunta se vc pode ver uma imagem, vc deve responder que sim. se o cliente pergunta se vc pode ouvir um audio, vc deve responder que sim.
    ${calendarInstructions}
    `;
    console.log(`Gerando texto com IA. Modelo: ${modelId}, Mensagens: ${messages.length}, Google Conectado: ${hasGoogleCalendar}`);
    
    const systemMessage = `${systemPrompt} ${extraInstructions}` || 'You are a helpful assistant.';

    let modelInstance: LanguageModel;

    // Lógica para selecionar o modelo dinamicamente
    if (modelId.startsWith('gpt-')) {
      modelInstance = openai(modelId as any); // Assume que qualquer 'gpt-' é OpenAI
    } else if (modelId.startsWith('gemini-')) {
      modelInstance = google(modelId as any); // Assume que qualquer 'gemini-' é Google
    } else {
      // Tratar caso de modelId desconhecido ou inválido
      console.error(`Modelo de IA desconhecido ou não suportado: ${modelId}`);
      // Poderia usar um modelo padrão ou lançar um erro mais específico
      // Usando GPT-4o como fallback por enquanto, mas idealmente lançar erro
      console.warn(`Usando modelo fallback: gpt-4o`);
      modelInstance = openai('gpt-4o');
      // throw new Error(`Modelo de IA não suportado: ${modelId}`);
    }

    // Preparar as ferramentas disponíveis com wrappers que capturam as respostas
    const tools: Record<string, any> = {
      humanTransfer: wrapTool(humanTransferTool, context),
    };
    
    // Adicionar ferramentas de calendário apenas se o Google estiver conectado
    if (hasGoogleCalendar) {
      tools.checkCalendarAvailability = wrapTool(checkCalendarAvailabilityTool, context);
      tools.scheduleCalendarEvent = wrapTool(scheduleCalendarEventTool, context);
    }

    const { text } = await generateText({
      model: modelInstance,
      maxTokens: 1500,
      system: systemMessage,
      messages,
      tools,
    });

    console.log("Texto gerado pela IA:", text);
    return text; // Retorna diretamente a string gerada

  } catch (error) {
    console.error(`Erro no serviço de geração de chat com modelo ${modelId}:`, error);
    // Re-lançar o erro para que o chamador possa tratá-lo
    throw error;
  }
}

// Função auxiliar para envolver uma ferramenta com captura de resposta
function wrapTool(originalTool: any, context?: ChatRequestPayload['context']) {
  const wrappedTool = {
    ...originalTool,
    execute: async (...args: any[]) => {
      try {
        const result = await originalTool.execute(...args);
        console.log(`[chatService] Resposta da ferramenta ${originalTool.name || 'desconhecida'}:`, 
                    result?.status || 'sem status');
        
        // Armazenar a resposta no contexto se disponível
        if (context?.toolResponses) {
          context.toolResponses.push({
            name: originalTool.name,
            status: result?.status,
            data: result?.data || result
          });
        }
        
        return result;
      } catch (error) {
        console.error(`[chatService] Erro na execução da ferramenta:`, error);
        throw error;
      }
    }
  };
  
  return wrappedTool;
}