'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { authOptions } from '@/lib/auth/auth-options';
import { getServerSession } from 'next-auth';
import axios from 'axios'; // Import axios for making HTTP requests
import { AIStageActionTypeEnum, FrontendAIStageActionData, ApiCallConfig } from '@/lib/types/ai-stages';
import { AIStageActionType } from '@prisma/client';

// Define the CreateAIStageData interface locally
interface CreateAIStageData {
    name: string;
    condition: string;
    isActive?: boolean; // Optional as it defaults to true
    dataToCollect?: string[]; // Assuming string[] based on StageForm usage
    finalResponseInstruction?: string | null;
    actions?: FrontendAIStageActionData[]; // Reusing FrontendAIStageActionData for action structure
}

// Placeholder for permission check utility
// In a real scenario, this would verify if the user has permissions for the workspace
async function checkWorkspacePermissions(userId: string, workspaceId: string) {
    // Implement permission logic here
    // For now, we'll just return true as a placeholder
    console.log(`Checking permissions for user ${userId} on workspace ${workspaceId}`);
    return true; // TODO: Implement actual permission check
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
                  if (jsonHeaders && typeof jsonHeaders === 'object' && !Array.isArray(jsonHeaders)){
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

    // TODO: Implementar verificação de permissão real para o workspace
    // Exemplo: if (!await isAdminOrMemberOfWorkspace(session.user.id, workspaceId)) { ... }

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

  // TODO: Implementar verificação de permissão real
  // Exemplo: if (!await isAdminOrMemberOfWorkspace(session.user.id, workspaceId)) { ... }

  try {
    const newStage = await prisma.aIStage.create({
      data: {
        name: data.name,
        condition: data.condition,
        isActive: data.isActive ?? true,
        // Prisma automatically handles string[] to JsonValue conversion for dataToCollect
        dataToCollect: data.dataToCollect,
        finalResponseInstruction: data.finalResponseInstruction,
        workspace: {
          connect: { id: workspaceId },
        },
        actions: { // Adicionado para criar ações relacionadas
          create: data.actions?.map(action => ({
            type: action.type as AIStageActionType,
            order: action.order,
            config: action.config,
            isEnabled: action.isEnabled ?? true,
          })) || [], // Use um array vazio se não houver ações
        },
      },
      include: { // Incluir ações na resposta, se necessário
        actions: true,
      },
    });
    revalidatePath(`/workspace/${workspaceId}/ia`);
    revalidatePath(`/workspace/${workspaceId}/ia/stages`);
    return { success: true, data: newStage };
  } catch (error: any) {
    console.error('Error creating AI Stage:', error);
    // Handle unique constraint error specifically if needed
    // if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
    //     throw new Error(`Stage with name "${data.name}" already exists in this workspace.`);
    // }
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

  // TODO: Implementar verificação de permissão real
  // Exemplo: if (!await isAdminOrMemberOfWorkspace(session.user.id, workspaceId)) { ... }

  try {
    const stages = await prisma.aIStage.findMany({
      where: {
        workspaceId: workspaceId,
      },
      include: { // Include actions when fetching stages
          actions: true,
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
   // TODO: Implementar verificação de permissão real
  // Exemplo: if (!await isAdminOrMemberOfWorkspace(session.user.id, workspaceId)) { return null; }

  try {
    const stage = await prisma.aIStage.findUnique({
      where: { id: stageId, workspaceId: workspaceId },
       include: { // Include actions when fetching a single stage
          actions: true,
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

  // TODO: Implementar verificação de permissão real

  try {
    // Buscar o estágio existente com suas ações para determinar quais deletar
    const existingStageWithActions = await prisma.aIStage.findUnique({
      where: { id: stageId },
      select: { workspaceId: true, actions: true },
    });

    if (!existingStageWithActions) {
      return { success: false, message: 'Stage not found' };
    }

    const workspaceId = existingStageWithActions.workspaceId;
    // TODO: Add permission check here using workspaceId
    // if (!await isAdminOrMemberOfWorkspace(session.user.id, workspaceId)) { ... }

    const existingActionIds = existingStageWithActions.actions.map(action => action.id);
    const incomingActions = data.actions || [];
    const incomingActionIds = incomingActions.map(action => action.id).filter(Boolean);

    // IDs das ações existentes que NÃO estão na lista de ações recebidas (serão deletadas)
    const actionsToDeleteIds = existingActionIds.filter(id => !incomingActionIds.includes(id));

    const updatedStage = await prisma.aIStage.update({
      where: { id: stageId },
      data: {
        // Atualiza campos diretos do estágio se estiverem presentes no 'data'
        ...(data.name !== undefined && { name: data.name }),
        ...(data.condition !== undefined && { condition: data.condition }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        // Prisma automatically handles string[] to JsonValue conversion for dataToCollect
        ...(data.dataToCollect !== undefined && { dataToCollect: data.dataToCollect }),
        ...(data.finalResponseInstruction !== undefined && { finalResponseInstruction: data.finalResponseInstruction }),

        actions: {
          // 1. Deleta ações que não estão mais na lista recebida
          deleteMany: {
            id: {
              in: actionsToDeleteIds,
            },
          },
          // 2. Cria novas ações ou atualiza ações existentes
          upsert: incomingActions.map(action => ({
            where: { id: action.id || 'non-existent-id' }, // Usa o ID da ação ou um ID inexistente para 'create'
            update: { // Dados para atualizar se a ação já existe
              type: action.type as AIStageActionType,
              order: action.order,
              config: action.config,
              isEnabled: action.isEnabled ?? true,
            },
            create: { // Dados para criar se a ação é nova
              type: action.type as AIStageActionType,
              order: action.order,
              config: action.config,
              isEnabled: action.isEnabled ?? true,
            },
          })),
        },
      },
      include: { // Incluir ações na resposta
        actions: true,
      },
    });

    revalidatePath(`/workspace/${workspaceId}/ia`);
    revalidatePath(`/workspace/${workspaceId}/ia/stages`);
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

  // TODO: Implementar verificação de permissão real e obter workspaceId
   const stageToDelete = await prisma.aIStage.findUnique({
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
    const deletedStage = await prisma.aIStage.delete({
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
  // TODO: Implement permission check
  // Ex: ensure user has permission to access stages in this workspace

  try {
    const stage = await prisma.aIStage.findFirst({
      where: {
        workspaceId: workspaceId,
        name: stageName,
        isActive: true, // Only fetch active stages
      },
      include: {
        actions: {
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