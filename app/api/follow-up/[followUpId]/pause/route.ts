// apps/next-app/app/api/follow-up/[followUpId]/pause/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { FollowUpStatus as PrismaFollowUpStatus } from '@prisma/client'; // Importe Enum

const pauseSchema = z.object({
    workspaceId: z.string().uuid("ID do Workspace inválido"), // Vem do body para check de permissão
});

export async function POST(req: NextRequest, { params }: { params: { followUpId: string } }) {
    const { followUpId } = await params;
    console.log(`API POST /api/follow-up/${followUpId}/pause: Request received`);

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        const userId = session.user.id;

        const body = await req.json();
        const validation = pauseSchema.safeParse(body);
        if (!validation.success) return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
        const { workspaceId } = validation.data;

        const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER'); // Ou outra role
        if (!hasPermission) return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });

        const updated = await prisma.followUp.updateMany({
            where: {
                id: followUpId,
                workspace_id: workspaceId,
                status: PrismaFollowUpStatus.ACTIVE, // Só pausa se estiver ativo
            },
            data: {
                status: PrismaFollowUpStatus.PAUSED,
                next_sequence_message_at: null, // Limpa agendamento
                updated_at: new Date(),
            }
        });

        if (updated.count === 0) {
             console.warn(`API Pause: FollowUp ${followUpId} não encontrado, não ativo ou não pertence ao workspace ${workspaceId}.`);
             return NextResponse.json({ success: false, error: 'Sequência ativa não encontrada ou não pertence a este workspace.' }, { status: 404 });
        }

        console.log(`API Pause: FollowUp ${followUpId} pausado com sucesso.`);
         // Opcional: Remover jobs futuros da fila (mas o worker já vai ignorar)
         // await sequenceStepQueue.remove(`seq_${followUpId}_*`);

        return NextResponse.json({ success: true, message: 'Sequência pausada.' });

    } catch (error: any) {
        console.error(`API Pause Error for ${followUpId}:`, error);
        return NextResponse.json({ success: false, error: 'Erro interno ao pausar sequência.' }, { status: 500 });
    }
}