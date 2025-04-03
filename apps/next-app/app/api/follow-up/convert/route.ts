// app/api/follow-up/convert/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../../packages/shared-lib/src/db';
import { checkPermission } from '../../../../../../packages/shared-lib/src/permissions';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../../packages/shared-lib/src/auth/auth-options';
import { FollowUpStatus } from '@prisma/client'; // Importe o Enum

// Esquema de validação
const convertFollowUpSchema = z.object({
  followUpId: z.string().uuid("ID do FollowUp inválido"),
  workspaceId: z.string().uuid("ID do Workspace inválido"), // Para verificação de permissão
});

export async function POST(req: NextRequest) {
  console.log("API POST /api/follow-up/convert: Request received");
  try {
    // 1. Autenticação e Autorização
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Validar Corpo
    const body = await req.json();
    const validation = convertFollowUpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { followUpId, workspaceId } = validation.data;

    // 3. Verificar Permissão (Ex: MEMBER pode converter?)
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada para esta ação' }, { status: 403 });
    }

    // 4. Encontrar e Atualizar o FollowUp
    const updatedFollowUp = await prisma.followUp.updateMany({ // updateMany para incluir workspaceId no where
      where: {
        id: followUpId,
        workspace_id: workspaceId, // Garante que pertence ao workspace correto
        status: FollowUpStatus.ACTIVE, // Só pode converter um follow-up ativo
      },
      data: {
        status: FollowUpStatus.CONVERTED, // Usa o Enum
        next_sequence_message_at: null, // Limpa o próximo agendamento
        completed_at: new Date(), // Marca a data de conclusão
        updated_at: new Date(),
      },
    });

    // Verificar se algum registro foi atualizado
    if (updatedFollowUp.count === 0) {
        console.warn(`API POST /api/follow-up/convert: FollowUp ${followUpId} não encontrado, não pertence ao workspace ${workspaceId} ou não estava ativo.`);
        // Verificar se já está convertido para dar uma msg melhor?
        const existing = await prisma.followUp.findUnique({ where: { id: followUpId }, select: { status: true }});
        if (existing?.status === FollowUpStatus.CONVERTED) {
             return NextResponse.json({ success: false, error: 'Sequência já está marcada como convertida.' }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: 'Sequência ativa não encontrada ou não pertence a este workspace.' }, { status: 404 });
    }

    console.log(`API POST /api/follow-up/convert: FollowUp ${followUpId} marked as CONVERTED.`);

    // Opcional: Remover jobs pendentes da fila (embora o worker vá ignorar pelo status)
    // try {
    //   await sequenceStepQueue.remove(`seq_${followUpId}_*`); // Padrão para remover jobs relacionados
    //   console.log(`API POST /api/follow-up/convert: Pending jobs for FollowUp ${followUpId} removed from queue.`);
    // } catch (removeError) {
    //   console.error(`API POST /api/follow-up/convert: Failed to remove jobs for FollowUp ${followUpId}:`, removeError);
    // }

    // 5. Retornar Sucesso
    return NextResponse.json({ success: true, message: "Sequência marcada como convertida." });

  } catch (error: any) {
    console.error('API POST /api/follow-up/convert: Internal Server Error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor.' }, { status: 500 });
  }
}