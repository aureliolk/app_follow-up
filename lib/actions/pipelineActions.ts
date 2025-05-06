'use server';

import { prisma } from '@/lib/db';
import { Prisma, ActivitySource } from '@prisma/client'; // Import ActivitySource enum directly
import { revalidatePath } from 'next/cache'; // Import for revalidation
import type { PipelineStageBasic, DealWithClient, PipelineStageUpdateInput, DealCreateInput, ClientBasic } from '@/lib/types/pipeline';
import { getServerSession } from 'next-auth/next'; // Import getServerSession
import { authOptions } from '@/lib/auth/auth-options'; // Import authOptions


// TODO: Implement proper authorization checks for all functions
// Ensure the calling user has access to the provided workspaceId


// --- Pipeline Stage Actions ---

/**
 * Fetches all pipeline stages for a given workspace, ordered by their defined order.
 * @param workspaceId - The ID of the workspace.
 * @returns Promise<PipelineStageBasic[]> - Array of pipeline stages.
 */
export async function getPipelineStages(workspaceId: string): Promise<PipelineStageBasic[]> {
  console.log(`[Action|getPipelineStages] Fetching stages for workspace: ${workspaceId}`);
  // TODO: Add authorization check: Ensure user can access this workspaceId

  if (!workspaceId) {
    console.error('[Action|getPipelineStages] Workspace ID not provided.');
    return []; 
  }

  try {
    const stages = await prisma.pipelineStage.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { order: 'asc' },
    });
    console.log(`[Action|getPipelineStages] Found ${stages.length} stages.`);
    return stages;
  } catch (error) {
    console.error(`[Action|getPipelineStages] Error fetching stages for workspace ${workspaceId}:`, error);
    throw new Error('Falha ao buscar etapas do pipeline.'); 
  }
}

/**
 * Creates a new pipeline stage for a workspace.
 * @param workspaceId - The ID of the workspace.
 * @param name - The name of the new stage.
 * @param color - The color hex code for the stage.
 * @returns Promise<PipelineStageBasic> - The created pipeline stage.
 */
export async function createPipelineStage(
  workspaceId: string, 
  name: string, 
  color: string = '#cccccc' // Default color if not provided
): Promise<PipelineStageBasic> {
  console.log(`[Action|createPipelineStage] Creating stage "${name}" for workspace: ${workspaceId}`);
  // TODO: Add authorization check

  if (!workspaceId || !name) {
    console.error('[Action|createPipelineStage] Workspace ID or Stage Name not provided.');
    throw new Error('Nome da etapa e ID do workspace são obrigatórios.');
  }

  try {
    // Find the highest current order to append the new stage
    const lastStage = await prisma.pipelineStage.findFirst({
      where: { workspace_id: workspaceId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const newOrder = (lastStage?.order ?? -1) + 1;

    const newStage = await prisma.pipelineStage.create({
      data: {
        workspace_id: workspaceId,
        name: name,
        color: color,
        order: newOrder,
      },
    });
    console.log(`[Action|createPipelineStage] Stage "${name}" (ID: ${newStage.id}) created with order ${newOrder}.`);
    
    // Revalidate the path for the settings page to show the new stage
    revalidatePath(`/workspace/${workspaceId}/kaban/settings`);
    // Optionally revalidate the main kaban page as well
    revalidatePath(`/workspace/${workspaceId}/kaban`);

    return newStage;
  } catch (error) {
    console.error(`[Action|createPipelineStage] Error creating stage "${name}" for workspace ${workspaceId}:`, error);
    throw new Error('Falha ao criar nova etapa do pipeline.');
  }
}

/**
 * Deletes a pipeline stage.
 * IMPORTANT: This currently doesn't handle moving deals from the deleted stage.
 * Consider adding logic to move deals to a default stage or prevent deletion if deals exist.
 * @param stageId - The ID of the stage to delete.
 * @param workspaceId - The ID of the workspace (for authorization).
 * @returns Promise<void>
 */
export async function deletePipelineStage(stageId: string, workspaceId: string): Promise<void> {
   console.log(`[Action|deletePipelineStage] Deleting stage ${stageId} from workspace: ${workspaceId}`);
   // TODO: Add authorization check
   // TODO: Add logic to handle deals in the stage being deleted.

   if (!stageId || !workspaceId) {
     console.error('[Action|deletePipelineStage] Stage ID or Workspace ID not provided.');
     throw new Error('ID da etapa e ID do workspace são obrigatórios.');
   }

   try {
       // Verify stage belongs to workspace before deleting (optional but recommended)
       const stage = await prisma.pipelineStage.findFirst({
           where: { id: stageId, workspace_id: workspaceId },
           select: { id: true, name: true, _count: { select: { deals: true } } } // Get name for error, check if deals exist
       });

       if (!stage) {
           throw new Error('Etapa não encontrada ou não pertence ao workspace.');
       }

       // Basic check: Prevent deletion if deals are present in the stage
       if (stage._count.deals > 0) {
           console.warn(`[Action|deletePipelineStage] Attempted to delete stage ${stageId} which contains ${stage._count.deals} deals.`);
           throw new Error(`Não é possível excluir a etapa "${stage.name}" pois ela contém negociações. Mova as negociações primeiro.`);
       }

       await prisma.pipelineStage.delete({
           where: { id: stageId },
       });

       console.log(`[Action|deletePipelineStage] Stage ${stageId} deleted successfully.`);

       // Revalidate paths
       revalidatePath(`/workspace/${workspaceId}/kaban/settings`);
       revalidatePath(`/workspace/${workspaceId}/kaban`);

   } catch (error) {
       console.error(`[Action|deletePipelineStage] Error deleting stage ${stageId}:`, error);
       if (error instanceof Error && error.message.includes("contém negociações")) {
           throw error; // Re-throw specific user-facing error
       }
       throw new Error('Falha ao excluir a etapa do pipeline.');
   }
}

/**
 * Updates an existing pipeline stage.
 * @param workspaceId - The ID of the workspace (for authorization).
 * @param stageId - The ID of the stage to update.
 * @param data - An object containing the fields to update (name, color).
 * @returns Promise<PipelineStageBasic> - The updated pipeline stage.
 */
export async function updatePipelineStage(
  workspaceId: string,
  stageId: string,
  data: PipelineStageUpdateInput 
): Promise<PipelineStageBasic> {
  console.log(`[Action|updatePipelineStage] Updating stage ${stageId} in workspace: ${workspaceId} with data:`, data);
  // TODO: Add authorization check

  if (!workspaceId || !stageId || !data) {
    console.error('[Action|updatePipelineStage] Workspace ID, Stage ID, or update data not provided.');
    throw new Error('Dados insuficientes para atualizar a etapa.');
  }

  // Basic validation for incoming data
  if (data.name !== undefined && !data.name.trim()) {
    throw new Error('O nome da etapa não pode ficar vazio.');
  }
  if (data.color !== undefined && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(data.color)) {
    throw new Error('Formato de cor inválido. Use hexadecimal (ex: #aabbcc).');
  }

  try {
    // Verify stage belongs to workspace before updating
    const existingStage = await prisma.pipelineStage.findFirst({
      where: { id: stageId, workspace_id: workspaceId },
      select: { id: true } // Just need to confirm existence
    });

    if (!existingStage) {
      throw new Error('Etapa não encontrada ou não pertence ao workspace.');
    }

    // Perform the update
    const updatedStage = await prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        name: data.name, // Update name if provided
        color: data.color, // Update color if provided
        // Note: Order is not updated here. Separate action needed for reordering.
      },
    });

    console.log(`[Action|updatePipelineStage] Stage ${stageId} updated successfully.`);

    // Revalidate paths
    revalidatePath(`/workspace/${workspaceId}/kaban/settings`);
    // Revalidate Kaban page as name/color change might affect it
    revalidatePath(`/workspace/${workspaceId}/kaban`);

    return updatedStage;

  } catch (error) {
    console.error(`[Action|updatePipelineStage] Error updating stage ${stageId}:`, error);
     if (error instanceof Error && (error.message.includes("pertence ao workspace") || error.message.includes("inválido"))) {
       throw error; // Re-throw specific user-facing errors
     }
    throw new Error('Falha ao atualizar a etapa do pipeline.');
  }
}

/**
 * Updates the order of pipeline stages.
 * @param workspaceId - The ID of the workspace.
 * @param orderedStageIds - An array of stage IDs in the desired new order.
 * @returns Promise<void>
 */
export async function updatePipelineStageOrder(workspaceId: string, orderedStageIds: string[]): Promise<void> {
  console.log(`[Action|updatePipelineStageOrder] Updating stage order for workspace ${workspaceId}:`, orderedStageIds);
  // TODO: Authorization check

  if (!workspaceId || !Array.isArray(orderedStageIds)) {
      throw new Error('Workspace ID e lista ordenada de IDs das etapas são obrigatórios.');
  }

  try {
      // Use a transaction to update all orders atomically
      await prisma.$transaction(
          orderedStageIds.map((stageId, index) => 
              prisma.pipelineStage.updateMany({ // Use updateMany to ensure it belongs to the workspace
                  where: {
                      id: stageId,
                      workspace_id: workspaceId, // Security check: only update stages belonging to this workspace
                  },
                  data: {
                      order: index, // Set the order based on the array index
                  },
              })
          )
      );

      console.log(`[Action|updatePipelineStageOrder] Stage order updated successfully for workspace ${workspaceId}.`);
      revalidatePath(`/workspace/${workspaceId}/kaban`);
      revalidatePath(`/workspace/${workspaceId}/kaban/settings`); // Revalidate settings page too

  } catch (error) {
      console.error(`[Action|updatePipelineStageOrder] Error updating stage order for workspace ${workspaceId}:`, error);
      throw new Error('Falha ao reordenar as etapas do pipeline.');
  }
}


// --- Deal Actions ---

/**
 * Fetches all deals for a given workspace, including basic client info.
 * @param workspaceId - The ID of the workspace.
 * @returns Promise<DealWithClient[]> - Array of deals with client info.
 */
export async function getDeals(workspaceId: string): Promise<DealWithClient[]> {
  console.log(`[Action|getDeals] Fetching deals for workspace: ${workspaceId}`);
  // TODO: Add authorization check: Ensure user can access this workspaceId

  if (!workspaceId) {
    console.error('[Action|getDeals] Workspace ID not provided.');
    return [];
  }

  try {
    const deals = await prisma.deal.findMany({
      where: { workspace_id: workspaceId },
      include: {
        client: {
          select: { name: true, id: true }, // Select only needed client fields
        },
        // assignedTo: { select: { id: true, name: true, image: true } }, // Optional: include basic assignee info
        // _count: { select: { notes: true, tasks: true } } // Optional: include counts
      },
      // orderBy: { createdAt: 'desc' }, 
    });
    console.log(`[Action|getDeals] Found ${deals.length} deals.`);
    return deals;
  } catch (error) {
    console.error(`[Action|getDeals] Error fetching deals for workspace ${workspaceId}:`, error);
    throw new Error('Falha ao buscar negociações (deals).');
  }
}

/**
 * Updates the stage of a specific deal.
 * @param dealId - The ID of the deal to update.
 * @param newStageId - The ID of the new pipeline stage.
 * @param workspaceId - The ID of the workspace (for authorization check).
 * @returns Promise<Prisma.DealGetPayload<{}>> - The updated deal.
 */
export async function updateDealStage(dealId: string, newStageId: string, workspaceId: string): Promise<Prisma.DealGetPayload<{}>> {
  console.log(`[Action|updateDealStage] Attempting to move deal ${dealId} to stage ${newStageId} in workspace ${workspaceId}`);
  
  // Get current user session
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  
  // TODO: Add proper authorization check here using userId and workspaceId
  // if (!userId) { throw new Error('User not authenticated.'); }
  // const hasAccess = await checkPermission(workspaceId, userId, 'EDITOR'); // Or appropriate role
  // if (!hasAccess) { throw new Error('User does not have permission to modify deals.'); }

  if (!dealId || !newStageId || !workspaceId) {
    console.error('[Action|updateDealStage] Missing dealId, newStageId, or workspaceId.');
    throw new Error('Dados insuficientes para atualizar estágio do deal.');
  }

  try {
    // Use transaction to ensure atomicity
    const updatedDeal = await prisma.$transaction(async (tx) => {
      // 1. Get the current deal to find the old stage ID
      const currentDeal = await tx.deal.findUnique({
        where: { id: dealId, workspace_id: workspaceId },
        select: { stage_id: true, name: true }, // Select name for log message
      });

      if (!currentDeal) {
        throw new Error('Deal não encontrado ou não pertence ao workspace.');
      }
      const oldStageId = currentDeal.stage_id;

      // Prevent update if stage hasn't changed
      if (oldStageId === newStageId) {
        console.log(`[Action|updateDealStage] Deal ${dealId} is already in stage ${newStageId}. No update needed.`);
        // Need to fetch the deal again within the transaction context if returning it
        const currentDealData = await tx.deal.findUnique({ 
          where: { id: dealId }, 
          // Include necessary fields if the return type expects more than just the ID
          // include: { client: { select: { name: true, id: true } } } // Example
        }); 
        if (!currentDealData) throw new Error("Deal não encontrado ao tentar retornar dados atuais.");
        return currentDealData;
      }

      // 2. Get names of old and new stages for the log message
      const [oldStage, newStage] = await Promise.all([
        tx.pipelineStage.findUnique({ where: { id: oldStageId }, select: { name: true } }),
        tx.pipelineStage.findUnique({ where: { id: newStageId, workspace_id: workspaceId }, select: { name: true } })
      ]);

      if (!newStage) {
        throw new Error('Nova etapa não encontrada ou inválida para este workspace.');
      }

      // 3. Update the deal's stage
      const dealBeingUpdated = await tx.deal.update({
        where: { id: dealId },
        data: { 
          stage_id: newStageId,
        },
      });

      // 4. Create the activity log entry
      const logMessage = `Negociação movida de "${oldStage?.name ?? 'Etapa Desconhecida'}" para "${newStage.name}"${userId ? '' : ' (por Sistema/Automação)'}.`;
      await tx.dealActivityLog.create({
        data: {
          deal_id: dealId,
          action: 'Estágio Alterado',
          message: logMessage,
          source: userId ? ActivitySource.USER : ActivitySource.SYSTEM, // Set source based on user presence
          user_id: userId, // Link to user if available
        }
      });
      
      console.log(`[Action|updateDealStage] Activity log created for moving deal ${dealId}.`);
      return dealBeingUpdated;
    });

    console.log(`[Action|updateDealStage] Deal ${dealId} successfully moved to stage ${newStageId} and logged.`);
    // Revalidate Kaban and Dashboard pages
    revalidatePath(`/workspace/${workspaceId}/kaban`);
    revalidatePath(`/workspace/${workspaceId}/dashboard`); // Revalidate dashboard

    if (!updatedDeal) {
        throw new Error("Falha ao retornar dados do deal após a transação.");
    }

    return updatedDeal;
  } catch (error) {
    console.error(`[Action|updateDealStage] Error updating stage for deal ${dealId}:`, error);
    // Re-throw specific known errors
    if (error instanceof Error && (error.message.includes('Deal não encontrado') || error.message.includes('Nova etapa não encontrada'))) {
      throw error;
    }
    throw new Error('Falha ao atualizar estágio do deal.');
  }
}

/**
 * Creates a new deal in a specific workspace and pipeline stage.
 * @param workspaceId - The ID of the workspace.
 * @param data - Object containing the deal data (name, stageId, value?, clientId).
 * @returns Promise<DealWithClient> - The newly created deal (including basic client info).
 */
export async function createDeal(
  workspaceId: string,
  data: DealCreateInput
): Promise<DealWithClient> { 
  console.log(`[Action|createDeal] Creating deal "${data.name}" for client ${data.clientId} in stage ${data.stageId}`);
  // TODO: Add authorization check

  // Basic validation (clientId is guaranteed by the type)
  if (!workspaceId || !data.stageId || !data.name?.trim()) { 
    throw new Error('Workspace, Etapa Inicial e Nome são obrigatórios.');
  }

  // Optional: Validate stageId belongs to workspaceId
  const stageExists = await prisma.pipelineStage.findFirst({
    where: { id: data.stageId, workspace_id: workspaceId },
    select: { id: true },
  });
  if (!stageExists) {
    throw new Error('Etapa inicial inválida ou não pertence a este workspace.');
  }

  // Optional: Validate clientId belongs to workspaceId
  const clientExists = await prisma.client.findFirst({
    where: { id: data.clientId, workspace_id: workspaceId }, 
    select: { id: true },
  });
  if (!clientExists) {
    throw new Error('Cliente selecionado inválido ou não pertence a este workspace.');
  }
  

  try {
    // Prepare data
    const dealData: Prisma.DealCreateInput = {
        workspace: { connect: { id: workspaceId } },
        stage: { connect: { id: data.stageId } },     
        name: data.name,                            
        value: data.value,
        client: { connect: { id: data.clientId } } 
        // ai_controlled: true // Default is true in schema, no need to set explicitly unless changing
        // assigned_to_id: null // Default is null
    };

    const newDeal = await prisma.deal.create({
      data: dealData,
      include: { 
        client: {
          select: { name: true, id: true },
        },
      },
    });
        
    console.log(`[Action|createDeal] Deal "${data.name}" (ID: ${newDeal.id}) created successfully.`);

    try {
      revalidatePath(`/workspace/${workspaceId}/kaban`);
    } catch (error: any) {
      if (error.message && error.message.includes('Invariant: static generation store missing')) {
        console.warn(`[Action|createDeal] Skipping revalidatePath for /workspace/${workspaceId}/kaban due to non-HTTP context (e.g., worker). Deal ${newDeal.id} was created.`);
      } else {
        // Se for outro erro da revalidação, podemos optar por relançá-lo ou logar como crítico
        console.error(`[Action|createDeal] Error during revalidatePath for deal ${newDeal.id}:`, error);
        // Dependendo da política, poderia relançar: throw error;
      }
    }

    // Need to cast because the included client might make TS think it's not just Prisma.DealGetPayload
    // but the structure matches DealWithClient
    return newDeal as DealWithClient; 

  } catch (error) {
    console.error(`[Action|createDeal] Error creating deal "${data.name}":`, error);
     if (error instanceof Error && (error.message.includes("obrigatórios") || error.message.includes("inválida"))) {
       throw error;
     }
    if (error instanceof Prisma.PrismaClientValidationError) {
        // Try to extract the missing argument name for a more specific error message
        const match = error.message.match(/Argument `(.*)` is missing./);
        if (match && match[1]) {
            throw new Error(`Falha na validação: O campo '${match[1]}' está faltando ou é inválido.`);
        }
        throw new Error(`Falha na validação dos dados da negociação.`);
    }
    throw new Error('Falha ao criar a negociação.');
  }
}

// TODO: Add functions for getDealDetails, updateDeal, deleteDeal
// TODO: Add functions for Deal Notes (create, list)
// TODO: Add functions for Deal Tasks (create, list, update)
// TODO: Add functions for Deal Documents (create, list, delete)
// TODO: Add functions for Deal Activity Logs (create, list)
// TODO: Add functions for Pipeline Rules (create, list, update, delete)

// --- Client Actions (related to Pipeline/Deals) ---

/**
 * Fetches basic client information (id, name) for a given workspace.
 * Used for populating selection lists (e.g., when creating a deal).
 * @param workspaceId - The ID of the workspace.
 * @returns Promise<ClientBasic[]> - Array of basic client info.
 */
export async function getClientsForWorkspace(workspaceId: string): Promise<ClientBasic[]> {
  console.log(`[Action|getClientsForWorkspace] Fetching clients for workspace: ${workspaceId}`);
  // TODO: Add authorization check

  if (!workspaceId) {
    console.error('[Action|getClientsForWorkspace] Workspace ID not provided.');
    return [];
  }

  try {
    const clients = await prisma.client.findMany({
      where: { workspace_id: workspaceId },
      select: {
        id: true,
        name: true,
        // Include phone_number if useful for display
        phone_number: true 
      },
      orderBy: {
        name: 'asc', // Order alphabetically for easier selection
      },
      // Add a limit if the number of clients could be very large
      // take: 1000, 
    });
    console.log(`[Action|getClientsForWorkspace] Found ${clients.length} clients.`);
    
    // Map the result to ensure it strictly matches ClientBasic, especially if phone was added
    const clientBasics: ClientBasic[] = clients.map(c => ({ id: c.id, name: c.name }));

    return clientBasics;
  } catch (error) {
    console.error(`[Action|getClientsForWorkspace] Error fetching clients for workspace ${workspaceId}:`, error);
    throw new Error('Falha ao buscar clientes do workspace.');
  }
} 