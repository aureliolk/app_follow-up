// app/api/workspaces/[id]/ai-followups/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/packages/shared-lib/src/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '@/packages/shared-lib/src/permissions';
import { parseDelayStringToMs } from '@/packages/shared-lib/src/timeUtils'; // Importa a função utilitária

// Schema Zod para validação da criação
const createRuleSchema = z.object({
  delayString: z.string().min(1, 'O tempo de inatividade é obrigatório.'),
  messageContent: z.string().min(1, 'A mensagem de acompanhamento é obrigatória.'),
});

// --- GET: Listar regras de acompanhamento do workspace ---
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const workspaceId = params.id;
    const userId = session.user.id;

    // Verificar permissão (VIEWER é suficiente para listar)
    const hasPermission = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });
    }

    const rules = await prisma.workspaceAiFollowUpRule.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: 'asc' }, // Ou por 'order' se adicionar
      select: {
        id: true,
        delay_milliseconds: true, // Envia BigInt (precisa ser convertido para string/number no JSON)
        message_content: true,
        created_at: true,
        updated_at: true,
      },
    });

    // Converter BigInt para String antes de retornar JSON
    const rulesWithStringDelay = rules.map(rule => ({
        ...rule,
        delay_milliseconds: rule.delay_milliseconds.toString(),
    }));


    return NextResponse.json({ success: true, data: rulesWithStringDelay });

  } catch (error) {
    console.error('GET /ai-followups Error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar regras' }, { status: 500 });
  }
}

// --- POST: Criar nova regra de acompanhamento ---
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const workspaceId = params.id;
    const userId = session.user.id;

    // Verificar permissão (ADMIN necessário para criar)
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada para criar regras' }, { status: 403 });
    }

    const body = await req.json();
    const validation = createRuleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }

    const { delayString, messageContent } = validation.data;

    // Converter delayString para milissegundos
    const delay_milliseconds = parseDelayStringToMs(delayString);
    if (delay_milliseconds === null) {
      return NextResponse.json({ success: false, error: 'Formato de tempo inválido. Use m, h, d, w (ex: 2h, 1d 30m).' }, { status: 400 });
    }

    const newRule = await prisma.workspaceAiFollowUpRule.create({
      data: {
        workspace_id: workspaceId,
        delay_milliseconds: delay_milliseconds, // Salva como BigInt
        message_content: messageContent,
        // created_by? Se quiser rastrear quem criou
      },
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
        ...newRule,
        delay_milliseconds: newRule.delay_milliseconds.toString(),
    };

    return NextResponse.json({ success: true, data: ruleToReturn }, { status: 201 });

  } catch (error) {
    console.error('POST /ai-followups Error:', error);
     if (error instanceof z.ZodError) { // Caso a validação falhe de outra forma
         return NextResponse.json({ success: false, error: 'Erro de validação', details: error.errors }, { status: 400 });
     }
    return NextResponse.json({ success: false, error: 'Erro interno ao criar regra' }, { status: 500 });
  }
}