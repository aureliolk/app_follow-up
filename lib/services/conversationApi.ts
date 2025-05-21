import axios from 'axios';
import type { ClientConversation, Message } from '@/app/types';

export async function fetchConversationsApi(
  filter: string,
  workspaceId: string,
  page: number,
  pageSize: number,
): Promise<{ data: ClientConversation[]; hasMore: boolean }> {
  const response = await axios.get<{ success: boolean; data?: ClientConversation[]; error?: string; hasMore?: boolean }>('/api/conversations', {
    params: { workspaceId, status: filter, page, pageSize },
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Falha ao carregar conversas');
  }
  return { data: response.data.data, hasMore: Boolean(response.data.hasMore) };
}

export async function fetchConversationMessagesApi(
  conversationId: string,
  offset: number,
  limit: number,
  orderBy?: 'asc' | 'desc'
): Promise<{ data: Message[]; hasMore: boolean }> {
  const response = await axios.get<{ success: boolean; data?: Message[]; error?: string; hasMore?: boolean }>(
    `/api/conversations/${conversationId}/messages`,
    { params: { offset, limit, orderBy } },
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Falha ao carregar mensagens');
  }
  const sorted = response.data.data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return { data: sorted, hasMore: Boolean(response.data.hasMore) };
}
