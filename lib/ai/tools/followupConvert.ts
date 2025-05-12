import { setConversationAIStatus } from "@/lib/actions/conversationActions";
import { prisma } from "@/lib/db";
import { markFollowUpConverted } from "@/lib/services/followUpService";
import { FollowUpStatus } from "@prisma/client";

export const followupConvert = async (workspaceId: string, conversationId: string) => {
     // Pausar IA após agendamento e Converter Follow-up se existir
     try {
        console.log(`[scheduleCalendarEventTool] Evento agendado com sucesso. Pausando IA para ConvID: ${conversationId} no WksID: ${workspaceId}...`);
        const aiStatusUpdated = await setConversationAIStatus(conversationId, false, workspaceId);
        if (aiStatusUpdated) {
          console.log(`[scheduleCalendarEventTool] IA pausada com sucesso para ${conversationId}.`);
        } else {
          console.warn(`[scheduleCalendarEventTool] Ação setConversationAIStatus retornou falha (pode ser ID inválido?) para ${conversationId}.`);
          // Não vamos falhar o agendamento por causa disso, mas logamos.
        }
      } catch (statusError) {
        console.error(`[scheduleCalendarEventTool] Erro ao tentar pausar IA para ${conversationId} após agendamento:`, statusError);
        // Não falhar o retorno do agendamento, apenas logar o erro da pausa.
      }

      // Buscar detalhes da conversa primeiro
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { 
          client_id: true, 
          workspace_id: true,
          followUp: {
            select: { 
              id: true,
              status: true
            }
          }
        }
      });

      if (!conversation) {
        console.warn(`[scheduleCalendarEventTool] Conversa ${conversationId} não encontrada.`);
      } else {
        // Verificar se a conversa tem um followup diretamente associado
        if (conversation.followUp) {
          if (conversation.followUp.status === FollowUpStatus.ACTIVE || conversation.followUp.status === FollowUpStatus.PAUSED) {
            console.log(`[scheduleCalendarEventTool] Conversa ${conversationId} tem followup (ID: ${conversation.followUp.id}) associado diretamente. Marcando como CONVERTED.`);
            
            const convertResult = await markFollowUpConverted(conversation.followUp.id);
            
            if (convertResult) {
              console.log(`[scheduleCalendarEventTool] Follow-up ${conversation.followUp.id} marcado como convertido com sucesso após agendamento de evento.`);
            } else {
              console.warn(`[scheduleCalendarEventTool] Não foi possível marcar follow-up ${conversation.followUp.id} como convertido (pode já estar em outro estado).`);
            }
          } else {
            console.log(`[scheduleCalendarEventTool] Conversa ${conversationId} tem followup (ID: ${conversation.followUp.id}), mas já está com status ${conversation.followUp.status}.`);
          }
        } else {
          console.log(`[scheduleCalendarEventTool] Conversa ${conversationId} não tem followup associado.`);
        }
      }
}