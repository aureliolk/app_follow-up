// apps/next-app/app/api/follow-up/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../packages/shared-lib/src/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '../../../../../packages/shared-lib/src/permissions';
import { sequenceStepQueue } from '../../../../../apps/workers/src/queues/sequenceStepQueue'; // <-- Importa a fila correta
import { FollowUpStatus } from '@prisma/client'; // <-- Importe o Enum se você o criou

// Esquema de validação para o corpo da requisição
const startFollowUpSchema = z.object({
  clientId: z.string().uuid("ID do Cliente inválido"),
  // campaignId: z.string().uuid("ID da Campanha inválido"), // Removido, pegamos as regras do workspace
  workspaceId: z.string().uuid("ID do Workspace inválido"),
  // conversationId: z.string().uuid("ID da Conversa inválido").optional(), // Opcional, pode ser útil para logs
});

export async function POST(req: NextRequest) {
  console.log("API POST /api/follow-up: Request received - Start Sequence");
  try {
    // 1. Autenticação e Autorização
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Validar Corpo da Requisição
    const body = await req.json();
    const validation = startFollowUpSchema.safeParse(body);
    if (!validation.success) {
      console.error("API POST /api/follow-up: Validation Error:", validation.error.errors);
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { clientId, workspaceId } = validation.data;
    console.log(`API POST /api/follow-up: Attempting to start for Client ${clientId} in Workspace ${workspaceId}`);

    // 3. Verificar Permissão (Ex: MEMBER pode iniciar?)
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
    if (!hasPermission) {
      console.warn(`API POST /api/follow-up: Permission Denied for User ${userId} on Workspace ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'Permissão negada para iniciar sequência neste workspace' }, { status: 403 });
    }

    // 4. Verificar se já existe um FollowUp ATIVO para este cliente neste workspace
    //    (Evitar múltiplas sequências ativas simultaneamente para o mesmo cliente)
    const existingActiveFollowUp = await prisma.followUp.findFirst({
      where: {
        client_id: clientId,
        workspace: { id: workspaceId }, // Garante que é do workspace correto
        status: FollowUpStatus.ACTIVE // Usar o Enum FollowUpStatus.ACTIVE se existir
      }
    });

    if (existingActiveFollowUp) {
      console.warn(`API POST /api/follow-up: Active sequence already exists for Client ${clientId} (FollowUp ID: ${existingActiveFollowUp.id})`);
      return NextResponse.json({ success: false, error: 'Já existe uma sequência ativa para este cliente.' }, { status: 409 }); // Conflict
    }

    // 5. Buscar a primeira regra da sequência para este workspace
    const firstRule = await prisma.workspaceAiFollowUpRule.findFirst({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: 'asc' }, // Garante que pega a primeira criada
      select: { id: true, delay_milliseconds: true }
    });

    if (!firstRule) {
      console.warn(`API POST /api/follow-up: No sequence rules found for Workspace ${workspaceId}. Cannot start sequence.`);
      return NextResponse.json({ success: false, error: 'Nenhuma regra de sequência configurada para este workspace.' }, { status: 404 });
    }
    console.log(`API POST /api/follow-up: First rule found: ID=${firstRule.id}, Delay=${firstRule.delay_milliseconds}ms`);

    // 6. Criar o registro FollowUp
    const delayMs = Number(firstRule.delay_milliseconds); // Converter BigInt para Number
    const nextMessageTime = new Date(Date.now() + delayMs);

    const newFollowUp = await prisma.followUp.create({
      data: {
          client_id: clientId, // Chave estrangeira direta OK (relação Client->FollowUp)
          workspace: {         // Use a sintaxe de conexão para Workspace
              connect: { id: workspaceId }
          },
          // REMOVA a linha: workspace_id: workspaceId,
          status: FollowUpStatus.ACTIVE, // Ou 'ACTIVE'
          next_sequence_message_at: nextMessageTime,
          current_sequence_step_order: 1,
      },
      select: { id: true }
  });
  console.log(`API POST /api/follow-up: FollowUp record created: ID=${newFollowUp.id}`);

    // 7. Agendar o primeiro job na fila da sequência
    const jobData = {
      followUpId: newFollowUp.id,
      stepRuleId: firstRule.id, // ID da regra específica
      // Passar workspaceId pode ser útil no worker, embora ele possa buscar pelo followUpId
      workspaceId: workspaceId,
    };
    const jobOptions = {
      delay: delayMs, // Delay em milissegundos
      jobId: `seq_${newFollowUp.id}_step_${firstRule.id}`, // ID único para o job (opcional)
      removeOnComplete: true,
      removeOnFail: 5000,
    };

    await sequenceStepQueue.add('processSequenceStep', jobData, jobOptions);
    console.log(`API POST /api/follow-up: First sequence job added to queue for FollowUp ${newFollowUp.id}, Rule ${firstRule.id} with delay ${delayMs}ms`);

    // 8. Retornar Sucesso
    return NextResponse.json({ success: true, data: { followUpId: newFollowUp.id } }, { status: 201 }); // 201 Created

  } catch (error: any) {
    console.error('API POST /api/follow-up: Internal Server Error:', error);
    // Tratar erros específicos do Prisma (ex: FK não encontrada) se necessário
    return NextResponse.json({ success: false, error: 'Erro interno do servidor ao iniciar sequência.' }, { status: 500 });
  }
}