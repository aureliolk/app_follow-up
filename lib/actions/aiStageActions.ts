'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { authOptions } from '@/lib/auth/auth-options';
import { getServerSession } from 'next-auth';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { FrontendAIStageActionData, ApiCallConfig } from '@/lib/types/ai-stages';
import { AIStageActionType } from '@prisma/client';

// Define the CreateAIStageData interface locally
interface CreateAIStageData {
  name: string;
  condition: string;
  isActive?: boolean;
  dataToCollect?: string[];
  finalResponseInstruction?: string | null;
  actions?: FrontendAIStageActionData[];
}

// Helper function to convert potentially complex headers to a plain object
const toPlainObject = (headers: any): Record<string, string> => {
  const plainHeaders: Record<string, string> = {};
  // Check if headers exist and are an object before iterating
  if (headers && typeof headers === 'object') {
    // Use headers.toJSON() if available
    if (typeof headers.toJSON === 'function') {
      try {
        const jsonHeaders = headers.toJSON();
        // Ensure the result of toJSON() is also a plain object before iterating
        if (jsonHeaders && typeof jsonHeaders === 'object' && !Array.isArray(jsonHeaders)) {
          for (const key in jsonHeaders) {
            if (Object.prototype.hasOwnProperty.call(jsonHeaders, key)) {
              const value = jsonHeaders[key];
              plainHeaders[key] = typeof value === 'string' ? value : JSON.stringify(value);
            }
          }
        } else {
          // Fallback to manual iteration if toJSON result is not a plain object
          for (const key in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, key)) {
              const value = headers[key];
              plainHeaders[key] = typeof value === 'string' ? value : JSON.stringify(value);
            }
          }
        }
      } catch (e) {
        console.error("Error calling toJSON or processing its result:", e);
        // Fallback to manual iteration on error
        for (const key in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, key)) {
            const value = headers[key];
            plainHeaders[key] = typeof value === 'string' ? value : JSON.stringify(value);
          }
        }
      }
    } else {
      // Manual iteration if toJSON method is not available
      for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
          const value = headers[key];
          plainHeaders[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }
    }
  }
  return plainHeaders;
};

// Função para testar uma chamada de API
export async function testApiCall(workspaceId: string, config: ApiCallConfig) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { success: false, message: 'Unauthorized' };
  }


  try {
    // Prepare headers, ensuring it's an object
    const headers = config.headers && typeof config.headers === 'object' ? config.headers : {};

    // Make the HTTP request using axios
    const response = await axios({
      method: config.method as any, // Cast method to any for axios type compatibility
      url: config.url,
      headers: headers,
      // Include the body in the request config if the method supports it
      ...(config.body && (config.method === 'POST' || config.method === 'PUT' || config.method === 'PATCH') ? { data: config.body } : {}),
    });

    // Return relevant parts of the response, ensuring headers are a plain object
    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: toPlainObject(response.headers), // Convert headers to plain object using the helper
      data: response.data, // Assuming data is already serializable (JSON)
    };

  } catch (error: any) {
    console.error('Error testing API call:', error.message);
    // Handle error response, ensuring headers are a plain object if they exist
    const errorHeaders = error.response?.headers ? toPlainObject(error.response.headers) : undefined;

    return {
      success: false,
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: errorHeaders, // Use the converted plain headers or undefined
      data: error.response?.data, // Assuming error data is also serializable
    };
  }
}

// Função para criar um novo estágio de IA
export async function createAIStage(workspaceId: string, data: CreateAIStageData) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { success: false, message: 'Unauthorized' };
  }

  try {
    console.log('[createAIStage] Incoming data:', JSON.stringify(data, null, 2));
    const newStage = await prisma.ai_stages.create({
      data: {
        id: uuidv4(),
        name: data.name,
        condition: data.condition,
        isActive: data.isActive ?? true,
        // Prisma automatically handles string[] to JsonValue conversion for dataToCollect
        dataToCollect: data.dataToCollect,
        finalResponseInstruction: data.finalResponseInstruction,
        workspaces: {
          connect: { id: workspaceId },
        },
        ai_stage_actions: {
          create: data.actions?.map(action => {
            console.log(`[createAIStage] Action config for ${action.type}:`, JSON.stringify(action.config, null, 2));
            return {
              id: action.id || uuidv4(),
              type: action.type as AIStageActionType,
              order: action.order,
              config: action.config,
              isEnabled: action.isEnabled ?? true,
              updatedAt: new Date(),
            };
          }) || [],
        },
        updatedAt: new Date(),
      },
      include: {
        ai_stage_actions: true,
      },
    });
    revalidatePath(`/workspace/${workspaceId}/ia`);
    revalidatePath(`/workspace/${workspaceId}/ia/stages`);
    return { success: true, data: newStage };
  } catch (error: any) {
    console.error('Error creating AI Stage:', error);

    return { success: false, message: error.message };
  }
}

// Função para listar todos os estágios de um workspace
export async function getAIStages(workspaceId: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    console.warn('Attempted to fetch AI stages without authentication.');
    return [];
  }

  try {
    const stages = await prisma.ai_stages.findMany({
      where: {
        workspaceId: workspaceId,
      },
      include: { // Include actions when fetching stages
        ai_stage_actions: true,
      },
      orderBy: {
        createdAt: 'asc',
      }
    });
    return stages as any; // Use any to bypass JsonValue typing issue for now
  } catch (error) {
    console.error('Error fetching AI Stages:', error);
    return [];
  }
}

// Função para buscar um estágio específico por ID
export async function getAIStageById(stageId: string, workspaceId: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return null; // Ou lançar erro
  }

  try {
    const stage = await prisma.ai_stages.findUnique({
      where: { id: stageId, workspaceId: workspaceId },
      include: { // Include actions when fetching a single stage
        ai_stage_actions: true,
      },
    });
    return stage as any; // Use any to bypass JsonValue typing issue for now
  } catch (error) {
    console.error('Error fetching AI Stage by ID:', error);
    return null;
  }
}

// Função para atualizar um estágio existente
export async function updateAIStage(stageId: string, data: Partial<CreateAIStageData>) { // Use Partial<CreateAIStageData> for update data
  const session = await getServerSession(authOptions);
  if (!session) {
    return { success: false, message: 'Unauthorized' };
  }

  try {
    console.log('[updateAIStage] Incoming data:', JSON.stringify(data, null, 2));
    // Buscar o estágio existente com suas ações para determinar quais deletar
    const existingStageWithActions = await prisma.ai_stages.findUnique({
      where: { id: stageId },
      select: { workspaceId: true, ai_stage_actions: true },
    });

    if (!existingStageWithActions) {
      return { success: false, message: 'Stage not found' };
    }

    const workspaceId = existingStageWithActions.workspaceId;
    // TODO: Add permission check here using workspaceId
    // if (!await isAdminOrMemberOfWorkspace(session.user.id, workspaceId)) { ... }

    const existingActionIds = existingStageWithActions.ai_stage_actions.map(action => action.id);
    const incomingActions = data.actions || [];
    const incomingActionIds = incomingActions.map(action => action.id).filter(Boolean);

    // IDs das ações existentes que NÃO estão na lista de ações recebidas (serão deletadas)
    const actionsToDeleteIds = existingActionIds.filter(id => !incomingActionIds.includes(id));

   console.log('[updateAIStage] Existing action IDs:', existingActionIds);
   console.log('[updateAIStage] Incoming action IDs:', incomingActionIds);
   console.log('[updateAIStage] Actions to delete IDs:', actionsToDeleteIds);

    const actionsToUpsert = incomingActions.map(action => {
     console.log(`[updateAIStage] Upserting action config for ${action.type}:`, JSON.stringify(action.config, null, 2));
     return {
      where: { id: action.id || uuidv4() },
      update: {
        type: action.type as AIStageActionType,
        order: action.order,
        config: action.config,
        isEnabled: action.isEnabled ?? true,
        updatedAt: new Date(),
      },
      create: {
        id: action.id || uuidv4(),
        type: action.type as AIStageActionType,
        order: action.order,
        config: action.config,
        isEnabled: action.isEnabled ?? true,
        updatedAt: new Date(),
      },
    }});

    const updatedStage = await prisma.ai_stages.update({
      where: { id: stageId },
      data: {
        // Atualiza campos diretos do estágio se estiverem presentes no 'data'
        ...(data.name !== undefined && { name: data.name }),
        ...(data.condition !== undefined && { condition: data.condition }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        // Prisma automatically handles string[] to JsonValue conversion for dataToCollect
        ...(data.dataToCollect !== undefined && { dataToCollect: data.dataToCollect }),
        ...(data.finalResponseInstruction !== undefined && { finalResponseInstruction: data.finalResponseInstruction }),

        ai_stage_actions: {
          // 1. Deleta ações que não estão mais na lista recebida
          deleteMany: {
            id: {
              in: actionsToDeleteIds,
            },
          },
          // 2. Cria novas ações ou atualiza ações existentes
          upsert: actionsToUpsert,
        },
      },
      include: { // Incluir ações na resposta
        ai_stage_actions: true,
      },
    });

    // Após atualizar o estágio e suas ações, garantir que as CustomHttpTools estejam em sync
    for (const action of incomingActions) {
      if (action.type === AIStageActionType.API_CALL && action.isEnabled) {
        const toolData = {
          workspaceId: workspaceId,
          name: action.config.apiName,
          description: `Ferramenta gerada automaticamente do estágio AI: ${data.name || 'Sem Nome'} - Ação: ${action.config.apiName}`,
          method: action.config.method,
          url: action.config.url,
          headers: action.config.headers || null,
          queryParametersSchema: action.config.querySchema || null,
          requestBodySchema: action.config.bodySchema || null,
          isEnabled: true, // Sempre habilitar se a ação estiver habilitada
        };

        // Tentar encontrar uma ferramenta existente com o mesmo nome e workspaceId
        const existingTool = await prisma.customHttpTool.findFirst({
          where: {
            name: toolData.name,
            workspaceId: toolData.workspaceId,
          },
        });

        if (existingTool) {
          // Atualizar ferramenta existente
          await prisma.customHttpTool.update({
            where: { id: existingTool.id },
            data: toolData,
          });
          console.log(`[aiStageActions] CustomHttpTool '${toolData.name}' atualizada.`);
        } else {
          // Criar nova ferramenta
          await prisma.customHttpTool.create({
            data: toolData,
          });
          console.log(`[aiStageActions] CustomHttpTool '${toolData.name}' criada.`);
        }
      }
    }

    // Deletar CustomHttpTools que não correspondem mais a ações API_CALL ativas
    const activeApiCallNames = incomingActions
      .filter(action => action.type === AIStageActionType.API_CALL && action.isEnabled)
      .map(action => action.config.apiName);

    await prisma.customHttpTool.deleteMany({
      where: {
        workspaceId: workspaceId,
        name: {
          notIn: activeApiCallNames,
        },
        // Opcional: Adicionar um campo para identificar ferramentas geradas por estágios
        // para evitar deletar ferramentas criadas manualmente.
        // Por enquanto, deleta qualquer ferramenta que não esteja na lista ativa.
      },
    });
    console.log(`[aiStageActions] CustomHttpTools não utilizadas deletadas.`);


    revalidatePath(`/workspace/${workspaceId}/ia`);
    revalidatePath(`/workspace/${workspaceId}/ia/stages`);
    // Revalidar também a rota de ferramentas para garantir que o toolLoader pegue as mudanças
    revalidatePath(`/workspace/${workspaceId}/ia/tools`);
    return { success: true, data: updatedStage };
  } catch (error: any) {
    console.error('Error updating AI Stage:', error);
    return { success: false, message: error.message };
  }
}

// Função para deletar um estágio
export async function deleteAIStage(stageId: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { success: false, message: 'Unauthorized' };
  }

  const stageToDelete = await prisma.ai_stages.findUnique({
    where: { id: stageId },
    select: { workspaceId: true },
  });

  if (!stageToDelete) {
    return { success: false, message: 'Stage not found' };
  }

  const workspaceId = stageToDelete.workspaceId; // Fetch workspaceId from the stage
  // TODO: Add permission check here
  // if (!await isAdminOrMemberOfWorkspace(session.user.id, workspaceId)) { ... }

  try {
    const deletedStage = await prisma.ai_stages.delete({
      where: { id: stageId },
    });
    revalidatePath(`/workspace/${workspaceId}/ia`);
    revalidatePath(`/workspace/${workspaceId}/ia/stages`);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting AI Stage:', error);
    return { success: false, message: error.message };
  }
}

export async function getAIStageByName(workspaceId: string, stageName: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { success: false, message: 'Unauthorized' };
  }

  try {
    const stage = await prisma.ai_stages.findFirst({
      where: {
        workspaceId: workspaceId,
        name: stageName,
        isActive: true, // Only fetch active stages
      },
      include: {
        ai_stage_actions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return stage;
  } catch (error: any) {
    console.error(`[getAIStageByName] Error fetching stage by name "${stageName}" for workspace ${workspaceId}:`, error);
    // Optionally, return a specific error type or null
    throw new Error(`Failed to fetch AI stage by name: ${error.message}`);
  }
}