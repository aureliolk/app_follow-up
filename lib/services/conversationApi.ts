import axios from 'axios';
import type { ClientConversation, Message } from '@/app/types';

export async function fetchConversationsApi(
  filter: string,
  workspaceId: string,
  page: number,
  pageSize: number,
  aiStatus?: string,
  searchTerm?: string,
): Promise<{ data: ClientConversation[]; hasMore: boolean; counts?: { all: number; ai: number; human: number } }> {
  const response = await axios.get<{ success: boolean; data?: ClientConversation[]; error?: string; hasMore?: boolean; counts?: { all: number; ai: number; human: number } }>('/api/conversations', {
    params: { workspaceId, status: filter, page, pageSize, aiStatus, searchTerm },
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Falha ao carregar conversas');
  }
  return { data: response.data.data, hasMore: Boolean(response.data.hasMore), counts: response.data.counts };
}

export async function fetchConversationMessagesApi(
  conversationId: string,
  offset: number,
  limit: number,
): Promise<{ data: Message[]; hasMore: boolean }> {
  const response = await axios.get<{ success: boolean; data?: Message[]; error?: string; hasMore?: boolean }>(
    `/api/conversations/${conversationId}/messages`,
    { params: { offset, limit } },
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Falha ao carregar mensagens');
  }
  const sorted = response.data.data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return { data: sorted, hasMore: Boolean(response.data.hasMore) };
}
