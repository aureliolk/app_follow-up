'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { HttpMethod, Prisma } from '@prisma/client'; // Importar Prisma para tipos

// Esquema Zod para validação
const baseToolSchema = z.object({
    workspaceId: z.string().uuid("ID do Workspace inválido (UUID esperado)."),
    name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres."),
    description: z.string().min(10, "Descrição deve ter pelo menos 10 caracteres."),
    method: z.nativeEnum(HttpMethod),
    url: z.string().url("URL inválida."),
    // Validar como objetos JSON ou nulo. O input do form virá como string, então a conversão ocorre no submit.
    // O Zod garante que, após a conversão, seja um objeto ou null.
    headers: z.record(z.string(), z.any()).nullable().optional(), // Permite objeto ou null
    queryParametersSchema: z.record(z.string(), z.any()).nullable().optional(),
    requestBodySchema: z.record(z.string(), z.any()).nullable().optional(),
    isEnabled: z.boolean(),
});

// Tipo inferido do schema Zod para os dados de criação/atualização
export type ToolInputData = z.infer<typeof baseToolSchema>;

// --- CREATE ACTION ---
export async function createCustomHttpTool(data: ToolInputData) {
    console.log("[Server Action] createCustomHttpTool called with data:", data);

    // A validação do Zod já garante que os campos JSON são objetos ou null
    const validation = baseToolSchema.safeParse(data);
    if (!validation.success) {
        console.error("[Server Action Error] Validation failed:", validation.error.errors);
        throw new Error(`Erro de validação: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }

    const validatedData = validation.data;

    // TODO: Verificar permissão do usuário no workspaceId

    try {
        // Montar o objeto data explicitamente, atribuindo diretamente os valores validados (incluindo nulls)
        const createData: Prisma.CustomHttpToolUncheckedCreateInput = {
            workspaceId: validatedData.workspaceId,
            name: validatedData.name,
            description: validatedData.description,
            method: validatedData.method,
            url: validatedData.url,
            headers: validatedData.headers, // Atribui o objeto ou null diretamente
            queryParametersSchema: validatedData.queryParametersSchema,
            requestBodySchema: validatedData.requestBodySchema,
            isEnabled: validatedData.isEnabled,
        };

        const newTool = await prisma.customHttpTool.create({ data: createData });
        console.log("[Server Action] Tool created successfully:", newTool);

        revalidatePath(`/workspace/${validatedData.workspaceId}/ia/tools`);

        return { success: true, tool: newTool };
    } catch (error) {
        console.error("[Server Action Error] Failed to create tool:", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                 const target = error.meta?.target as string[] | undefined;
                 if (target?.includes('name') && target?.includes('workspaceId')) {
                    throw new Error('Já existe uma ferramenta com este nome neste workspace.');
                 } else {
                    throw new Error('Erro de restrição única ao criar a ferramenta.');
                 }
            }
        }
        throw new Error('Falha ao criar a ferramenta.');
    }
}

// --- UPDATE ACTION ---
// Omitimos workspaceId aqui, pois o pegamos do tool existente
const updateToolSchema = baseToolSchema.omit({ workspaceId: true });
export type ToolUpdateData = z.infer<typeof updateToolSchema>;

export async function updateCustomHttpTool(toolId: string, data: ToolUpdateData) {
    console.log(`[Server Action] updateCustomHttpTool called for ID ${toolId} with data:`, data);

    const validation = updateToolSchema.safeParse(data);
    if (!validation.success) {
        console.error("[Server Action Error] Validation failed:", validation.error.errors);
        throw new Error(`Erro de validação: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }

    const validatedData = validation.data;

    try {
        // Buscar a ferramenta para pegar o workspaceId (e para verificar permissão no futuro)
        const existingTool = await prisma.customHttpTool.findUnique({
            where: { id: toolId },
            select: { workspaceId: true }
        });

        if (!existingTool) {
            throw new Error('Ferramenta não encontrada.');
        }

        const workspaceId = existingTool.workspaceId;
        // TODO: Verificar permissão do usuário no workspaceId

        // Montar o objeto data explicitamente para update
        const updateData: Prisma.CustomHttpToolUpdateInput = {
            name: validatedData.name,
            description: validatedData.description,
            method: validatedData.method,
            url: validatedData.url,
            headers: validatedData.headers, // Atribui o objeto ou null diretamente
            queryParametersSchema: validatedData.queryParametersSchema,
            requestBodySchema: validatedData.requestBodySchema,
            isEnabled: validatedData.isEnabled,
        };

        const updatedTool = await prisma.customHttpTool.update({
            where: { id: toolId },
            data: updateData,
        });
        console.log("[Server Action] Tool updated successfully:", updatedTool);

        revalidatePath(`/workspace/${workspaceId}/ia/tools`);

        return { success: true, tool: updatedTool };
    } catch (error) {
         console.error(`[Server Action Error] Failed to update tool ${toolId}:`, error);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             const target = error.meta?.target as string[] | undefined;
             if (target?.includes('name') && target?.includes('workspaceId')) {
                throw new Error('Já existe uma ferramenta com este nome neste workspace.');
             } else {
                throw new Error('Erro de restrição única ao atualizar a ferramenta.');
             }
         }
        // Lança erro específico se não for encontrado, senão erro genérico
         if (error instanceof Error && error.message === 'Ferramenta não encontrada.') {
            throw error;
         }
        throw new Error('Falha ao atualizar a ferramenta.');
    }
}

// --- DELETE ACTION ---
export async function deleteCustomHttpTool(toolId: string) {
    console.log(`[Server Action] deleteCustomHttpTool called for ID ${toolId}`);

    try {
        // Buscar a ferramenta para pegar o workspaceId (e para verificar permissão no futuro)
        const existingTool = await prisma.customHttpTool.findUnique({
            where: { id: toolId },
            select: { workspaceId: true }
        });

        if (!existingTool) {
            // Se já não existe, considera sucesso silencioso ou lança erro?
            // Lançar erro parece mais seguro para feedback na UI.
            throw new Error('Ferramenta não encontrada.');
        }

        const workspaceId = existingTool.workspaceId;
        // TODO: Verificar permissão do usuário no workspaceId

        await prisma.customHttpTool.delete({
            where: { id: toolId },
        });
        console.log("[Server Action] Tool deleted successfully:", toolId);

        revalidatePath(`/workspace/${workspaceId}/ia/tools`);

        return { success: true };
    } catch (error) {
         console.error(`[Server Action Error] Failed to delete tool ${toolId}:`, error);
         if (error instanceof Error && error.message === 'Ferramenta não encontrada.') {
            throw error;
         }
        throw new Error('Falha ao excluir a ferramenta.');
    }
} 