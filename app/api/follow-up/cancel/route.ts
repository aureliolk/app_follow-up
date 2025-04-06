// apps/next-app/app/api/follow-up/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { FollowUpStatus } from '@prisma/client'; // Importe o Enum

// Esquema de validação
const cancelFollowUpSchema = z.object({
  followUpId: z.string().uuid("ID do FollowUp inválido"),
  workspaceId: z.string().uuid("ID do Workspace inválido"),
});

export async function POST(req: NextRequest) {
  console.log("API POST /api/follow-up/cancel: Request received");
  try {
    // 1. Autenticação e Autorização
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Validar Corpo
    const body = await req.json();
    const validation = cancelFollowUpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { followUpId, workspaceId } = validation.data;

    // 3. Verificar Permissão
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER'); // Ou qual role pode cancelar
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada para esta ação' }, { status: 403 });
    }

    // 4. Encontrar e Atualizar o FollowUp
    const updatedFollowUp = await prisma.followUp.updateMany({
      where: {
        id: followUpId,
        workspace_id: workspaceId,
        status: FollowUpStatus.ACTIVE, // Só pode cancelar um ativo
      },
      data: {
        status: FollowUpStatus.CANCELLED, // Usa o Enum
        next_sequence_message_at: null,
        updated_at: new Date(),
        // completed_at pode ser null ou a data atual, dependendo da sua definição
      },
    });

    // Verificar se algum registro foi atualizado
    if (updatedFollowUp.count === 0) {
         console.warn(`API POST /api/follow-up/cancel: FollowUp ${followUpId} não encontrado, não pertence ao workspace ${workspaceId} ou não estava ativo.`);
         const existing = await prisma.followUp.findUnique({ where: { id: followUpId }, select: { status: true }});
         if (existing?.status === FollowUpStatus.CANCELLED) {
             return NextResponse.json({ success: false, error: 'Sequência já está cancelada.' }, { status: 409 });
         }
         return NextResponse.json({ success: false, error: 'Sequência ativa não encontrada ou não pertence a este workspace.' }, { status: 404 });
    }

    console.log(`API POST /api/follow-up/cancel: FollowUp ${followUpId} marked as CANCELLED.`);

    // Opcional: Remover jobs pendentes da fila
    // try {
    //   await sequenceStepQueue.remove(`seq_${followUpId}_*`);
    //   console.log(`API POST /api/follow-up/cancel: Pending jobs for FollowUp ${followUpId} removed from queue.`);
    // } catch (removeError) {
    //   console.error(`API POST /api/follow-up/cancel: Failed to remove jobs for FollowUp ${followUpId}:`, removeError);
    // }

    // 5. Retornar Sucesso
    return NextResponse.json({ success: true, message: "Sequência cancelada com sucesso." });

  } catch (error: any) {
    console.error('API POST /api/follow-up/cancel: Internal Server Error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor.' }, { status: 500 });
  }
}