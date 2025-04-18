'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { parseDelayStringToMs } from '@/lib/timeUtils'; // Assumindo que a função existe aqui

// Schema para validação dos dados do formulário
const FollowUpRuleSchema = z.object({
  delayString: z.string().min(1, { message: "O tempo de inatividade é obrigatório." })
      .regex(/^(\d+\s*[mhd])+$/i, { message: "Formato de tempo inválido. Use m, h, d (ex: 2h, 1d 30m)." }), // Ajustar regex se semanas 'w' forem permitidas
  messageContent: z.string().min(1, { message: "A mensagem é obrigatória." }),
});

export async function createFollowUpRule(workspaceId: string, formData: FormData) {
  console.log(`[Action] createFollowUpRule called for workspace: ${workspaceId}`);
  
  const rawFormData = {
    delayString: formData.get('delayString'),
    messageContent: formData.get('messageContent'),
  };

  // Validar usando Zod
  const validatedFields = FollowUpRuleSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    console.error('[Action] createFollowUpRule validation failed:', validatedFields.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Erro de validação: " + Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', '),
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { delayString, messageContent } = validatedFields.data;

  try {
    // Converter delayString para milissegundos (BigInt)
    const delayMilliseconds = parseDelayStringToMs(delayString);
    console.log(`[Action] Parsed delayString '${delayString}' to ${delayMilliseconds}ms`);

    if (delayMilliseconds === null || delayMilliseconds <= BigInt(0)) {
      console.error(`[Action] Invalid delayMilliseconds calculated: ${delayMilliseconds}`);
      return {
        success: false,
        message: 'O tempo de inatividade calculado é inválido.'
      };
    }

    // Criar no banco de dados
    const newRule = await prisma.workspaceAiFollowUpRule.create({
      data: {
        workspace_id: workspaceId,
        delay_milliseconds: delayMilliseconds, // Deve ser BigInt
        message_content: messageContent,
      },
    });
    console.log('[Action] Follow-up rule created successfully:', newRule.id);

    // Revalidar o path para atualizar a UI
    // Ajuste o path se a página de configurações da IA for diferente
    revalidatePath(`/workspace/${workspaceId}/ia`); 
    console.log(`[Action] Path revalidated: /workspace/${workspaceId}/ia`);

    return {
      success: true,
      message: 'Regra de acompanhamento criada com sucesso!',
      rule: newRule, // Opcional: retornar a regra criada
    };

  } catch (error) {
    console.error('[Action] Error creating follow-up rule:', error);
    // Verifica se é um erro conhecido do Prisma (ex: conexão)
    // Poderia adicionar verificações mais específicas aqui
    if (error instanceof Error) {
        return {
            success: false,
            message: `Erro ao criar regra: ${error.message}`,
        };
    }
    return {
      success: false,
      message: 'Ocorreu um erro desconhecido ao criar a regra de acompanhamento.',
    };
  }
}

export async function updateFollowUpRule(ruleId: string, formData: FormData) {
  console.log(`[Action] updateFollowUpRule called for rule: ${ruleId}`);

  const rawFormData = {
    delayString: formData.get('delayString'),
    messageContent: formData.get('messageContent'),
  };

  // Validar usando Zod (mesmo schema)
  const validatedFields = FollowUpRuleSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    console.error('[Action] updateFollowUpRule validation failed:', validatedFields.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Erro de validação: " + Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', '),
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { delayString, messageContent } = validatedFields.data;

  try {
    // Converter delayString para milissegundos (BigInt)
    const delayMilliseconds = parseDelayStringToMs(delayString);
    console.log(`[Action] Parsed delayString '${delayString}' to ${delayMilliseconds}ms`);

    if (delayMilliseconds === null || delayMilliseconds <= BigInt(0)) {
      console.error(`[Action] Invalid delayMilliseconds calculated: ${delayMilliseconds}`);
      return {
        success: false,
        message: 'O tempo de inatividade calculado é inválido.'
      };
    }

    // Atualizar no banco de dados
    const updatedRule = await prisma.workspaceAiFollowUpRule.update({
      where: { id: ruleId },
      data: {
        delay_milliseconds: delayMilliseconds,
        message_content: messageContent,
      },
    });
    console.log('[Action] Follow-up rule updated successfully:', updatedRule.id);

    // Revalidar o path para atualizar a UI
    // Precisamos do workspaceId para revalidar o path correto.
    // Vamos assumir que o workspaceId está implícito ou buscá-lo se necessário.
    // Se a regra tem workspaceId, podemos usá-lo.
    if (updatedRule.workspace_id) {
        revalidatePath(`/workspace/${updatedRule.workspace_id}/ia`);
        console.log(`[Action] Path revalidated: /workspace/${updatedRule.workspace_id}/ia`);
    } else {
        // Idealmente, deveríamos ter o workspaceId. 
        // Como fallback, podemos revalidar um path mais genérico ou logar um erro.
        console.warn('[Action] Could not determine workspaceId to revalidate path after update.');
        // revalidatePath('/workspace'); // Exemplo de fallback mais genérico
    }

    return {
      success: true,
      message: 'Regra de acompanhamento atualizada com sucesso!',
      rule: updatedRule, // Opcional: retornar a regra atualizada
    };

  } catch (error) {
    console.error(`[Action] Error updating follow-up rule ${ruleId}:`, error);
    if (error instanceof Error) {
        // Tratamento específico para erro 'Record to update not found.'
        if ((error as any).code === 'P2025') { // Código de erro do Prisma para registro não encontrado
            return {
                success: false,
                message: 'Erro ao atualizar: Regra não encontrada.'
            };
        }
        return {
            success: false,
            message: `Erro ao atualizar regra: ${error.message}`,
        };
    }
    return {
      success: false,
      message: 'Ocorreu um erro desconhecido ao atualizar a regra de acompanhamento.',
    };
  }
}

export async function deleteFollowUpRule(ruleId: string) {
  console.log(`[Action] deleteFollowUpRule called for rule: ${ruleId}`);

  let workspaceId: string | null = null;

  try {
    // Passo 1: Buscar a regra para obter o workspaceId para revalidação
    // Usar findUniqueOrThrow garante que a regra existe antes de tentar deletar
    // Selecionamos apenas o workspace_id
    const ruleToDelete = await prisma.workspaceAiFollowUpRule.findUniqueOrThrow({
      where: { id: ruleId },
      select: { workspace_id: true },
    });
    workspaceId = ruleToDelete.workspace_id;
    console.log(`[Action] Found rule to delete in workspace: ${workspaceId}`);

    // Passo 2: Deletar a regra
    await prisma.workspaceAiFollowUpRule.delete({
      where: { id: ruleId },
    });
    console.log(`[Action] Follow-up rule ${ruleId} deleted successfully.`);

    // Passo 3: Revalidar o path usando o workspaceId obtido
    revalidatePath(`/workspace/${workspaceId}/ia`);
    console.log(`[Action] Path revalidated: /workspace/${workspaceId}/ia`);

    return {
      success: true,
      message: 'Regra de acompanhamento excluída com sucesso!',
    };

  } catch (error) {
    console.error(`[Action] Error deleting follow-up rule ${ruleId}:`, error);
    if (error instanceof Error) {
        // Tratamento específico para erro 'Record to delete not found.'
        // findUniqueOrThrow já trataria isso, mas adicionamos por segurança.
        if ((error as any).code === 'P2025') { 
            return {
                success: false,
                message: 'Erro ao excluir: Regra não encontrada.'
            };
        }
        return {
            success: false,
            message: `Erro ao excluir regra: ${error.message}`,
        };
    }
    return {
      success: false,
      message: 'Ocorreu um erro desconhecido ao excluir a regra de acompanhamento.',
    };
  }
}

// TODO: Implementar deleteFollowUpRule 