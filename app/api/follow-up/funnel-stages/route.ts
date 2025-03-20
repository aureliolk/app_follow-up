import { type NextRequest, NextResponse } from "next/server"
import supabase from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const campaignId = url.searchParams.get("campaignId")

    let query = supabase
      .from("follow_up_funnel_stages")
      .select("id, name, description, order, campaign_id")
      .order("order", { ascending: true })

    // Se um ID de campanha for fornecido, filtrar por ele
    if (campaignId) {
      query = query.eq("campaign_id", campaignId)
    }

    const { data: stages, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data: stages,
    })
  } catch (error) {
    console.error("Erro ao buscar estágios do funil:", error)
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
    const { name, description, order, campaignId } = body

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Nome do estágio é obrigatório",
        },
        { status: 400 },
      )
    }

    // Determinar a ordem se não for fornecida
    let stageOrder = order

    if (!stageOrder) {
      // Buscar a maior ordem atual e incrementar
      const { data: maxOrderStage, error: maxOrderError } = await supabase
        .from("follow_up_funnel_stages")
        .select("order")
        .order("order", { ascending: false })
        .limit(1)
        .single()

      if (!maxOrderError && maxOrderStage) {
        stageOrder = (maxOrderStage.order || 0) + 1
      } else {
        stageOrder = 1 // Primeiro estágio
      }
    }

    // Criar o estágio
    const { data: stage, error } = await supabase
      .from("follow_up_funnel_stages")
      .insert({
        name,
        description: description || "",
        order: stageOrder,
        campaign_id: campaignId || null,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: "Estágio criado com sucesso",
      data: stage,
    })
  } catch (error) {
    console.error("Erro ao criar estágio do funil:", error)
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
    const body = await request.json()
    const { id, name, description, order } = body

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "ID do estágio é obrigatório",
        },
        { status: 400 },
      )
    }

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Nome do estágio é obrigatório",
        },
        { status: 400 },
      )
    }

    // Verificar se o estágio existe
    const { data: existingStage, error: checkError } = await supabase
      .from("follow_up_funnel_stages")
      .select("id")
      .eq("id", id)
      .single()

    if (checkError || !existingStage) {
      return NextResponse.json(
        {
          success: false,
          error: "Estágio não encontrado",
        },
        { status: 404 },
      )
    }

    // Atualizar o estágio
    const { data: updatedStage, error: updateError } = await supabase
      .from("follow_up_funnel_stages")
      .update({
        name,
        description: description || "",
        order: order !== undefined ? order : undefined,
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      message: "Estágio atualizado com sucesso",
      data: updatedStage,
    })
  } catch (error) {
    console.error("Erro ao atualizar estágio do funil:", error)
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
    const url = new URL(request.url)
    const id = url.searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "ID do estágio é obrigatório",
        },
        { status: 400 },
      )
    }

    // Verificar se o estágio existe
    const { data: existingStage, error: checkError } = await supabase
      .from("follow_up_funnel_stages")
      .select("id")
      .eq("id", id)
      .single()

    if (checkError || !existingStage) {
      return NextResponse.json(
        {
          success: false,
          error: "Estágio não encontrado",
        },
        { status: 404 },
      )
    }

    // Excluir o estágio
    const { error: deleteError } = await supabase.from("follow_up_funnel_stages").delete().eq("id", id)

    if (deleteError) {
      throw deleteError
    }

    return NextResponse.json({
      success: true,
      message: "Estágio excluído com sucesso",
    })
  } catch (error) {
    console.error("Erro ao excluir estágio do funil:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

