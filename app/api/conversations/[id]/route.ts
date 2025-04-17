import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from '@/lib/permissions';
import type { ClientConversation } from "@/app/types";
import { ConversationStatus, FollowUpStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>; // Next.js 15+ params são Promises
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = user.id;

    const { id: conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const includeFollowUp = searchParams.get('includeFollowUp') === 'true';

    console.log(`GET /api/conversations/${conversationId}: Request received (Workspace ID: ${workspaceId}, User ID: ${userId}, IncludeFollowUp: ${includeFollowUp})`);

    if (!workspaceId) {
      console.warn(`GET /api/conversations/${conversationId}: Bad Request (missing workspaceId)`);
      return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: userId,
        },
      },
      select: { id: true },
    });

    if (!member) {
      console.warn(`GET /api/conversations/${conversationId}: Forbidden (user ${userId} is not member for workspace ${workspaceId})`);
      return NextResponse.json({ success: false, error: 'Acesso negado a este workspace' }, { status: 403 });
    }
    console.log(`GET /api/conversations/${conversationId}: User ${userId} has access (Member: ${!!member}).`);

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        workspace_id: workspaceId,
      },
      include: {
        client: true,
      },
    });

    if (!conversation) {
      console.warn(`GET /api/conversations/${conversationId}: Not Found (in workspace ${workspaceId})`);
      return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
    }
    console.log(`GET /api/conversations/${conversationId}: Conversation found.`);

    let activeFollowUp = null;
    if (includeFollowUp && conversation.client_id) {
      console.log(`GET /api/conversations/${conversationId}: Fetching active follow-up for client ${conversation.client_id}...`);
      activeFollowUp = await prisma.followUp.findFirst({
        where: {
          client_id: conversation.client_id,
          workspace_id: workspaceId,
          status: FollowUpStatus.ACTIVE,
        },
        orderBy: {
          started_at: 'desc',
        },
        select: {
            id: true,
            status: true,
        }
      });
      if (activeFollowUp) {
         console.log(`GET /api/conversations/${conversationId}: Active follow-up found (ID: ${activeFollowUp.id})`);
      } else {
         console.log(`GET /api/conversations/${conversationId}: No active follow-up found.`);
      }
    }

    const responseData = {
      ...conversation,
      activeFollowUp: activeFollowUp,
    };

    return NextResponse.json({ success: true, data: responseData }, { status: 200 });

  } catch (error) {
    console.error(`GET /api/conversations/[id]: Error fetching conversation:`, error);
    if (error instanceof Prisma.PrismaClientValidationError) {
         return NextResponse.json({ success: false, error: 'Erro nos dados da requisição.' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}

const conversationPatchSchema = z.object({
  is_ai_active: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = user.id;

    const conversationId = params.id;
    const body = await req.json();
    console.log(`PATCH /api/conversations/${conversationId}: Request body:`, body);

    const validation = conversationPatchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { is_ai_active } = validation.data;

    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { workspace_id: true }
    });

    if (!conversation) {
         return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
    }
    const workspaceId = conversation.workspace_id;

    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        is_ai_active: is_ai_active,
      },
      include: {
          client: { 
              select: { id: true, name: true, phone_number: true, metadata: true }
          },
          messages: { 
              select: { id: true, content: true, timestamp: true, sender_type: true },
              orderBy: { timestamp: 'desc' },
              take: 1
          }
      }
    });

    console.log(`PATCH /api/conversations/${conversationId}: Status da IA atualizado para ${is_ai_active}.`);
    return NextResponse.json({ success: true, data: updatedConversation });

  } catch (error) {
    console.error(`PATCH /api/conversations/[id]: Error updating conversation:`, error);
    return NextResponse.json({ success: false, error: 'Erro interno ao atualizar conversa' }, { status: 500 });
  }
} 