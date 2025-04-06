// apps/next-app/app/api/follow-up/[followUpId]/resume/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from "@/lib/db";
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { FollowUpStatus as PrismaFollowUpStatus, Prisma } from '@prisma/client';
import { addSequenceStepJob } from '@/lib/queues/queueService';

const resumeSchema = z.object({
    workspaceId: z.string().uuid("ID do Workspace inválido"),
});

export async function POST(req: NextRequest, { params }: { params: { followUpId: string } }) {
    const { followUpId } = params;
    console.log(`API POST /api/follow-up/${followUpId}/resume: Request received`);

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        const userId = session.user.id;

        const body = await req.json();
        const validation = resumeSchema.safeParse(body);
        if (!validation.success) return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
        const { workspaceId } = validation.data;

        const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER'); // Ou outra role
        if (!hasPermission) return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });

        // Iniciar transação para garantir atomicidade
        const result = await prisma.$transaction(async (tx) => {
            // 1. Buscar o FollowUp PAUSADO e suas regras
            const followUp = await tx.followUp.findFirst({
                where: {
                    id: followUpId,
                    workspace_id: workspaceId,
                    status: PrismaFollowUpStatus.PAUSED,
                },
                include: {
                    workspace: {
                        select: {
                            ai_follow_up_rules: {
                                orderBy: { created_at: 'asc' },
                                select: { id: true, delay_milliseconds: true }
                            }
                        }
                    }
                }
            });

            if (!followUp) {
                console.warn(`API Resume: FollowUp ${followUpId} não encontrado, não pausado ou não pertence ao workspace ${workspaceId}.`);
                // Lança erro para abortar a transação
                throw new Error('Sequência pausada não encontrada ou não pertence a este workspace.');
            }
            if (!followUp.workspace) {
                 console.error(`API Resume: Workspace data missing for FollowUp ${followUpId}.`);
                 throw new Error('Dados do workspace ausentes.');
            }

             const currentOrder = followUp.current_sequence_step_order ?? 0;
             const rules = followUp.workspace.ai_follow_up_rules;
             const nextRule = rules[currentOrder]; // Próximo passo é o índice da *última ordem enviada* (pois order é 0-based)

            if (!nextRule) {
                console.log(`API Resume: FollowUp ${followUpId} já estava no fim da sequência. Marcando como COMPLETED.`);
                 // Se não há próximo passo, marca como completo ao retomar
                 await tx.followUp.update({
                     where: { id: followUpId },
                     data: { status: PrismaFollowUpStatus.COMPLETED, next_sequence_message_at: null }
                 });
                 return { status: 'completed' };
            }

            // 2. Calcular próximo envio e agendar job
            const nextDelayMs = Number(nextRule.delay_milliseconds);
            if (isNaN(nextDelayMs) || nextDelayMs < 0) {
                 console.warn(`API Resume: Delay da próxima regra ${nextRule.id} é inválido (${nextDelayMs}ms). Não será reagendado, mas status será ACTIVE.`);
                  // Apenas reativa, mas não agenda
                  await tx.followUp.update({
                     where: { id: followUpId },
                     data: { status: PrismaFollowUpStatus.ACTIVE, next_sequence_message_at: null }
                  });
                  return { status: 'reactivated_no_schedule' };
            }

            const nextMessageTime = new Date(Date.now() + nextDelayMs);

            // 3. Atualizar FollowUp
            await tx.followUp.update({
                where: { id: followUpId },
                data: {
                    status: PrismaFollowUpStatus.ACTIVE,
                    next_sequence_message_at: nextMessageTime,
                    // current_sequence_step_order não muda aqui, muda no worker *após* enviar
                    updated_at: new Date(),
                }
            });

            // 4. Agendar o job usando o serviço da shared-lib
            const jobData = { followUpId: followUp.id, stepRuleId: nextRule.id, workspaceId: followUp.workspace_id };
            const jobOptions = { delay: nextDelayMs, jobId: `seq_${followUp.id}_step_${nextRule.id}`, removeOnComplete: true, removeOnFail: 5000 };
            await addSequenceStepJob(jobData, jobOptions);

             console.log(`API Resume: FollowUp ${followUpId} retomado. Próximo job (Regra ${nextRule.id}) agendado via QueueService com delay ${nextDelayMs}ms.`);
             return { status: 'resumed' };
        }); // Fim da transação

        return NextResponse.json({ success: true, message: result.status === 'completed' ? 'Sequência finalizada ao retomar.' : 'Sequência retomada.' });

    } catch (error: any) {
        console.error(`API Resume Error for ${followUpId}:`, error);
        const message = error instanceof Prisma.PrismaClientKnownRequestError ? 'Erro ao atualizar dados.' : error.message;
        return NextResponse.json({ success: false, error: message || 'Erro interno ao retomar sequência.' }, { status: 500 });
    }
}