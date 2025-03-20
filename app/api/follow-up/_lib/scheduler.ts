import supabase from "@/lib/supabase"

// Função para cancelar mensagens agendadas
export async function cancelScheduledMessages(followUpId: string): Promise<void> {
  try {
    console.log(`Cancelando mensagens agendadas para follow-up ${followUpId}`)

    // Buscar todas as mensagens agendadas para este follow-up
    const { data: scheduledMessages, error } = await supabase
      .from("follow_up_scheduled_messages")
      .select("id")
      .eq("follow_up_id", followUpId)
      .eq("status", "scheduled")

    if (error) {
      throw error
    }

    if (!scheduledMessages || scheduledMessages.length === 0) {
      console.log(`Nenhuma mensagem agendada encontrada para follow-up ${followUpId}`)
      return
    }

    // Atualizar o status de todas as mensagens agendadas para "cancelled"
    const messageIds = scheduledMessages.map((msg) => msg.id)

    const { error: updateError } = await supabase
      .from("follow_up_scheduled_messages")
      .update({ status: "cancelled", cancelled_at: new Date() })
      .in("id", messageIds)

    if (updateError) {
      throw updateError
    }

    console.log(`${messageIds.length} mensagens agendadas canceladas para follow-up ${followUpId}`)
  } catch (error) {
    console.error("Erro ao cancelar mensagens agendadas:", error)
    throw error
  }
}

// Função para agendar uma mensagem
export async function scheduleMessage(
  followUpId: string,
  clientId: string,
  content: string,
  scheduledTime: Date,
  templateName?: string,
): Promise<string> {
  try {
    // Criar registro da mensagem agendada
    const { data: scheduledMessage, error } = await supabase
      .from("follow_up_scheduled_messages")
      .insert({
        follow_up_id: followUpId,
        client_id: clientId,
        content,
        template_name: templateName || "default",
        scheduled_for: scheduledTime,
        status: "scheduled",
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    console.log(`Mensagem agendada para follow-up ${followUpId}, ID: ${scheduledMessage.id}`)
    return scheduledMessage.id
  } catch (error) {
    console.error("Erro ao agendar mensagem:", error)
    throw error
  }
}

