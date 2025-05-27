// lib/actions/workspaceSettingsActions.ts
'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { authOptions } from '@/lib/auth/auth-options';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

// Schema de validação para as configurações de IA
const AiSettingsSchema = z.object({
  workspaceId: z.string().min(1, 'ID do workspace é obrigatório'),
  ai_default_system_prompt: z.string().nullable().optional(),
  ai_model_preference: z.string().nullable().optional(),
  ai_name: z.string().nullable().optional(),
  ai_delay_between_messages: z.number().min(0).nullable().optional(),
  ai_send_fractionated: z.boolean().optional(),
});

type AiSettingsInput = z.infer<typeof AiSettingsSchema>;

/**
 * Server Action para atualizar as configurações de IA do workspace
 */
export async function updateAiSettingsAction(data: AiSettingsInput) {
  try {
    // Verificar autenticação
    const session = await getServerSession(authOptions);
    if (!session) {
      return { success: false, error: 'Não autorizado. Faça login para continuar.' };
    }

    // Validar dados de entrada
    const validationResult = AiSettingsSchema.safeParse(data);
    if (!validationResult.success) {
      console.error('[updateAiSettingsAction] Validation errors:', validationResult.error.errors);
      return { 
        success: false, 
        error: `Dados inválidos: ${validationResult.error.errors.map(e => e.message).join(', ')}` 
      };
    }

    const { workspaceId, ...updateData } = validationResult.data;

    console.log('[updateAiSettingsAction] Received data:', {
      workspaceId,
      updateData
    });

    // Verificar se o workspace existe e se o usuário tem permissão
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { 
        id: true, 
        owner_id: true,
        // Buscar valores atuais para comparação
        ai_default_system_prompt: true,
        ai_model_preference: true,
        ai_name: true,
        ai_delay_between_messages: true,
        ai_send_fractionated: true,
      }
    });

    if (!workspace) {
      return { success: false, error: 'Workspace não encontrado.' };
    }

    // Verificar permissões (simplificado - apenas o owner pode alterar por enquanto)
    if (workspace.owner_id !== session.user.id) {
      return { success: false, error: 'Você não tem permissão para alterar as configurações deste workspace.' };
    }

    console.log('[updateAiSettingsAction] Current workspace values:', {
      ai_default_system_prompt: workspace.ai_default_system_prompt,
      ai_model_preference: workspace.ai_model_preference,
      ai_name: workspace.ai_name,
      ai_delay_between_messages: workspace.ai_delay_between_messages,
      ai_send_fractionated: workspace.ai_send_fractionated,
    });

    // Preparar dados para atualização, removendo campos undefined
    const dataToUpdate: any = {};
    
    if (updateData.ai_default_system_prompt !== undefined) {
      dataToUpdate.ai_default_system_prompt = updateData.ai_default_system_prompt === '' 
        ? null 
        : updateData.ai_default_system_prompt;
    }
    
    if (updateData.ai_model_preference !== undefined) {
      dataToUpdate.ai_model_preference = updateData.ai_model_preference === '' 
        ? null 
        : updateData.ai_model_preference;
    }
    
    if (updateData.ai_name !== undefined) {
      dataToUpdate.ai_name = updateData.ai_name === '' 
        ? null 
        : updateData.ai_name;
    }
    
    if (updateData.ai_delay_between_messages !== undefined) {
      dataToUpdate.ai_delay_between_messages = updateData.ai_delay_between_messages;
    }
    
    if (updateData.ai_send_fractionated !== undefined) {
      dataToUpdate.ai_send_fractionated = Boolean(updateData.ai_send_fractionated);
    }

    console.log('[updateAiSettingsAction] Data to update in DB:', {
      workspaceId,
      dataToUpdate,
      originalUpdateData: updateData
    });

    // Verificar se há dados para atualizar
    if (Object.keys(dataToUpdate).length === 0) {
      return { success: true, message: 'Nenhuma alteração detectada.' };
    }

    // Atualizar o workspace
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: dataToUpdate,
      select: {
        id: true,
        ai_default_system_prompt: true,
        ai_model_preference: true,
        ai_name: true,
        ai_delay_between_messages: true,
        ai_send_fractionated: true,
      }
    });

    console.log('[updateAiSettingsAction] Workspace updated successfully:', updatedWorkspace);

    // Revalidar as páginas que podem ter sido afetadas
    revalidatePath(`/workspace/${workspaceId}/ia`);
    revalidatePath(`/workspace/${workspaceId}`);

    return { 
      success: true, 
      message: 'Configurações de IA atualizadas com sucesso!',
      data: updatedWorkspace
    };

  } catch (error: any) {
    console.error('[updateAiSettingsAction] Error updating AI settings:', error);
    
    // Tratar erros específicos do Prisma
    if (error.code === 'P2002') {
      return { success: false, error: 'Conflito de dados. Verifique os valores inseridos.' };
    }
    
    if (error.code === 'P2025') {
      return { success: false, error: 'Workspace não encontrado.' };
    }

    return { 
      success: false, 
      error: 'Erro interno do servidor. Tente novamente mais tarde.' 
    };
  }
}

/**
 * Server Action para obter as configurações atuais de IA do workspace
 */
export async function getAiSettingsAction(workspaceId: string) {
  try {
    // Verificar autenticação
    const session = await getServerSession(authOptions);
    if (!session) {
      return { success: false, error: 'Não autorizado.' };
    }

    // Buscar as configurações
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        ai_default_system_prompt: true,
        ai_model_preference: true,
        ai_name: true,
        ai_delay_between_messages: true,
        ai_send_fractionated: true,
        owner_id: true,
      }
    });

    if (!workspace) {
      return { success: false, error: 'Workspace não encontrado.' };
    }

    // Verificar permissões básicas
    if (workspace.owner_id !== session.user.id) {
      return { success: false, error: 'Acesso negado.' };
    }

    const { owner_id, ...settings } = workspace;

    return { 
      success: true, 
      data: settings 
    };

  } catch (error: any) {
    console.error('[getAiSettingsAction] Error fetching AI settings:', error);
    return { 
      success: false, 
      error: 'Erro ao carregar configurações.' 
    };
  }
}