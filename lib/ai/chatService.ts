// lib/ai/chatService.ts
import { generateText, CoreMessage, tool, LanguageModel, Tool } from 'ai';
import { z } from 'zod';
import { getModelInstance } from './modelSelector';
import { setConversationAIStatus } from '../actions/conversationActions';
import { setCurrentWorkspaceId, scheduleCalendarEventTool } from '@/lib/ai/tools/googleTools';
import { getAIStages, getAIStageByName } from '@/lib/actions/aiStageActions';
import { AIStageActionType, AIStageAction as PrismaAIStageAction } from '@prisma/client';

// Tipagem para as mensagens, adicionando modelId e context
export interface ChatRequestPayload {
  messages: CoreMessage[];
  systemPrompt?: string;
  modelId: string;
  nameIa?: string;
  clientName: string;
  conversationId: string;
  workspaceId: string; // Adicionando workspaceId aqui
  tools?: Record<string, Tool<any, any>>;
  context?: {
    toolResponses?: Array<{
      toolCallId: string;
      toolName: string;
      args: any;
      result: any;
    }>;
    [key: string]: any;
  };
}

// Função unificada para gerar chat completion
export async function generateChatCompletion({ 
  messages, 
  systemPrompt, 
  modelId, 
  conversationId,
  workspaceId,
  tools,
  context,
  clientName
}: ChatRequestPayload) {
  try {
    // 1. Obter a instância do modelo
    const modelInstance = getModelInstance(modelId);
    setCurrentWorkspaceId(workspaceId);

    // 2. Buscar estágios de IA ativos para este workspace
    const activeStages = await getAIStages(workspaceId);

    // 3. Formatar informações dos estágios para o prompt
    const stageInfo = activeStages.map(stage => (
      `Stage Name: ${stage.name}\nCondition: ${stage.condition}`
    )).join('\n---\n');

    const baseInstructions = `
    Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
    Timezone do cliente: America/Sao_Paulo
    Nome do cliente: ${clientName}
    Id da conversa: ${conversationId}
    Voce e capaz de Escutar audio e ver imagens. se o cliente pergunta se vc pode ver uma imagem, vc deve responder que sim. se o cliente pergunta se vc pode ouvir um audio, vc deve responder que sim.
    `;
    
    // Adicionar informações dos estágios ao system prompt
    const updatedSystemMessage = `${systemPrompt || ''} ${baseInstructions}\n\nAvailable Stages:\n${stageInfo}\n\nBased on the user's message and the conversation history, identify if any of the available stages are relevant based on their conditions. If a stage is relevant, respond ONLY with the stage name that best matches, preceded by [STAGE] (e.g., [STAGE] Nome do Meu Estágio). If no stage is relevant, proceed with the normal conversation or tool use and do NOT include [STAGE].`;

    const { text, toolResults } = await generateText({
      model: modelInstance,
      maxTokens: 4096, // Pode ser configurável
      system: updatedSystemMessage,
      messages,
      tools: {
        humanTransferTool: tool({
          description: 'Execute essa funcao quando o cliente solicitar a transferencia para um humano.',
          parameters: z.object({}),
          execute: async () => {
            // Chamar a Server Action para desativar a IA
            try {
              const aiStatusUpdated = await setConversationAIStatus(conversationId, false, workspaceId);
              if (aiStatusUpdated) {
                console.log(`IA desativada para a conversa ${conversationId} no workspace ${workspaceId}`);
              } else {
                console.warn(`Não foi possível desativar a IA para a conversa ${conversationId} no workspace ${workspaceId} através da action.`);
              }
            } catch (error) {
              console.error(`Erro ao tentar desativar a IA para a conversa ${conversationId}:`, error);
              return "Erro ao processar a transferência.";
            }

            return "A transferência para um humano foi processada com sucesso.";
          },
        }),
        scheduleCalendarEventTool,
      } // Passa as ferramentas carregadas
    });

    console.log(`[chatService] toolResults:`, toolResults);
    console.log(`[chatService] Raw text response:`, text);

    // 4. Processar a resposta para identificar se um estágio foi selecionado
    const stageMatch = text?.match(/\[STAGE\]\s*(.*)/i);
    if (stageMatch && stageMatch[1]) {
      const selectedStageName = stageMatch[1].trim();
      console.log(`[chatService] Stage selected by AI: ${selectedStageName}`);
      
      // 4.1. Buscar o estágio completo pelo nome
      const selectedStage = await getAIStageByName(workspaceId, selectedStageName);

      if (selectedStage) {
        console.log(`[chatService] Executing actions for stage: ${selectedStage.name}`);
        
        // --- Início da Lógica Tool Calling para Ações do Estágio ---

        // 4.2. Gerar definições de ferramentas dinâmicas com base nas ações do estágio
        const stageTools: Tool<any, any>[] = [];

        for (const action of selectedStage.actions as PrismaAIStageAction[]) {
            if (!action.isEnabled) continue;

            switch (action.type) { // Use AIStageActionType importado do prisma
                case AIStageActionType.API_CALL: {
                    const apiConfig = action.config as ApiCallConfig; // Usar tipo importado
                    if (!apiConfig || !apiConfig.url) {
                        console.warn(`[chatService] API_CALL action ${action.id} missing configuration.`);
                        continue;
                    }

                    // Gerar uma definição de ferramenta para esta chamada API específica
                    // Usamos o apiName como nome da ferramenta (com sanitização)
                    const toolName = `call_${apiConfig.apiName?.replace(/[^a-zA-Z0-9_]/g, '_') || action.id}`;
                    const toolDescription = `Calls the "${apiConfig.apiName || 'API Call'}" endpoint. URL: ${apiConfig.url}. Method: ${apiConfig.method}. Use this tool when the user's request aligns with the purpose of this API call.`;

                    // Definir parâmetros da ferramenta baseados nos schemas configurados
                    // TODO: Parse querySchema and bodySchema into proper JSON Schema parameters
                    const parameters = {
                       type: "object",
                       properties: {},
                       additionalProperties: true,
                    };


                    stageTools.push(tool({
                         description: toolDescription,
                         parameters: parameters as any, // TODO: Type this properly
                         execute: async (args: any) => {
                             // TODO: Implement real API call execution logic here
                             // Use apiConfig and args from IA
                             console.log(`[chatService] Executing API_CALL tool "${toolName}" for URL ${apiConfig.url} with args:`, args);
                             // Exemplo de chamada a uma função de execução real (precisa ser criada)
                             // const apiResult = await executeHttpRequest(apiConfig, args);
                             // return apiResult; // Retornar o resultado real da API
                             return { status: 'success', message: `API Call simulation for ${apiConfig.apiName || apiConfig.url} executed.` }; // Simulation
                         },
                     }));
                     break;
                 }
                 case AIStageActionType.SEND_MESSAGE: { // Corrigido para usar AIStageActionType
                     const messageConfig = action.config as SendMessageConfig; // Usar tipo importado
                      if (!messageConfig || !messageConfig.message) {
                         console.warn(`[chatService] SEND_MESSAGE action ${action.id} missing configuration.`);
                         continue;
                     }
                     const toolName = `sendMessage_${action.id.substring(0, 8)}`; // Nome simples
                     const toolDescription = `Sends a pre-defined message to the user: "${messageConfig.message}". Use this tool when the context requires sending this specific message.`;

                     stageTools.push(tool({
                         description: toolDescription,
                         parameters: z.object({ // Mensagens simples podem não precisar de parâmetros dinâmicos da IA
                           // Placeholder parameter if needed, or empty object
                         }) as any, // TODO: Type this properly
                         execute: async (args: any) => {
                              // TODO: Call your existing backend function to send the message
                             console.log(`[chatService] Executing SEND_MESSAGE tool "${toolName}". Message content:`, messageConfig.message);
                              // Exemplo: Chamar sua função existente
                              // const sendResult = await yourExistingSendMessageFunction(conversationId, messageConfig.message);
                              // return sendResult; // Retornar resultado do envio
                              return { status: 'success', message: 'Message sent simulation.' }; // Simulation
                         },
                     }));
                     break;
                 }
                case AIStageActionType.TRANSFER_HUMAN: { // Adicionar Tool Definition para Transfer Human
                     // Reutiliza a ferramenta existente, mas garante que está disponível
                     const toolName = humanTransferTool.tool.name; // Nome da ferramenta já definida
                     // Não precisa definir parameters ou execute novamente, apenas incluí-la
                     // Adicionar um marcador para incluí-la na lista de tools do estágio
                     stageTools.push(humanTransferTool);
                     console.log(`[chatService] Added existing tool "${toolName}" for TRANSFER_HUMAN action.`);
                     break;
                }
                case AIStageActionType.CONNECT_CALENDAR: { // Adicionar Tool Definition para Connect Calendar
                    // Reutiliza a ferramenta existente
                    const toolName = scheduleCalendarEventTool.tool.name; // Nome da ferramenta já definida
                     // Não precisa definir parameters ou execute novamente, apenas incluí-la
                    stageTools.push(scheduleCalendarEventTool);
                    console.log(`[chatService] Added existing tool "${toolName}" for CONNECT_CALENDAR action.`);
                    break;
                }

                 default:
                     console.warn(`[chatService] Unknown or unimplemented action type for tool generation: ${action.type}`);
                     break;
             }
         }

         // --- Fim da Geração de Ferramentas Dinâmicas ---

         // 4.3. Faça uma SEGUNDA chamada à IA com as ferramentas do estágio
         // Criamos um mapa para evitar duplicatas se várias ações do estágio usarem a mesma ferramenta existente
         const allAvailableToolsMap: Record<string, Tool<any, any>> = {
             // Adiciona ferramentas dinâmicas e reutilizadas do estágio
             ...stageTools.reduce((acc, t) => ({ ...acc, [t.tool.name]: t }), {}),
             // Opcional: Adicionar ferramentas padrão aqui também, se necessário para esta fase da conversa
             // humanTransferTool: humanTransferTool,
             // scheduleCalendarEventTool: scheduleCalendarEventTool,
         };
        const allAvailableTools = Object.values(allAvailableToolsMap);


         console.log('[chatService] Making second AI call with stage tools:', Object.keys(allAvailableToolsMap));

         const secondResponse = await generateText({
             model: modelInstance,
             maxTokens: 4096,
             system: updatedSystemMessage, // Manter o system prompt original
             messages, // Manter histórico original + primeira resposta da IA
             tools: allAvailableTools // Passar as ferramentas combinadas
         });

         console.log('[chatService] Second AI response:', secondResponse);

         // 4.4. Processar a SEGUNDA resposta: Checar por tool_calls
         if (secondResponse.toolResults && secondResponse.toolResults.length > 0) {
              console.log(`[chatService] Detected ${secondResponse.toolResults.length} tool calls in second response.`);
              const toolResultsForThirdCall: CoreMessage[] = [];

              for (const toolCall of secondResponse.toolResults) {
                  console.log(`[chatService] Executing tool: ${toolCall.toolName} with args:`, toolCall.args);
                  try {
                      // Encontre a função de execução correspondente
                      // Note: Precisamos de um mapeamento das ferramentas geradas dinamicamente
                      // Para simplificar agora, vamos re-executar a lógica de tool({ execute: ... })
                      // Ou, melhor, vamos criar um mapa de ferramentas executáveis antes da segunda chamada.

                      // Encontre a ferramenta na lista original pelo nome
                      const executedTool = allAvailableTools.find(t => t.tool.name === toolCall.toolName);

                      if (executedTool && executedTool.tool.execute) {
                          const executionResult = await executedTool.tool.execute(toolCall.args);

                          // Formatar o resultado para enviar de volta para a IA
                          toolResultsForThirdCall.push({
                             role: 'tool',
                             content: JSON.stringify(executionResult),
                             tool_call_id: toolCall.toolCallId, // Associar ao tool_call original
                          });
                          console.log(`[chatService] Tool ${toolCall.toolName} executed. Result:`, executionResult);

                      } else {
                          console.warn(`[chatService] Execution function not found for tool: ${toolCall.toolName}`);
                          toolResultsForThirdCall.push({
                             role: 'tool',
                             content: JSON.stringify({ status: 'error', message: 'Execution function not found.' }),
                             tool_call_id: toolCall.toolCallId,
                          });
                      }

                  } catch (toolExecutionError: any) {
                      console.error(`[chatService] Error executing tool ${toolCall.toolName}:`, toolExecutionError);
                       toolResultsForThirdCall.push({
                         role: 'tool',
                         content: JSON.stringify({ status: 'error', message: toolExecutionError.message || String(toolExecutionError) }),
                         tool_call_id: toolCall.toolCallId,
                      });
                  }
              }

              // 4.5. Faça uma TERCEIRA chamada à IA com os resultados das ferramentas
              console.log('[chatService] Making third AI call with tool results.');
              const thirdResponse = await generateText({
                 model: modelInstance,
                 maxTokens: 4096,
                 system: updatedSystemMessage, // Manter o system prompt
                  messages: [
                      ...messages, // Mensagens originais + primeira resposta IA
                      ...secondResponse.toolCalls.map(tc => ({
                           role: 'assistant',
                           content: undefined, // Important: content is null for tool_calls message
                           tool_calls: [{
                              id: tc.toolCallId,
                              function: {
                                 name: tc.toolName,
                                 arguments: JSON.stringify(tc.args) // Args as string
                              }
                           }]
                      })),
                      ...toolResultsForThirdCall // Incluir os resultados das ferramentas
                  ],
                 tools: allAvailableTools // Passar as ferramentas novamente
              });

              console.log('[chatService] Third AI response:', thirdResponse);
              // A resposta final deve estar no texto da terceira resposta
              return { response: thirdResponse.text };

          } else {
              // Se a segunda resposta não sugeriu tool_calls, ela pode ter gerado texto final ou outra coisa
              console.log('[chatService] Second AI response did not suggest tool calls.');
              return { response: secondResponse.text || "Nenhuma ação ou resposta final da IA." };
          }

         // --- Fim da Lógica Tool Calling para Ações do Estágio ---

       } else {
         // Estágio não encontrado (pode acontecer se a IA "alucinar" um nome)
         console.warn(`[chatService] Selected stage "${selectedStageName}" not found for workspace ${workspaceId}.`);
         // TODO: Decidir como lidar: voltar ao fluxo normal, pedir clarificação, etc.
         // Por enquanto, se o estágio não for encontrado APÓS a primeira sugestão,
         // vamos deixar o fluxo cair para o processamento normal da primeira resposta ou tool use padrão.
       }
     }

     // Lógica existente para processar toolResults da PRIMEIRA CHAMADA (ferramentas padrão)
     if(toolResults.length > 0){
        console.log(`[chatService] Detected ${toolResults.length} tool calls in initial response.`);
         // Precisamos processar e responder a essas tool_calls antes de considerar a resposta final
         const toolResultsForSecondCall: CoreMessage[] = [];

         for (const toolCall of toolResults) {
              console.log(`[chatService] Executing initial tool: ${toolCall.toolName} with args:`, toolCall.args);
              try {
                  // Encontre a ferramenta padrão e execute
                  const standardTool = Object.values(tools || {}).find(t => t.tool.name === toolCall.toolName); // Busca nas ferramentas passadas na chamada inicial

                  if (standardTool && standardTool.tool.execute) {
                      const executionResult = await standardTool.tool.execute(toolCall.args);

                       toolResultsForSecondCall.push({
                         role: 'tool',
                         content: JSON.stringify(executionResult),
                         tool_call_id: toolCall.toolCallId,
                      });
                      console.log(`[chatService] Standard Tool ${toolCall.toolName} executed. Result:`, executionResult);

                  } else {
                      console.warn(`[chatService] Execution function not found for standard tool: ${toolCall.toolName}`);
                      toolResultsForSecondCall.push({
                         role: 'tool',
                         content: JSON.stringify({ status: 'error', message: 'Standard Tool execution function not found.' }),
                         tool_call_id: toolCall.toolCallId,
                      });
                  }
              } catch (toolExecutionError: any) {
                  console.error(`[chatService] Error executing standard tool ${toolCall.toolName}:`, toolExecutionError);
                   toolResultsForSecondCall.push({
                     role: 'tool',
                     content: JSON.stringify({ status: 'error', message: toolExecutionError.message || String(toolExecutionError) }),
                     tool_call_id: toolCall.toolCallId,
                  });
              }
         }

         // Faça uma segunda chamada com os resultados das ferramentas padrão
         console.log('[chatService] Making second AI call with standard tool results.');
         const secondResponseAfterStandardTools = await generateText({
             model: modelInstance,
             maxTokens: 4096,
             system: updatedSystemMessage,
              messages: [
                  ...messages, // Mensagens originais
                  ...toolResults.map(tc => ({
                       role: 'assistant',
                       content: undefined, // Important: content is null for tool_calls message
                        tool_calls: [{
                          id: tc.toolCallId,
                          function: {
                             name: tc.toolName,
                             arguments: JSON.stringify(tc.args) // Args as string
                          }
                       }]
                  })),
                  ...toolResultsForSecondCall // Incluir os resultados das ferramentas padrão
              ],
             tools: tools // Passar as ferramentas padrão novamente
         });

         console.log('[chatService] Second AI response after standard tools:', secondResponseAfterStandardTools);
         // A resposta final deve estar no texto desta segunda resposta
          return { response: secondResponseAfterStandardTools.text || "Nenhuma resposta final da IA após execução de ferramentas padrão." };

     }


     // Se nenhum estágio foi selecionado e não há toolResults da primeira chamada, retorna o texto gerado
     return { response: text };

   } catch (error: any) {
     console.error(`[chatService] Erro no serviço de geração de chat com modelo ${modelId} para Conv ${conversationId}:`, error);
     // Re-lançar o erro para que o chamador possa tratá-lo
     throw error; // Ou retornar um objeto de erro padronizado
   }
 }