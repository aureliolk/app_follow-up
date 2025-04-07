// apps/next-app/app/api/follow-up/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
// Importe Prisma e o Enum se você o definiu no schema
import { FollowUpStatus, Prisma } from '@prisma/client';
import { FollowUpStatus as PrismaFollowUpStatus } from '@prisma/client'; // Importar Enum para validação

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

    // Lógica para buscar firstRule foi feita acima

    // Se firstRule existe, era aqui que o job BullMQ era agendado.
    // Removido pois usaremos Trigger.dev

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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get('workspaceId');
  const statusParam = searchParams.get('status'); // Pode ser 'active', 'completed', etc.

  if (!workspaceId) {
    return NextResponse.json({ success: false, error: 'Workspace ID é obrigatório' }, { status: 400 });
  }

  try {
    // Construir o filtro Prisma dinamicamente
    const whereClause: any = {
      workspace_id: workspaceId,
    };

    // Validar e adicionar status ao filtro se fornecido
    if (statusParam) {
        // Converte o parâmetro de string para o tipo Enum esperado (case-insensitive)
        const statusEnumValue = Object.values(PrismaFollowUpStatus).find(
            enumValue => enumValue.toLowerCase() === statusParam.toLowerCase()
        );

        if (statusEnumValue) {
             // Use o valor do Enum correspondente na query Prisma
             // Como o status no seu schema é uma string, comparamos a string
             // Se fosse um Enum no schema, usaríamos: whereClause.status = statusEnumValue;
             whereClause.status = statusEnumValue; // Assume que status no DB é uma string que casa com o Enum
        } else {
            console.warn(`[API /api/follow-up GET] Status inválido recebido: ${statusParam}. Ignorando filtro de status.`);
            // Não adiciona filtro de status se for inválido
            // Poderia retornar um erro 400 se preferir ser mais estrito:
            // return NextResponse.json({ success: false, error: `Status inválido: ${statusParam}` }, { status: 400 });
        }
    }


    console.log(`[API /api/follow-up GET] Buscando FollowUps com filtro:`, whereClause);

    // Buscar os follow-ups no banco de dados
    const followUps = await prisma.followUp.findMany({
      where: whereClause,
      orderBy: {
        started_at: 'desc', // Ou outro campo de ordenação relevante
      },
      // Você pode incluir relações se precisar dos dados no frontend
      // include: {
      //   client: { select: { id: true, name: true, phone_number: true } }
      // }
    });

    console.log(`[API /api/follow-up GET] Encontrados ${followUps.length} follow-ups.`);

    return NextResponse.json({ success: true, data: followUps });

  } catch (error) {
    console.error('[API /api/follow-up GET] Erro ao buscar follow-ups:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ success: false, error: `Erro interno do servidor: ${errorMessage}` }, { status: 500 });
  }
}