// apps/next-app/app/api/follow-up/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@meuprojeto/shared-lib/src/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@meuprojeto/shared-lib/src/auth/auth-options';
import { checkPermission } from '@meuprojeto/shared-lib/src/permissions';
// Usando uma importação dinâmica para o sequenceStepQueue já que é difícil acessar entre apps
// Alternativamente, mova essa lógica para uma função no shared-lib
import { Queue } from 'bullmq';
const sequenceStepQueue = new Queue('sequence-step', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  }
});
// Importe Prisma e o Enum se você o definiu no schema
import { FollowUpStatus, Prisma } from '@prisma/client';

// Esquema de validação para o corpo da requisição
const startFollowUpSchema = z.object({
  clientId: z.string().uuid("ID do Cliente inválido"),
  workspaceId: z.string().uuid("ID do Workspace inválido"),
  // conversationId: z.string().uuid("ID da Conversa inválido").optional(), // Ainda opcional
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

    // 3. Verificar Permissão
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
    if (!hasPermission) {
      console.warn(`API POST /api/follow-up: Permission Denied for User ${userId} on Workspace ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'Permissão negada para iniciar sequência neste workspace' }, { status: 403 });
    }

    // 4. Verificar se já existe um FollowUp ATIVO para este cliente neste workspace
    const existingActiveFollowUp = await prisma.followUp.findFirst({
        where: {
            client_id: clientId,
            workspace_id: workspaceId, // Filtrar por ID direto aqui é OK
            status: 'ACTIVE' // Use String se não criou o Enum
            // status: FollowUpStatus.ACTIVE // Use Enum se criou
        }
    });

    if (existingActiveFollowUp) {
        console.warn(`API POST /api/follow-up: Active sequence already exists for Client ${clientId} (FollowUp ID: ${existingActiveFollowUp.id})`);
        return NextResponse.json({ success: false, error: 'Já existe uma sequência ativa para este cliente.' }, { status: 409 }); // Conflict
    }

    // 5. Buscar a primeira regra da sequência para este workspace
    const firstRule = await prisma.workspaceAiFollowUpRule.findFirst({
        where: { workspace_id: workspaceId },
        orderBy: { created_at: 'asc' },
        select: { id: true, delay_milliseconds: true }
    });

    if (!firstRule) {
        console.warn(`API POST /api/follow-up: No sequence rules found for Workspace ${workspaceId}. Cannot start sequence.`);
        return NextResponse.json({ success: false, error: 'Nenhuma regra de sequência configurada para este workspace.' }, { status: 404 });
    }
    console.log(`API POST /api/follow-up: First rule found: ID=${firstRule.id}, Delay=${firstRule.delay_milliseconds}ms`);

    // 6. Criar o registro FollowUp - CORRIGIDO
    const delayMs = Number(firstRule.delay_milliseconds);
    const nextMessageTime = new Date(Date.now() + delayMs);

    const newFollowUp = await prisma.followUp.create({
        data: {
            // Conecte TODAS as relações obrigatórias
            client: {
                connect: { id: clientId }
            },
            workspace: {
                connect: { id: workspaceId }
            },
             // Se 'campaign' ainda for obrigatória no seu schema atual, adicione:
             // campaign: {
             //     connect: { id: campaignId } // Você precisaria receber campaignId no body
             // },
             // Se 'campaign' for OPCIONAL (como fizemos antes), não precisa incluir aqui.

            // Campos escalares restantes
            status: 'ACTIVE', // Use String se não criou o Enum
            // status: FollowUpStatus.ACTIVE, // Use Enum se criou
            next_sequence_message_at: nextMessageTime,
            current_sequence_step_order: 1, // Ou 0 se preferir indicar que o *primeiro* passo ainda não foi *enviado*
        },
        select: { id: true } // Só precisamos do ID para o job
    });
    console.log(`API POST /api/follow-up: FollowUp record created: ID=${newFollowUp.id}`);

    // 7. Agendar o primeiro job na fila da sequência
    const jobData = {
      followUpId: newFollowUp.id,
      stepRuleId: firstRule.id,
      workspaceId: workspaceId,
    };
    const jobOptions = {
        delay: delayMs,
        jobId: `seq_${newFollowUp.id}_step_${firstRule.id}`,
        removeOnComplete: true,
        removeOnFail: 5000,
    };

    await sequenceStepQueue.add('processSequenceStep', jobData, jobOptions);
    console.log(`API POST /api/follow-up: First sequence job added to queue for FollowUp ${newFollowUp.id}, Rule ${firstRule.id} with delay ${delayMs}ms`);

    // 8. Retornar Sucesso
    return NextResponse.json({ success: true, data: { followUpId: newFollowUp.id } }, { status: 201 });

  } catch (error: any) {
      // Log detalhado para erros Prisma
      if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientValidationError) {
          console.error(`API POST /api/follow-up: Prisma Error (${error || 'Validation'}):`, error.message);
          if ((error as any).meta) {
              console.error("Meta:", (error as any).meta);
          }
      } else {
           console.error('API POST /api/follow-up: Internal Server Error:', error);
      }
      // Mensagem de erro genérica para o cliente
      const clientErrorMessage = error instanceof Prisma.PrismaClientValidationError
            ? 'Erro de validação ao criar sequência.' // Mensagem específica para validação
            : 'Erro interno do servidor ao iniciar sequência.';
      return NextResponse.json({ success: false, error: clientErrorMessage }, { status: 500 });
  }
}