// app/api/follow-up/campaigns/route.ts
import { type NextRequest, NextResponse } from "next/server"
import supabase from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    // Buscar todas as campanhas
    const { data: campaigns, error } = await supabase
      .from("follow_up_campaigns")
      .select("id, name, description, active, steps")
      .order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    // Para cada campanha, contar os passos e follow-ups ativos
    const campaignsWithCounts = await Promise.all(
      campaigns.map(async (campaign) => {
        // Contar passos
        let stepsCount = 0
        if (campaign.steps) {
          try {
            const steps = JSON.parse(campaign.steps as string)
            stepsCount = Array.isArray(steps) ? steps.length : 0
          } catch (e) {
            console.error(`Erro ao analisar steps da campanha ${campaign.id}:`, e)
            stepsCount = 0
          }
        }

        // Contar follow-ups ativos
        const { count: activeFollowUps, error: countError } = await supabase
          .from("follow_ups")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .in("status", ["active", "paused"])

        if (countError) {
          console.error(`Erro ao contar follow-ups ativos para campanha ${campaign.id}:`, countError)
        }

        return {
          ...campaign,
          stepsCount,
          activeFollowUps: activeFollowUps || 0,
        }
      }),
    )

    return NextResponse.json({
      success: true,
      data: campaignsWithCounts,
    })
  } catch (error) {
    console.error("Erro ao buscar campanhas:", error)
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
    const { name, description, steps } = body

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Nome da campanha é obrigatório",
        },
        { status: 400 },
      )
    }

    // Preparar os dados para inserção
    const campaignData: any = {
      name,
      description: description || "",
      active: true,
    }

    // Se steps for fornecido, serializá-lo
    if (steps) {
      try {
        if (Array.isArray(steps)) {
          campaignData.steps = JSON.stringify(steps)
        } else if (typeof steps === "string") {
          // Verificar se a string é um JSON válido
          JSON.parse(steps) // Isso vai lançar erro se não for válido
          campaignData.steps = steps
        } else if (typeof steps === "object") {
          campaignData.steps = JSON.stringify(steps)
        } else {
          campaignData.steps = "[]"
        }
      } catch (err) {
        console.error("Erro ao processar steps:", err)
        campaignData.steps = "[]"
      }
    } else {
      campaignData.steps = "[]"
    }

    // Criar a campanha
    const { data: campaign, error } = await supabase.from("follow_up_campaigns").insert(campaignData).select().single()

    if (error) {
      throw error
    }

    // Retornar a campanha criada com contagens
    return NextResponse.json({
      success: true,
      message: "Campanha criada com sucesso",
      data: {
        ...campaign,
        stepsCount: steps ? (Array.isArray(steps) ? steps.length : 0) : 0,
        activeFollowUps: 0,
      },
    })
  } catch (error) {
    console.error("Erro ao criar campanha:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

