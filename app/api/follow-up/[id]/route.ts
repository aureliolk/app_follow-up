import { type NextRequest, NextResponse } from "next/server"
import supabase from "@/lib/supabase"
import { advanceToNextStep, resumeFollowUp } from "../_lib/manager"

// Função auxiliar para extrair ID do URL
function extractIdFromUrl(url: string): string {
  const parts = url.split("/")
  return parts[parts.length - 1] // Pegar o último segmento da URL
}

export async function GET(request: NextRequest) {
  try {
    // Obter o ID do follow-up da URL
    const followUpId = extractIdFromUrl(request.url)

    // Buscar o follow-up
    const { data: followUp, error: followUpError } = await supabase
      .from("follow_ups")
      .select(`
        id, 
        client_id, 
        campaign_id, 
        status, 
        current_step, 
        current_stage_id, 
        is_responsive, 
        created_at, 
        updated_at, 
        completed_at, 
        next_message_at, 
        metadata,
        campaign:follow_up_campaigns(name),
        stage:follow_up_funnel_stages(name)
      `)
      .eq("id", followUpId)
      .single()

    if (followUpError || !followUp) {
      return NextResponse.json(
        {
          success: false,
          error: "Follow-up não encontrado",
        },
        { status: 404 },
      )
    }

    // Buscar as mensagens do follow-up
    const { data: messages, error: messagesError } = await supabase
      .from("follow_up_messages")
      .select("*")
      .eq("follow_up_id", followUpId)
      .order("sent_at", { ascending: true })

    if (messagesError) {
      throw messagesError
    }

    // Formatar os dados para o cliente
    const formattedFollowUp = {
      id: followUp.id,
      client_id: followUp.client_id,
      campaign_id: followUp.campaign_id,
      campaign_name: followUp.campaign?.name || "Campanha desconhecida",
      status: followUp.status,
      current_step: followUp.current_step,
      current_stage_id: followUp.current_stage_id,
      current_stage_name: followUp.stage?.name || "Estágio desconhecido",
      is_responsive: followUp.is_responsive,
      created_at: followUp.created_at,
      updated_at: followUp.updated_at,
      completed_at: followUp.completed_at,
      next_message_at: followUp.next_message_at,
      metadata: followUp.metadata,
      messages: messages || [],
    }

    return NextResponse.json({
      success: true,
      data: formattedFollowUp,
    })
  } catch (error) {
    console.error("Erro ao buscar detalhes do follow-up:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Obter o ID do follow-up da URL
    const followUpId = extractIdFromUrl(request.url)

    // Obter os dados do corpo da requisição
    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: "Ação é obrigatória",
        },
        { status: 400 },
      )
    }

    // Verificar se o follow-up existe
    const { data: followUp, error: followUpError } = await supabase
      .from("follow_ups")
      .select("id, status")
      .eq("id", followUpId)
      .single()

    if (followUpError || !followUp) {
      return NextResponse.json(
        {
          success: false,
          error: "Follow-up não encontrado",
        },
        { status: 404 },
      )
    }

    // Executar a ação solicitada
    switch (action) {
      case "resume":
        await resumeFollowUp(followUpId)
        return NextResponse.json({
          success: true,
          message: "Follow-up reiniciado com sucesso",
        })

      case "advance":
        await advanceToNextStep(followUpId)
        return NextResponse.json({
          success: true,
          message: "Follow-up avançado para a próxima etapa com sucesso",
        })

      case "pause":
        await supabase.from("follow_ups").update({ status: "paused" }).eq("id", followUpId)

        return NextResponse.json({
          success: true,
          message: "Follow-up pausado com sucesso",
        })

      case "cancel":
        await supabase
          .from("follow_ups")
          .update({
            status: "cancelled",
            completed_at: new Date(),
          })
          .eq("id", followUpId)

        return NextResponse.json({
          success: true,
          message: "Follow-up cancelado com sucesso",
        })

      default:
        return NextResponse.json(
          {
            success: false,
            error: "Ação desconhecida",
          },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error("Erro ao atualizar follow-up:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Obter o ID do follow-up da URL
    const followUpId = extractIdFromUrl(request.url)

    // Verificar se o follow-up existe
    const { data: followUp, error: followUpError } = await supabase
      .from("follow_ups")
      .select("id")
      .eq("id", followUpId)
      .single()

    if (followUpError || !followUp) {
      return NextResponse.json(
        {
          success: false,
          error: "Follow-up não encontrado",
        },
        { status: 404 },
      )
    }

    // Excluir o follow-up
    const { error: deleteError } = await supabase.from("follow_ups").delete().eq("id", followUpId)

    if (deleteError) {
      throw deleteError
    }

    return NextResponse.json({
      success: true,
      message: "Follow-up excluído com sucesso",
    })
  } catch (error) {
    console.error("Erro ao excluir follow-up:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

