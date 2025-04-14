// lib/ai/chatService.ts
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { generateText, CoreMessage, tool, LanguageModel } from 'ai';
import { z } from 'zod';
import { deactivateConversationAI } from '@/lib/actions/conversationActions';
import { 
  checkCalendarAvailabilityTool, 
  scheduleCalendarEventTool,
  setCurrentWorkspaceId 
} from '@/lib/ai/tools/googleCalendarTools';
import { prisma } from '@/lib/db';


// Tipagem para as mensagens, adicionando modelId
export interface ChatRequestPayload {
  messages: CoreMessage[];
  systemPrompt?: string;
  modelId: string;
  nameIa?: string;
  conversationId: string;
  workspaceId: string; // Adicionando workspaceId aqui
}

const humanTransferTool = tool({
  description: 'Transfere a conversa para um atendente humano',
  parameters: z.object({
    conversationId: z.string().describe('ID da conversa'),
  }),
  execute: async ({ conversationId }) => {
    deactivateConversationAI(conversationId);
    console.log(`[Tool] Transfere a conversa para um atendente humano: ${conversationId}`);
    return { success: true };
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
  workspaceId 
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
      calendarInstructions = 'Você pode verificar a agenda do Google Calendar e agendar eventos quando o cliente solicitar.';
    } else {
      calendarInstructions = 'Se o cliente perguntar sobre agendamento ou verificação de calendário, informe que ele precisa conectar sua conta do Google no menu de integrações primeiro.';
    }
    
    const extraInstructions = `
    Id da conversa: ${conversationId}
    Voce e capaz de Escutar audio e ver imagens. se o cliente pergunta se vc pode ver uma imagem, vc deve responder que sim. se o cliente pergunta se vc pode ouvir um audio, vc deve responder que sim.
    ${calendarInstructions}
    `;
    console.log(`Gerando texto com IA. Modelo: ${modelId}, Mensagens: ${messages.length}, Google Conectado: ${hasGoogleCalendar}`);
    
    const systemMessage = `${systemPrompt} ${extraInstructions}` || 'You are a helpful assistant.'; // Padrão genérico

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

    // Preparar as ferramentas disponíveis
    const tools: Record<string, any> = {
      humanTransfer: humanTransferTool,
    };
    
    // Adicionar ferramentas de calendário apenas se o Google estiver conectado
    if (hasGoogleCalendar) {
      tools.checkCalendarAvailability = checkCalendarAvailabilityTool;
      tools.scheduleCalendarEvent = scheduleCalendarEventTool;
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