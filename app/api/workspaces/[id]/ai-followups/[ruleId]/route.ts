// app/api/workspaces/[id]/ai-followups/[ruleId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { parseDelayStringToMs } from '@/lib/timeUtils';

// Schema Zod para validação da atualização
const updateRuleSchema = z.object({
  delayString: z.string().min(1, 'O tempo de inatividade é obrigatório.').optional(),
  messageContent: z.string().min(1, 'A mensagem de acompanhamento é obrigatória.').optional(),
});

// --- PUT: Atualizar uma regra específica ---
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; ruleId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { id: workspaceId, ruleId } = params;
    const userId = session.user.id;

    // Verificar permissão (ADMIN necessário para atualizar)
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada para atualizar regras' }, { status: 403 });
    }

    // Verificar se a regra existe e pertence ao workspace
    const existingRule = await prisma.workspaceAiFollowUpRule.findUnique({
      where: { id: ruleId },
      select: { workspace_id: true }
    });

    if (!existingRule || existingRule.workspace_id !== workspaceId) {
      return NextResponse.json({ success: false, error: 'Regra não encontrada neste workspace' }, { status: 404 });
    }

    const body = await req.json();
    const validation = updateRuleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }

    const dataToUpdate: { delay_milliseconds?: bigint, message_content?: string } = {};
    const { delayString, messageContent } = validation.data;

    if (delayString !== undefined) {
      const delay_milliseconds = parseDelayStringToMs(delayString);
      if (delay_milliseconds === null) {
        return NextResponse.json({ success: false, error: 'Formato de tempo inválido.' }, { status: 400 });
      }
      dataToUpdate.delay_milliseconds = delay_milliseconds;
    }

    if (messageContent !== undefined) {
      dataToUpdate.message_content = messageContent;
    }

    if (Object.keys(dataToUpdate).length === 0) {
         return NextResponse.json({ success: true, message: 'Nenhuma alteração detectada.' }, { status: 200 });
    }

    const updatedRule = await prisma.workspaceAiFollowUpRule.update({
      where: { id: ruleId },
      data: dataToUpdate,
      select: { // Seleciona os campos para retornar
        id: true,
        delay_milliseconds: true,
        message_content: true,
        created_at: true,
        updated_at: true,
      }
    });

     // Converter BigInt para String antes de retornar JSON
     const ruleToReturn = {
        ...updatedRule,
        delay_milliseconds: updatedRule.delay_milliseconds.toString(),
    };

    return NextResponse.json({ success: true, data: ruleToReturn });

  } catch (error) {
    console.error('PUT /ai-followups/[ruleId] Error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao atualizar regra' }, { status: 500 });
  }
}

// --- DELETE: Excluir uma regra específica ---
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; ruleId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { id: workspaceId, ruleId } = params;
    const userId = session.user.id;

    // Verificar permissão (ADMIN necessário para excluir)
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada para excluir regras' }, { status: 403 });
    }

    // Verificar se a regra existe e pertence ao workspace antes de deletar
     const existingRule = await prisma.workspaceAiFollowUpRule.findUnique({
      where: { id: ruleId },
      select: { workspace_id: true }
    });

    if (!existingRule || existingRule.workspace_id !== workspaceId) {
      return NextResponse.json({ success: false, error: 'Regra não encontrada neste workspace' }, { status: 404 });
    }

    // Excluir a regra
    await prisma.workspaceAiFollowUpRule.delete({
      where: { id: ruleId },
    });

    return NextResponse.json({ success: true, message: 'Regra excluída com sucesso' }, { status: 200 }); // Ou 204

  } catch (error) {
    console.error('DELETE /ai-followups/[ruleId] Error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao excluir regra' }, { status: 500 });
  }
}