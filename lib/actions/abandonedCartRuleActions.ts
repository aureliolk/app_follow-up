'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { parseDelayStringToMs } from '@/lib/timeUtils';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';

// Esquema de validação para os dados da regra
const ruleSchema = z.object({
    delayString: z.string().min(1, 'Tempo após abandono é obrigatório.'),
    messageContent: z.string().min(1, 'Mensagem de recuperação é obrigatória.'),
    // sequenceOrder: z.number().int().optional(), // A ordem pode ser gerenciada aqui ou no banco
});

// Tipo para o retorno padronizado das actions
interface ActionResult {
    success: boolean;
    message?: string;
    errors?: z.ZodIssue[] | string | null;
}

// --- Função Auxiliar: Verificar Permissão --- 
async function checkWorkspacePermission(workspaceId: string): Promise<string | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return 'Usuário não autenticado.';
    }

    // Se for super admin, concede permissão imediatamente
    if (session.user.isSuperAdmin) {
        console.log(`[Permissão] Super Admin ${session.user.id} acessando workspace ${workspaceId}. Permissão concedida.`);
        return null; 
    }

    // Se não for super admin, continua com a verificação de membro do workspace
    console.log(`[Permissão] Verificando permissão para usuário ${session.user.id} no workspace ${workspaceId}.`);
    const member = await prisma.workspaceMember.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: workspaceId,
                user_id: session.user.id,
            },
        },
        select: { role: true },
    });

    // Permitir Owner ou Admin - ajuste conforme necessário
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
        return 'Permissão negada para gerenciar regras neste workspace.';
    }

    return null; // Sem erro, permissão concedida
}

// --- CREATE ACTION --- 
export async function createAbandonedCartRule(workspaceId: string, formData: FormData): Promise<ActionResult> {
    console.log(`Server Action: createAbandonedCartRule para workspace ${workspaceId}`);

    const permissionError = await checkWorkspacePermission(workspaceId);
    if (permissionError) {
        return { success: false, message: permissionError };
    }

    const rawData = {
        delayString: formData.get('delayString') as string,
        messageContent: formData.get('messageContent') as string,
    };

    const validationResult = ruleSchema.safeParse(rawData);

    if (!validationResult.success) {
        console.warn('Validation failed:', validationResult.error.issues);
        return { success: false, errors: validationResult.error.issues, message: 'Dados inválidos.' };
    }

    const { delayString, messageContent } = validationResult.data;

    let delayMs: bigint;
    try {
        delayMs = parseDelayStringToMs(delayString);
        if (delayMs < BigInt(0)) throw new Error('Tempo de espera não pode ser negativo.');
    } catch (error: any) {
        console.warn('Invalid delay string:', error.message);
        return { success: false, message: `Formato inválido para tempo após abandono: ${error.message || 'verifique a sintaxe.'}` };
    }

    try {
        // Obter a próxima sequenceOrder
        const lastRule = await prisma.abandonedCartRule.findFirst({
            where: { workspace_id: workspaceId },
            orderBy: { sequenceOrder: 'desc' },
            select: { sequenceOrder: true },
        });
        const nextOrder = (Number(lastRule?.sequenceOrder ?? -1)) + 1;

        await prisma.abandonedCartRule.create({
            data: {
                workspace_id: workspaceId,
                delay_milliseconds: delayMs,
                message_content: messageContent,
                sequenceOrder: nextOrder,
            },
        });

        // Revalidar a página onde as regras são exibidas
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
        if (workspace?.slug) {
            revalidatePath(`/workspace/${workspace.slug}/ia`); // Ajuste o path se necessário
        }

        return { success: true, message: 'Regra de carrinho abandonado criada com sucesso!' };

    } catch (error) {
        console.error('Error creating AbandonedCartRule:', error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // Adicionar tratamento para erros específicos do Prisma se necessário
        }
        return { success: false, message: 'Falha ao criar regra no banco de dados.' };
    }
}

// --- UPDATE ACTION --- 
export async function updateAbandonedCartRule(ruleId: string, formData: FormData): Promise<ActionResult> {
    console.log(`Server Action: updateAbandonedCartRule para rule ${ruleId}`);

    // 1. Buscar regra para obter workspaceId e verificar permissão
    const rule = await prisma.abandonedCartRule.findUnique({
        where: { id: ruleId },
        select: { workspace_id: true },
    });

    if (!rule) {
        return { success: false, message: 'Regra não encontrada.' };
    }

    const permissionError = await checkWorkspacePermission(rule.workspace_id);
    if (permissionError) {
        return { success: false, message: permissionError };
    }

    // 2. Validar dados do formulário
    const rawData = {
        delayString: formData.get('delayString') as string,
        messageContent: formData.get('messageContent') as string,
    };
    const validationResult = ruleSchema.safeParse(rawData);

    if (!validationResult.success) {
        return { success: false, errors: validationResult.error.issues, message: 'Dados inválidos.' };
    }

    const { delayString, messageContent } = validationResult.data;

    let delayMs: bigint;
    try {
        delayMs = parseDelayStringToMs(delayString);
        if (delayMs < BigInt(0)) throw new Error('Tempo de espera não pode ser negativo.');
    } catch (error: any) {
        return { success: false, message: `Formato inválido para tempo após abandono: ${error.message || 'verifique a sintaxe.'}` };
    }

    // 3. Atualizar no banco
    try {
        await prisma.abandonedCartRule.update({
            where: { id: ruleId },
            data: {
                delay_milliseconds: delayMs,
                message_content: messageContent,
                // sequenceOrder pode ser atualizado aqui se for editável
            },
        });

        // Revalidar
        const workspace = await prisma.workspace.findUnique({ where: { id: rule.workspace_id }, select: { slug: true } });
        if (workspace?.slug) {
            revalidatePath(`/workspace/${workspace.slug}/ia`);
        }

        return { success: true, message: 'Regra atualizada com sucesso!' };

    } catch (error) {
        console.error('Error updating AbandonedCartRule:', error);
        return { success: false, message: 'Falha ao atualizar regra no banco de dados.' };
    }
}

// --- DELETE ACTION --- 
export async function deleteAbandonedCartRule(ruleId: string): Promise<ActionResult> {
    console.log(`Server Action: deleteAbandonedCartRule para rule ${ruleId}`);

    // 1. Buscar regra para obter workspaceId e verificar permissão
    const rule = await prisma.abandonedCartRule.findUnique({
        where: { id: ruleId },
        select: { workspace_id: true },
    });

    if (!rule) {
        return { success: false, message: 'Regra não encontrada.' };
    }

    const permissionError = await checkWorkspacePermission(rule.workspace_id);
    if (permissionError) {
        return { success: false, message: permissionError };
    }

    // 2. Excluir do banco
    try {
        await prisma.abandonedCartRule.delete({ where: { id: ruleId } });

        // Revalidar
        const workspace = await prisma.workspace.findUnique({ where: { id: rule.workspace_id }, select: { slug: true } });
        if (workspace?.slug) {
            revalidatePath(`/workspace/${workspace.slug}/ia`);
        }

        return { success: true, message: 'Regra excluída com sucesso!' };

    } catch (error) {
        console.error('Error deleting AbandonedCartRule:', error);
        return { success: false, message: 'Falha ao excluir regra do banco de dados.' };
    }
} 