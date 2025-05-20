// apps/next-app/app/api/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
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
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) { /* ... */ }
    const userId = session.user.id;

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const filterStatus = url.searchParams.get('status') || 'ATIVAS'; // Padrão para ATIVAS se não especificado
    const aiStatus = url.searchParams.get('aiStatus') || 'all';
    const search = url.searchParams.get('search')?.trim() || '';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

    if (!workspaceId) { /* ... */ }

    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) { /* ... */ }

    // Mapeia o status do filtro da UI para os status do Prisma Enum
    const prismaStatusesToFilter = mapUiStatusToPrisma(filterStatus);

    const take = pageSize + 1;
    const skip = (page - 1) * pageSize;

    let aiFilter: boolean | undefined;
    if (aiStatus === 'human') aiFilter = false;
    if (aiStatus === 'ai') aiFilter = true;

    const clientFilters: Prisma.ClientWhereInput = {
      follow_ups: { some: { status: { in: prismaStatusesToFilter } } },
    };

    if (search) {
      clientFilters.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone_number: { contains: search, mode: 'insensitive' } },
        { metadata: { path: ['tags'], array_contains: [search] } },
      ];
    }

    const whereClause: Prisma.ConversationWhereInput = {
      workspace_id: workspaceId,
      status: ConversationStatus.ACTIVE,
      ...(aiFilter !== undefined ? { is_ai_active: aiFilter } : {}),
      client: { is: clientFilters },
    };

    // --- Counts para filtros de IA/humano ---
    const [totalCount, aiCount, humanCount] = await prisma.$transaction([
      prisma.conversation.count({
        where: { workspace_id: workspaceId, status: ConversationStatus.ACTIVE },
      }),
      prisma.conversation.count({
        where: { workspace_id: workspaceId, status: ConversationStatus.ACTIVE, is_ai_active: true },
      }),
      prisma.conversation.count({
        where: { workspace_id: workspaceId, status: ConversationStatus.ACTIVE, is_ai_active: false },
      }),
    ]);

    // --- QUERY: Incluir client.metadata ---
    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true, 
            name: true, 
            phone_number: true,
            metadata: true,
            follow_ups: { 
              select: {
                id: true,
                status: true,
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
      take,
      skip,
    });

    // Formatação da resposta: Incluir metadata no client
    const hasMore = conversations.length > pageSize;
    const convosSlice = hasMore ? conversations.slice(0, pageSize) : conversations;

    const formattedData = convosSlice.map(convo => ({
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

    const counts = { all: totalCount, ai: aiCount, human: humanCount };

    return NextResponse.json({ success: true, data: formattedData, hasMore, counts });

  } catch (error) {
    console.error('API GET Conversations: Internal error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar conversas' }, { status: 500 });
  }
}
