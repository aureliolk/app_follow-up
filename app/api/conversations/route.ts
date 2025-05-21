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
    case 'COMPLETAS': // Caso queira ver as que terminaram naturalmente
    // Adicione outros mapeamentos se necessário
    default: // Se nenhum filtro ou filtro inválido, retorna Ativas/Pausadas
      return [PrismaFollowUpStatus.ACTIVE, PrismaFollowUpStatus.PAUSED];
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const filterStatus = url.searchParams.get('status') || 'ATIVAS'; // Padrão para ATIVAS se não especificado
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: 'ID do workspace não fornecido' }, { status: 400 });
    }

    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Permissão negada para acessar este workspace' }, { status: 403 });
    }

    // Mapeia o status do filtro da UI para os status do Prisma Enum
    // A contagem total deve considerar apenas as conversas ATIVAS ou os status mapeados pelo filtro UI?
    // Pelo contexto anterior, parece que a contagem total deve ser para todas as conversas ATIVAS no workspace, independente do filtro de status específico da lista paginada.
    // Vamos buscar a contagem total de conversas ATIVAS, e a contagem de ATIVAS por status IA.
    
    const totalCountAll = await prisma.conversation.count({
      where: {
        workspace_id: workspaceId,
        status: ConversationStatus.ACTIVE
      }
    });

    const totalCountHuman = await prisma.conversation.count({
      where: {
        workspace_id: workspaceId,
        status: ConversationStatus.ACTIVE,
        is_ai_active: false
      }
    });

    const totalCountAi = await prisma.conversation.count({
      where: {
        workspace_id: workspaceId,
        status: ConversationStatus.ACTIVE,
        is_ai_active: true
      }
    });

    const take = pageSize + 1;
    const skip = (page - 1) * pageSize;

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
          select: { id: true, content: true, timestamp: true, sender_type: true, privates_notes: true }, // Incluir privates_notes também
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
      last_message_at: convo.last_message_at, // Já é Date ou null do Prisma
      created_at: convo.created_at.toISOString(), // Converter para string ISO
      updated_at: convo.updated_at.toISOString(), // Converter para string ISO
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
        privates_notes: convo.messages[0].privates_notes, // Incluir privates_notes
      } : null,
      activeFollowUp: convo.client?.follow_ups?.[0] || null,
    }));

    return NextResponse.json({
        success: true,
        data: formattedData,
        hasMore,
        totalCounts: {
            all: totalCountAll,
            human: totalCountHuman,
            ai: totalCountAi,
        }
    });

  } catch (error) {
    console.error('API GET Conversations: Internal error:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar conversas' }, { status: 500 });
  }
}