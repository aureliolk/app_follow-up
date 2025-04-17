// apps/next-app/app/api/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from '@/lib/permissions';
import type { ClientConversation } from "@/app/types";
import { FollowUpStatus as PrismaFollowUpStatus, ConversationStatus, Prisma } from '@prisma/client'; // Importar Enum e Prisma

// Função auxiliar para mapear status da UI para status do Prisma
const mapUiStatusToPrisma = (uiStatus: string): PrismaFollowUpStatus[] => {
  switch (uiStatus?.toUpperCase()) {
    case 'ATIVAS':
      return [PrismaFollowUpStatus.ACTIVE, PrismaFollowUpStatus.PAUSED];
    case 'CONVERTIDAS':
      return [PrismaFollowUpStatus.CONVERTED];
    case 'CANCELADAS':
      return [PrismaFollowUpStatus.CANCELLED];
    case 'COMPLETAS': // Caso queira ver as que terminaram naturalmente
      return [PrismaFollowUpStatus.COMPLETED];
    // Adicione outros mapeamentos se necessário
    default: // Se nenhum filtro ou filtro inválido, retorna Ativas/Pausadas
      return [PrismaFollowUpStatus.ACTIVE, PrismaFollowUpStatus.PAUSED];
  }
}

export async function GET(req: NextRequest) {
  console.log("API GET /api/conversations: Request received.");
  try {
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = user.id;

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const filterStatus = url.searchParams.get('status') || 'ATIVAS'; // Padrão para ATIVAS se não especificado

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
    }
    console.log(`API GET Conversations: Fetching for workspaceId: ${workspaceId}, FilterStatus: ${filterStatus}`);

    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    // Mapeia o status do filtro da UI para os status do Prisma Enum
    const prismaStatusesToFilter = mapUiStatusToPrisma(filterStatus);
    console.log(`API GET Conversations: Filtering by Prisma FollowUp Statuses: ${prismaStatusesToFilter.join(', ')}`);

    console.log(`API GET Conversations: Filtering based on Conversation status: ACTIVE`);

    // --- QUERY: Incluir client.metadata --- 
    const conversations = await prisma.conversation.findMany({
      where: {
        workspace_id: workspaceId,
        status: ConversationStatus.ACTIVE 
      },
      include: {
        client: {
          select: { 
            id: true, 
            name: true, 
            phone_number: true,
            metadata: true,
            follow_ups: { 
              where: {
                status: { 
                  in: [PrismaFollowUpStatus.ACTIVE, PrismaFollowUpStatus.PAUSED] 
                },
              },
              orderBy: { started_at: 'desc' },
              take: 1
            }
          }
        },
        messages: {
          select: { id: true, content: true, timestamp: true, sender_type: true }, // Incluir ID da msg
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        last_message_at: { sort: 'desc', nulls: 'last' },
      },
    });

    // Formatação da resposta: Incluir metadata no client
    const formattedData: ClientConversation[] = conversations.map(convo => ({
      id: convo.id,
      workspace_id: convo.workspace_id,
      client_id: convo.client_id,
      channel: convo.channel,
      channel_conversation_id: convo.channel_conversation_id,
      status: convo.status, // Status da CONVERSA
      is_ai_active: convo.is_ai_active,
      last_message_at: convo.last_message_at,
      created_at: convo.created_at,
      updated_at: convo.updated_at,
      metadata: convo.metadata,
      client: convo.client ? { 
        id: convo.client.id,
        name: convo.client.name,
        phone_number: convo.client.phone_number,
        metadata: convo.client.metadata,
      } : null,
      last_message: convo.messages[0] ? {
        id: convo.messages[0].id, // Adicionar ID
        content: convo.messages[0].content,
        timestamp: convo.messages[0].timestamp.toISOString(), // Converter para string ISO
        sender_type: convo.messages[0].sender_type,
      } : null,
      activeFollowUp: convo.client?.follow_ups?.[0] || null, 
    }));

    console.log(`API GET Conversations: Found ${formattedData.length} conversations with status ACTIVE.`);
    return NextResponse.json({ success: true, data: formattedData });

  } catch (error) {
    console.error('API GET Conversations: Internal error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar conversas' }, { status: 500 });
  }
}