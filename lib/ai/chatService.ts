// lib/ai/chatService.ts - Versão atualizada com tool calling para estágios

import { CoreMessage, streamText, generateText, Tool } from 'ai';

import { getModelInstance } from './modelSelector';
import { getActiveToolsForWorkspace } from './toolLoader';
import { prisma } from '@/lib/db';
import { AIStageActionTypeEnum } from '@/lib/types/ai-stages';
import axios from 'axios';
import { z } from 'zod';
import { AVAILABLE_MODELS } from '@/lib/constants';
import {  systemPromptCheckName } from './tools/openRouterModel';
import { aiResponseText } from './tools/openRouterModel';

// Interface para contexto de estágio
interface StageContext {
  currentStage?: string;
  collectedData: Record<string, any>;
  stageHistory: string[];
}

// Interface para a estrutura esperada do campo metadata da Conversa
interface ConversationMetadata {
  currentStage?: string;
  collectedData?: Record<string, any>;
  stageHistory?: string[];
  // Adicione outros campos de metadata se necessário
}

// Função auxiliar para executar ações de um estágio
async function executeStageActions(stage: any, context: StageContext, conversationId: string) {
  const results: any[] = [];
  let apiResponseData: any = null; // Para armazenar a resposta da API

  if (!stage.actions || stage.actions.length === 0) {
    return { results, apiResponseData };
  }

  // Ordenar e executar ações habilitadas
  const enabledActions = stage.actions
    .filter((action: any) => action.isEnabled)
    .sort((a: any, b: any) => a.order - b.order);

  for (const action of enabledActions) {
    try {
      switch (action.type) {
        case AIStageActionTypeEnum.API_CALL:
          const apiResult = await executeApiCall(action.config, context.collectedData);
          results.push({
            type: 'api_call',
            name: action.config.apiName || 'unnamed_api',
            result: apiResult
          });

          // Armazenar a resposta da API para retornar à IA
          apiResponseData = apiResult;

          // Se configurado, mapear resposta para variáveis de contexto
          if (action.config.useApiResponse && action.config.responseMapping) {
            mapApiResponseToContext(apiResult, action.config.responseMapping, context);
          }
          break;

        case AIStageActionTypeEnum.SEND_TEXT_MESSAGE:
          // TODO: Implementar envio de mensagem
          break;

        default:
          console.warn(`Tipo de ação desconhecido: ${action.type}`);
      }
    } catch (error) {
      console.error(`Erro ao executar ação ${action.type}:`, error);
      results.push({
        type: action.type,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  }

  return { results, apiResponseData };
}

// Função para executar chamada de API
async function executeApiCall(config: any, contextData: Record<string, any>) {
  const { url, method, headers, querySchema, bodySchema } = config;

  // Substituir placeholders na URL
  let processedUrl = url;
  const urlPlaceholders = url.match(/\{([^}]+)\}/g) || [];
  for (const placeholder of urlPlaceholders) {
    const key = placeholder.slice(1, -1);
    if (contextData[key]) {
      processedUrl = processedUrl.replace(placeholder, contextData[key]);
    }
  }

  // Processar headers e substituir placeholders
  const processedHeaders: Record<string, string> = {};
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string' && value.includes('{{')) {
        // TODO: Substituir com valores seguros do ambiente
        processedHeaders[key] = value;
      } else {
        processedHeaders[key] = String(value);
      }
    }
  }

  // Preparar dados da requisição
  const requestConfig: any = {
    method,
    url: processedUrl,
    headers: processedHeaders,
  };

  // Adicionar query params ou body baseado no método
  if (['GET', 'DELETE'].includes(method) && querySchema) {
    requestConfig.params = extractDataBySchema(contextData, querySchema);
  } else if (['POST', 'PUT', 'PATCH'].includes(method) && bodySchema) {
    requestConfig.data = extractDataBySchema(contextData, bodySchema);
  }

  const response = await axios(requestConfig);
  return response.data;
}

// Função para extrair dados baseado em um schema
function extractDataBySchema(data: Record<string, any>, schema: any): Record<string, any> {
  if (!schema || !schema.properties) return {};

  const result: Record<string, any> = {};
  for (const [key, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
    if (data[key] !== undefined) {
      result[key] = data[key];
    }
  }
  return result;
}

// Função para mapear resposta da API para o contexto
function mapApiResponseToContext(
  apiResponse: any,
  mappingConfig: Record<string, string>,
  context: StageContext
) {
  for (const [varName, path] of Object.entries(mappingConfig)) {
    const value = getValueByPath(apiResponse, path);
    if (value !== undefined) {
      context.collectedData[varName] = value;
    }
  }
}

// Função auxiliar para acessar valor por caminho (ex: "data.user.name")
function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Função para criar uma ferramenta de estágio
function createStageTool(stage: any, workspaceId: string, conversationId: string): Tool<any, any> {
  // Criar schema dinâmico baseado em dataToCollect
  const properties: Record<string, any> = {};
  const requiredFieldsInTool: string[] = []; // Para rastrear os campos obrigatórios

  if (Array.isArray(stage.dataToCollect)) {
    for (const field of stage.dataToCollect) {
      if (typeof field === 'string' && field.trim() !== '') {
        const fieldName = field.trim();
        properties[fieldName] = z.string(); // Todos os campos são obrigatórios por padrão
        requiredFieldsInTool.push(fieldName);
      } else {
        console.warn(`[createStageTool] Campo inválido em dataToCollect para estágio ${stage.name}:`, field);
      }
    }
  }

  return {
    description: `Ativar estágio: ${stage.name}. Condição: ${stage.condition}`,
    // Todos os campos são obrigatórios, então não usamos .partial()
    parameters: z.object(properties),
    execute: async (params: any) => {
      console.log(`[Stage Tool] Executing stage '${stage.name}' with parameters:`, JSON.stringify(params, null, 2));

      const missingRequiredFields: string[] = [];
      for (const requiredField of requiredFieldsInTool) {
        if (!params[requiredField]) { // Checks if the required parameter was not provided by the AI
          missingRequiredFields.push(requiredField);
        }
      }
      if (missingRequiredFields.length > 0) {
        console.log(`[Stage Tool] Missing required fields for stage '${stage.name}':`, missingRequiredFields);
      }

      if (missingRequiredFields.length > 0) {
        // Se faltarem dados obrigatórios, a ferramenta retorna um feedback estruturado para a IA
        return {
          type: "missing_data", // Um novo tipo de retorno para a IA
          missingFields: missingRequiredFields,
          message: `Para ativar o estágio '${stage.name}', preciso dos seguintes dados: ${missingRequiredFields.join(', ')}. Por favor, pergunte ao usuário por essas informações.`
        };
      }

      // Se todos os dados obrigatórios estiverem presentes, continua com a lógica original do estágio
      const tempContext: StageContext = {
        currentStage: stage.name,
        collectedData: params, // Os dados que a IA "coletou" (passou como parâmetros)
        stageHistory: []
      };

      // Execute stage actions
      const { results, apiResponseData } = await executeStageActions(stage, tempContext, conversationId);
      console.log(`[Stage Tool] executeStageActions results for stage '${stage.name}':`, JSON.stringify(results, null, 2));
      if (apiResponseData) {
        console.log(`[Stage Tool] API Response Data for stage '${stage.name}':`, JSON.stringify(apiResponseData, null, 2));
      }

      // Se houver resposta da API, retorná-la de forma estruturada
      if (apiResponseData) {
        console.log(`[Stage Tool] Retornando dados da API para o estágio '${stage.name}'`);

        // Verificar se há instrução final de resposta
        let responseText = '';
        if (stage.finalResponseInstruction) {
          responseText = stage.finalResponseInstruction;
          // Substituir placeholders na instrução final
          for (const [key, value] of Object.entries(tempContext.collectedData)) {
            responseText = responseText.replace(`{{${key}}}`, String(value));
          }
        } else if (apiResponseData.responseInstruction) {
            // Check if responseInstruction is directly in apiResponseData
            responseText = apiResponseData.responseInstruction
        }

        return {
          type: "api_response", // Tipo de retorno para a IA
          stageId: stage.id,
          stageName: stage.name,
          collectedData: params,
          apiResponse: apiResponseData,
          responseInstruction: responseText,
          message: `Estágio '${stage.name}' executado com sucesso. Dados da API recebidos.`
        };
      }

      return {
        type: "success", // Tipo de retorno para a IA
        stageId: stage.id,
        stageName: stage.name,
        collectedData: params,
        message: `Estágio '${stage.name}' ativado com os dados coletados.`
      };
    }
  };
}

// Função principal de chat atualizada
export async function processAIChat(
  messages: CoreMessage[],
  workspaceId: string,
  conversationId: string,
  streamMode: boolean = true,
  modelPreference?: string,
  additionalContext?: string
) {
  try {
    // Carregar estágios ativos do workspace
    const activeStages = await prisma.ai_stages.findMany({
      where: {
        workspaceId,
        isActive: true
      },
      include: {
        ai_stage_actions: true
      }
    });

    // Obter contexto da conversa para rastrear estágios
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        metadata: true,
        workspace: {
          select: {
            ai_default_system_prompt: true,
            ai_model_preference: true
          }
        },
        client: {
          select: {
            name: true
          }
        }
      }
    });

    let conversationMetadata: ConversationMetadata | undefined;
    if (typeof conversation?.metadata === 'object' && conversation.metadata !== null) {
      conversationMetadata = conversation.metadata as ConversationMetadata;
    }

    const stageContext: StageContext = {
      currentStage: conversationMetadata?.currentStage,
      collectedData: conversationMetadata?.collectedData || {},
      stageHistory: conversationMetadata?.stageHistory || []
    };

    // Criar ferramentas de estágio
    const stageTools: Record<string, Tool<any, any>> = {};
    for (const stage of activeStages) {
      const toolName = `stage_${stage.name.toLowerCase().replace(/\s+/g, '_')}`;
      stageTools[toolName] = createStageTool(stage, workspaceId, conversationId);
    }

    // Carregar ferramentas customizadas existentes
    const customTools = await getActiveToolsForWorkspace(workspaceId);

    // Combinar todas as ferramentas em um objeto ToolSet
    const allTools: Record<string, Tool<any, any>> = {
      ...customTools,
      ...stageTools
    };

    const responseCheckName = await aiResponseText([{ role: 'user', content: conversation?.client?.name }], systemPromptCheckName);

    const baseInstructions = `
    Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
    Timezone do cliente: America/Sao_Paulo
    Id do workspace: ${workspaceId}
    Id da conversa: ${conversationId}
    Nome do cliente:  ${responseCheckName.text}
    Voce e capaz de Escutar audio e ver imagens. se o cliente pergunta se vc pode ver uma imagem, vc deve responder que sim. se o cliente pergunta se vc pode ouvir um audio, vc deve responder que sim.
    `;

    let stageInstructions = '';
    if (activeStages.length > 0) {
      stageInstructions = `
 INSTRUÇÕES DE ESTÁGIOS:
 Você tem acesso a estágios específicos que podem ser ativados durante a conversa. Cada estágio tem uma condição para ativação e pode coletar dados específicos.
 
 Estágios disponíveis:
 ${activeStages.map(stage => {
   const dataToCollectList = Array.isArray(stage.dataToCollect) && stage.dataToCollect.length > 0
     ? ` (Dados a coletar - TODOS OBRIGATÓRIOS: ${stage.dataToCollect.map((f: string) => f.trim()).join(', ')})`
     : '';
   return `- ${stage.name}: ${stage.condition}${dataToCollectList}`;
 }).join('\n')}
 
 Quando identificar que uma condição de estágio foi atendida:
 1.  **Priorize a Coleta de Dados**: Antes de chamar a ferramenta do estágio, certifique-se de ter coletado TODOS os dados listados em "Dados a coletar" para aquele estágio. Se você não tiver um dado, **pergunte diretamente ao usuário por ele**.
 2.  Use a ferramenta correspondente ao estágio (stage_[nome]).
 3.  **Interprete o Retorno da Ferramenta**:
     *   Se a ferramenta retornar um objeto com \`type: "missing_data"\`, isso significa que faltam dados obrigatórios. Você receberá uma lista em \`missingFields\`. **Sua tarefa é perguntar ao usuário por esses campos específicos.**
     *   Se a ferramenta retornar um objeto com \`type: "api_response"\` ou \`type: "success"\`, o estágio foi executado. Use as informações fornecidas (como \`apiResponse\` ou \`responseInstruction\`) para formular sua resposta ao usuário.
 
 IMPORTANTE:
 -   Sempre que um dado obrigatório estiver faltando, você DEVE perguntar ao usuário por ele.
 -   Somente chame a ferramenta do estágio quando tiver todos os dados obrigatórios, ou quando o usuário indicar que não pode fornecer mais informações.
 
 ${stageContext.currentStage ? `Estágio atual: ${stageContext.currentStage}` : ''}
 ${Object.keys(stageContext.collectedData).length > 0 ? `Dados já coletados: ${JSON.stringify(stageContext.collectedData)}` : ''}
 `;
    }

    console.log('[processAIChat] baseInstructions:', baseInstructions);
    console.log('[processAIChat] stageInstructions:', stageInstructions);

    const systemPrompt = `${baseInstructions}${conversation?.workspace?.ai_default_system_prompt || ''}${stageInstructions}${additionalContext ? `\n\n${additionalContext}` : ''}`;

    // Obter modelo de linguagem
    const modelIdentifier = modelPreference || conversation?.workspace?.ai_model_preference || AVAILABLE_MODELS[0].value;
    const model = getModelInstance(
      modelIdentifier
    );

    // Encontrar o objeto do modelo na lista para verificar se suporta tools
    const selectedModel = AVAILABLE_MODELS.find(m => m.value === modelIdentifier);
    const supportsTools = selectedModel ? selectedModel.tool : false; // Assume false se não encontrar (deveria encontrar)

    console.log('modelIdentifier', modelIdentifier);
    console.log('supportsTools', supportsTools);

    // Processar com streaming ou não
    if (streamMode) {
      const result = streamText({
        model,
        messages,
        system: systemPrompt,
        ...(supportsTools ? { 
        tools: allTools,
        toolChoice: 'auto',
        maxSteps: 5
        } : {}),
      });

      // Processar tool calls a partir do fullStream
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of result.fullStream) {
            if (chunk.type === 'tool-call') {
              const toolCall = chunk;
              console.log('[processAIChat] Received tool-call chunk:', JSON.stringify(toolCall, null, 2));
              // Intercept stage tool calls
              if (toolCall.toolName.startsWith('stage_')) {
                const stageName = toolCall.toolName.replace('stage_', '').replace(/_/g, ' ');
                const stage = activeStages.find(s =>
                  s.name.toLowerCase() === stageName.toLowerCase()
                );
                console.log(`[processAIChat] Matched stage: ${stage?.name} for toolName: ${toolCall.toolName}`);

                if (stage) {
                  // Atualizar contexto (dados coletados são os args da tool call)
                  stageContext.currentStage = stage.name;
                  // Evita duplicidade no histórico se a tool call for re-executada
                  if (stageContext.stageHistory[stageContext.stageHistory.length - 1] !== stage.name) {
                     stageContext.stageHistory.push(stage.name);
                  }
                  Object.assign(stageContext.collectedData, toolCall.args);


                  // Executar ações do estágio para obter o apiResponseData
                  // Note: No streaming mode, we don't directly return tool results this way.
                  // The tool's execute function would have already returned the data in the non-streaming part.
                  // In streaming, the AI processes the tool_result chunk itself.
                  // We execute actions here primarily for side effects (like saving metadata).
                  // The actual apiResponseData should ideally come from the tool_result chunk processed by the AI.
                  // However, based on the user's request structure (modifying createStageTool return),
                  // we need to ensure the tool result contains the apiResponse.
                  // The AI SDK is supposed to handle the tool execution and provide the result chunk.
                  // Let's assume the modification in createStageTool is correctly picked up by the SDK.
                  // We still need to update the metadata based on the execution side effects.
                  const { results: actionResults, apiResponseData: executedApiResponse } = await executeStageActions(stage, stageContext, conversationId);


                  // Salvar contexto atualizado na conversa
                   // We save both collectedData and any API response data from the execution,
                   // although the AI should primarily rely on the tool_result chunk for the API response.
                   const updatedMetadata: any = {
                       ...(conversationMetadata || {}),
                       currentStage: stageContext.currentStage,
                       collectedData: stageContext.collectedData,
                       stageHistory: stageContext.stageHistory,
                       lastStageActions: actionResults,
                   };
                   // Optionally save the executed API response data in metadata if needed for debugging or state tracking
                   if (executedApiResponse) {
                       updatedMetadata.lastApiResponse = executedApiResponse;
                   }
                   console.log('[processAIChat] Updating conversation metadata:', JSON.stringify(updatedMetadata, null, 2));

                   await prisma.conversation.update({
                     where: { id: conversationId },
                     data: {
                       metadata: updatedMetadata
                     }
                   });

                   // The tool result chunk should contain the return value from createStageTool.execute
                   // The AI will process this chunk and see the apiResponse field.
                 }
               }
             }
             // Yield all chunks to the stream
             controller.enqueue(chunk);
           }
           controller.close();
         },
       });

       return stream;

     } else { // Non-streaming mode
       const result = await generateText({
         model,
         messages,
         system: systemPrompt,
         ...(supportsTools ? { 
           tools: allTools,
           toolChoice: 'auto',
           maxSteps: 5
         } : {}),
       });

       // Processar tool calls de estágios no modo não-streaming
       for (const toolCall of result.toolCalls || []) {
        console.log('[processAIChat] Received tool-call in non-streaming mode:', JSON.stringify(toolCall, null, 2));
         if (toolCall.toolName.startsWith('stage_')) {
            const stageName = toolCall.toolName.replace('stage_', '').replace(/_/g, ' ');
            const stage = activeStages.find(s =>
              s.name.toLowerCase() === stageName.toLowerCase()
            );
            console.log(`[processAIChat] Matched stage: ${stage?.name} for toolName: ${toolCall.toolName}`);

            if (stage) {
               // Update context
               stageContext.currentStage = stage.name;
                if (stageContext.stageHistory[stageContext.stageHistory.length - 1] !== stage.name) {
                   stageContext.stageHistory.push(stage.name);
                }
               Object.assign(stageContext.collectedData, toolCall.args);

               // Execute actions (this will also update context via mapApiResponseToContext if configured)
               const { results: actionResults, apiResponseData: executedApiResponse } = await executeStageActions(stage, stageContext, conversationId);

               // Save updated context and action results in metadata
               const updatedMetadata: any = {
                   ...(conversationMetadata || {}),
                   currentStage: stageContext.currentStage,
                   collectedData: stageContext.collectedData,
                   stageHistory: stageContext.stageHistory,
                   lastStageActions: actionResults,
               };
                // Optionally save the executed API response data in metadata
                if (executedApiResponse) {
                    updatedMetadata.lastApiResponse = executedApiResponse;
                }
                console.log('[processAIChat] Updating conversation metadata:', JSON.stringify(updatedMetadata, null, 2));

               await prisma.conversation.update({
                 where: { id: conversationId },
                 data: {
                   metadata: updatedMetadata
                 }
               });

               // In non-streaming mode, the result object itself has the tool results.
               // The AI will receive the return value from createStageTool.execute directly here.
               // We don't need to manually add it to messages for processing by the AI in this mode.
            }
         }
       }

       return result;
     }
   } catch (error) {
     console.error('[processAIChat] Erro:', error);
     throw error;
   }
 }
