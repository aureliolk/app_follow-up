// app/api/follow-up/route.ts
import { type NextRequest, NextResponse } from "next/server"
import supabase from "@/lib/db"
import { processFollowUpSteps } from "./_lib/manager"

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const status = url.searchParams.get("status")
    const clientId = url.searchParams.get("clientId")
    const campaignId = url.searchParams.get("campaignId")

    // Construir a consulta base
    let query = supabase
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
      .order("created_at", { ascending: false })

    // Aplicar filtros se fornecidos
    if (status) {
      query = query.eq("status", status)
    }

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (campaignId) {
      query = query.eq("campaign_id", campaignId)
    }

    const { data: followUps, error } = await query

    if (error) {
      throw error
    }

    // Formatar os dados para o cliente
    const formattedFollowUps = followUps.map((followUp) => ({
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
    }))

    return NextResponse.json({
      success: true,
      data: formattedFollowUps,
    })
  } catch (error) {
    console.error("Erro ao buscar follow-ups:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId, campaignId } = body

    if (!clientId || !campaignId) {
      return NextResponse.json(
        {
          success: false,
          error: "ID do cliente e ID da campanha são obrigatórios",
        },
        { status: 400 },
      )
    }

    // Verificar se a campanha existe
    const { data: campaign, error: campaignError } = await supabase
      .from("follow_up_campaigns")
      .select("id, active")
      .eq("id", campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json(
        {
          success: false,
          error: "Campanha não encontrada",
        },
        { status: 404 },
      )
    }

    if (!campaign.active) {
      return NextResponse.json(
        {
          success: false,
          error: "Campanha não está ativa",
        },
        { status: 400 },
      )
    }

    // Verificar se já existe um follow-up ativo para este cliente e campanha
    const { data: existingFollowUp, error: existingError } = await supabase
      .from("follow_ups")
      .select("id, status")
      .eq("client_id", clientId)
      .eq("campaign_id", campaignId)
      .in("status", ["active", "paused"])
      .single()

    if (!existingError && existingFollowUp) {
      return NextResponse.json(
        {
          success: false,
          error: "Já existe um follow-up ativo para este cliente e campanha",
          followUpId: existingFollowUp.id,
        },
        { status: 409 },
      )
    }

    // Criar o follow-up
    const { data: followUp, error: createError } = await supabase
      .from("follow_ups")
      .insert({
        client_id: clientId,
        campaign_id: campaignId,
        status: "active",
        current_step: 0,
        is_responsive: false,
        next_message_at: new Date(),
      })
      .select()
      .single()

    if (createError) {
      throw createError
    }

    // Iniciar o processamento do follow-up
    setTimeout(() => {
      processFollowUpSteps(followUp.id)
    }, 1000)

    return NextResponse.json({
      success: true,
      message: "Follow-up criado com sucesso",
      data: followUp,
    })
  } catch (error) {
    console.error("Erro ao criar follow-up:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

