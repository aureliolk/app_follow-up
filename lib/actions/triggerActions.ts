'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
// import { db } from '@/lib/db'; // TODO: Uncomment when DB logic is added
// import { TriggerSchema } from '@/lib/schemas'; // TODO: Define this schema

// TODO: Define a schema for the input validation using Zod
const CreateTriggerActionSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1, { message: "Nome do trigger é obrigatório." }),
  message: z.string().min(1, { message: "Mensagem é obrigatória." }),
  contacts: z.array(z.object({
    identifier: z.string(),
    name: z.string().optional(),
  })).min(1, { message: "Pelo menos um contato é necessário."}),
  sendIntervalSeconds: z.number().int().positive({ message: "Intervalo deve ser positivo."}),
  allowedSendStartTime: z.string(), // TODO: Validate time format
  allowedSendEndTime: z.string(), // TODO: Validate time format
  allowedSendDays: z.string(), // Expecting JSON string of numbers [0-6]
  isTemplate: z.boolean(),
  templateName: z.string().optional(),
  templateCategory: z.string().optional(), // TODO: Validate category if isTemplate is true
});

type CreateTriggerActionInput = z.infer<typeof CreateTriggerActionSchema>;

interface ContactInput {
    identifier: string;
    name?: string;
}

interface CreateTriggerActionData {
  workspaceId: string;
  name: string;
  message: string;
  contacts: ContactInput[];
  sendIntervalSeconds: number;
  allowedSendStartTime: string;
  allowedSendEndTime: string;
  allowedSendDays: string; // JSON string of numbers [0-6]
  isTemplate: boolean;
  templateName?: string;
  templateCategory?: string;
}

export async function createTriggerAction(
    data: CreateTriggerActionData
): Promise<{ success: boolean; error?: string; triggerId?: string }> {

  // TODO: Validate input using CreateTriggerActionSchema.safeParse(data)
  // TODO: Check user permissions/authentication

  console.log("Server Action: createTriggerAction received data:", data);

  try {
    // TODO: Implement database logic to save the trigger
    // Example: const newTrigger = await db.trigger.create({ data: { ... } });

    // TODO: Implement logic to schedule the trigger (e.g., add to BullMQ)

    console.log("Server Action: Trigger creation simulation successful.");
    const simulatedTriggerId = `trigger_${Date.now()}`;

    // Revalidate the path to update the list on the frontend
    // TODO: Adjust the path if needed, e.g., /workspace/${data.workspaceId}/triggers
    revalidatePath(`/workspace/${data.workspaceId}/triggers`); 

    return { success: true, triggerId: simulatedTriggerId };

  } catch (error) {
    console.error("Error creating trigger:", error);
    return { success: false, error: "Falha ao criar o trigger no servidor." };
  }
}

// TODO: Add actions for updateTriggerAction, deleteTriggerAction, etc. 