import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/redis';

/**
 * Desativa a IA para uma conversa específica e publica um evento no Redis.
 * @param conversationId - O ID da conversa.
 * @returns {Promise<boolean>} Retorna true em sucesso, false em falha antes da publicação. Lança erro em falha no DB.
 */
export async function deactivateConversationAI(conversationId: string): Promise<boolean> {
  console.log(`[Action] Tentando desativar IA para a conversa: ${conversationId}`);
  if (!conversationId) {
    console.error('[Action|deactivateConversationAI] ID da conversa não fornecido.');
    return false; // Retorna false indicando falha antes de tentar DB/Redis
  }

  try {
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { is_ai_active: false },
      select: { id: true, is_ai_active: true } // Selecionar apenas campos necessários para confirmação
    });

    if (updatedConversation) {
      console.log(`[Action] IA desativada com sucesso no DB para a conversa: ${conversationId}`);

      // Publicar evento no Redis
      const eventPayload = {
          type: 'ai_status_updated', // Novo tipo de evento
          payload: {
              conversationId: conversationId,
              is_ai_active: false, // O novo estado (sempre false aqui)
          },
      };
      const channel = `chat-updates:${conversationId}`; // Canal específico da conversa

      try {
           await redisConnection.publish(channel, JSON.stringify(eventPayload));
           console.log(`[Action] Evento 'ai_status_updated' publicado no canal ${channel}`);
           return true; // Sucesso na operação completa (DB + Redis)
      } catch (redisError) {
           console.error(`[Action|deactivateConversationAI] Falha ao publicar evento 'ai_status_updated' para Conv ${conversationId} após update no DB:`, redisError);
           // A IA foi desativada no DB, mas o evento falhou.
           // Considerar o que fazer aqui. Por enquanto, logamos e retornamos true (DB funcionou).
           // Poderia retornar um status diferente ou lançar um erro específico de Redis.
           return true; // Indica que o DB foi atualizado, mas houve falha na notificação.
      }

    } else {
      // Isso não deveria acontecer se o ID for válido e não houver erro no Prisma
      console.warn(`[Action|deactivateConversationAI] Conversa ${conversationId} não encontrada ou não atualizada (sem erro do Prisma).`);
      return false; // Falha em encontrar/atualizar
    }
  } catch (error) {
    console.error(`[Action|deactivateConversationAI] Erro no Prisma ao desativar IA para a conversa ${conversationId}:`, error);
    // Re-lançar o erro para que o chamador (ex: a tool da IA) possa tratá-lo
    throw new Error(`Falha ao atualizar status da IA no banco de dados para a conversa ${conversationId}`);
  }
} 