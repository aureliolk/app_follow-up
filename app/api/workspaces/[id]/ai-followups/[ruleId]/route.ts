// app/api/workspaces/[id]/ai-followups/[ruleId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from '@/lib/permissions';
import { Prisma } from '@prisma/client';

// Schema Zod para validação da atualização
const updateRuleSchema = z.object({
  delayString: z.string().min(1, 'O tempo de inatividade é obrigatório.').optional(),
  messageContent: z.string().min(1, 'A mensagem de acompanhamento é obrigatória.').optional(),
});

// --- PUT: Atualizar uma regra específica ---
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id: workspaceId, ruleId } = await params;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = user.id;

  try {
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existingRule = await prisma.workspaceAiFollowUpRule.findUnique({
      where: { id: ruleId },
      select: { workspace_id: true }
    });

    if (!existingRule || existingRule.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Rule not found or does not belong to this workspace" }, { status: 404 });
    }

    const body = await req.json();
    const validation = updateRuleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input", details: validation.error.errors }, { status: 400 });
    }

    const dataToUpdate: Prisma.WorkspaceAiFollowUpRuleUpdateInput = {};
    const { delayString, messageContent } = validation.data;

    if (delayString !== undefined) {
      const delay_milliseconds = timeStringToMs(delayString);
      if (delay_milliseconds === null) {
        return NextResponse.json({ error: "Invalid delay format. Use format like 30s, 5m, 1h, 2d." }, { status: 400 });
      }
      if (delay_milliseconds <= 0n) {
        return NextResponse.json({ error: "Delay must be positive." }, { status: 400 });
      }
      dataToUpdate.delay_milliseconds = delay_milliseconds;
    }

    if (messageContent !== undefined) {
      dataToUpdate.message_content = messageContent;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: "No fields provided for update" }, { status: 400 });
    }

    const updatedRule = await prisma.workspaceAiFollowUpRule.update({
      where: { id: ruleId },
      data: dataToUpdate,
      select: {
        id: true,
        delay_milliseconds: true,
        message_content: true,
        created_at: true,
        updated_at: true,
      }
    });

    const ruleToReturn = {
      ...updatedRule,
      delay_milliseconds: updatedRule.delay_milliseconds.toString(),
    };

    return NextResponse.json(ruleToReturn);

  } catch (error) {
    console.error(`Error updating AI follow-up rule ${ruleId} for workspace ${workspaceId}:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// --- DELETE: Excluir uma regra específica ---
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const { id: workspaceId, ruleId } = await params;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = user.id;

  try {
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existingRule = await prisma.workspaceAiFollowUpRule.findUnique({
      where: { id: ruleId },
      select: { workspace_id: true }
    });

    if (!existingRule || existingRule.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Rule not found or does not belong to this workspace" }, { status: 404 });
    }

    await prisma.workspaceAiFollowUpRule.delete({
      where: { id: ruleId },
    });

    return NextResponse.json({ message: "Rule deleted successfully" }, { status: 200 });

  } catch (error) {
    console.error(`Error deleting AI follow-up rule ${ruleId} for workspace ${workspaceId}:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function timeStringToMs(timeString: string): bigint | null {
  const match = timeString.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  
  let value: bigint;
  try {
    value = BigInt(match[1]); 
  } catch (e) {
    console.error("Falha ao converter valor para BigInt:", match[1], e);
    return null;
  }

  const unit = match[2];
  let multiplier: bigint;

  switch (unit) {
    case 's': 
      multiplier = 1000n;
      break;
    case 'm': 
      multiplier = 60n * 1000n;
      break;
    case 'h': 
      multiplier = 60n * 60n * 1000n;
      break;
    case 'd': 
      multiplier = 24n * 60n * 60n * 1000n;
      break;
    default: 
      return null; 
  }

  try {
    return value * multiplier;
  } catch (e) {
    console.error("Erro na multiplicação de BigInt:", value, multiplier, e);
    return null;
  }
}