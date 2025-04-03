// Exemplo em app/api/follow-up/route.ts (AJUSTAR ARQUIVO/ROTA CONFORME SUA ESTRUTURA)
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../packages/shared-lib/src/db';
import { sequenceStepQueue } from '../../../../../apps/workers/src/queues/sequenceStepQueue'; // IMPORTAR A NOVA FILA
import { checkPermission } from '../../../../../packages/shared-lib/src/permissions';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../packages/shared-lib/src/auth/auth-options';

const createFollowUpSchema = z.object({
  clientId: z.string().uuid(),
  campaignId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  console.log("API POST /api/follow-up: Iniciando FollowUp..."); // Log
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const validation = createFollowUpSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }

    const { clientId, campaignId, workspaceId } = validation.data;
    const userId = session.user.id;

    console.log(`API POST /api/follow-up: Dados recebidos - Client: ${clientId}, Campaign: ${campaignId}, Workspace: ${workspaceId}`);

    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada neste workspace' }, { status: 403 });
    }

    // Opcional: Verificar FollowUp ativo existente...

    console.log(`API POST /api/follow-up: Buscando regras para Workspace ${workspaceId}`);
    const rules = await prisma.workspaceAiFollowUpRule.findMany({
        where: { workspace_id: workspaceId },
        orderBy: { created_at: 'asc' },
        select: { id: true, delay_milliseconds: true }
    });

    if (!rules || rules.length === 0) {
        console.error(`API POST /api/follow-up: Nenhuma regra encontrada para Workspace ${workspaceId}`);
        return NextResponse.json({ success: false, error: 'Nenhuma etapa de sequência encontrada para esta campanha/workspace.' }, { status: 400 });
    }
    console.log(`API POST /api/follow-up: Encontradas ${rules.length} regras.`);

    const now = new Date();
    const firstRule = rules[0];
    const firstDelayMs = Number(firstRule.delay_milliseconds);
    // Envia imediatamente se delay <= 0, senão calcula o tempo futuro
    const firstSendTime = firstDelayMs <= 0 ? now : new Date(now.getTime() + firstDelayMs);

    console.log(`API POST /api/follow-up: Criando registro FollowUp... Primeiro envio em: ${firstSendTime.toISOString()}`);
    const newFollowUp = await prisma.followUp.create({
      data: {
        client_id: clientId,
        campaign_id: campaignId, // Certifique-se que esta campanha existe e está ligada ao workspace
        status: 'ACTIVE',
        started_at: now,
        current_sequence_step_order: 0,
        next_sequence_message_at: firstSendTime,
      },
    });
    console.log(`API POST /api/follow-up: FollowUp ${newFollowUp.id} criado.`);

    if (firstRule) { // Verifica se a primeira regra existe
        const jobData = {
            followUpId: newFollowUp.id,
            stepRuleId: firstRule.id,
            // Não passamos mais workspaceId, o worker deriva
        };
        // Calcula delay para BullMQ (undefined se for para rodar agora)
        const bullmqDelay = firstDelayMs > 0 ? firstDelayMs : undefined;
        console.log(`API POST /api/follow-up: Agendando primeiro job na sequenceStepQueue para Rule ${firstRule.id} com delay ${bullmqDelay || 0}ms.`);

        await sequenceStepQueue.add('processSequenceStep', jobData, {
            delay: bullmqDelay,
            removeOnComplete: true,
            removeOnFail: 10000,
        });
        console.log(`API POST /api/follow-up: Primeiro job agendado com sucesso.`);
    } else {
         // Isso não deveria acontecer por causa da checagem anterior, mas por segurança:
         console.warn(`API POST /api/follow-up: FollowUp ${newFollowUp.id} criado, mas erro ao obter a primeira regra.`);
    }

    return NextResponse.json({ success: true, data: newFollowUp }, { status: 201 });

  } catch (error) {
    console.error('API POST /api/follow-up Error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao criar follow-up' }, { status: 500 });
  }
}