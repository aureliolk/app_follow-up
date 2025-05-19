import axios from 'axios';
import type { ClientConversation, Message } from '@/app/types';

export async function fetchConversationsApi(filter: string, workspaceId: string): Promise<ClientConversation[]> {
  const response = await axios.get<{ success: boolean; data?: ClientConversation[]; error?: string }>('/api/conversations', {
    params: { workspaceId, status: filter },
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Falha ao carregar conversas');
  }
  return response.data.data;
}

export async function fetchConversationMessagesApi(conversationId: string): Promise<Message[]> {
  const response = await axios.get<{ success: boolean; data?: Message[]; error?: string }>(
    `/api/conversations/${conversationId}/messages`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || 'Falha ao carregar mensagens');
  }
  return response.data.data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
