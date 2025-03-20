// app/api/follow-up/campaigns/[id]/route.ts
import { type NextRequest, NextResponse } from "next/server"
import supabase from "@/lib/db"

// Função auxiliar para extrair ID do URL
function extractIdFromUrl(url: string): string {
  const parts = url.split("/")
  return parts[parts.length - 1] // Pegar o último segmento da URL
}

export async function GET(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url)

  try {
    const { data: campaign, error } = await supabase
      .from("follow_up_campaigns")
      .select(`
        id, 
        name, 
        description, 
        active, 
        steps,
        stages:follow_up_funnel_stages(
          id, 
          name, 
          order, 
          description
        )
      `)
      .eq("id", id)
      .single()

    if (error || !campaign) {
      return NextResponse.json(
        {
          success: false,
          error: "Campanha não encontrada",
        },
        { status: 404 },
      )
    }

    // Ordenar os estágios por ordem
    if (campaign.stages) {
      campaign.stages.sort((a: any, b: any) => a.order - b.order)
    }

    return NextResponse.json({
      success: true,
      data: campaign,
    })
  } catch (error) {
    console.error("Erro ao buscar detalhes da campanha:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

// Endpoint para atualizar uma campanha
export async function PUT(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url)

  try {
    const body = await request.json()
    const { name, description, steps, active } = body

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Nome da campanha é obrigatório",
        },
        { status: 400 },
      )
    }

    // Verificar se a campanha existe
    const { data: existingCampaign, error: checkError } = await supabase
      .from("follow_up_campaigns")
      .select("id")
      .eq("id", id)
      .single()

    if (checkError || !existingCampaign) {
      return NextResponse.json(
        {
          success: false,
          error: "Campanha não encontrada",
        },
        { status: 404 },
      )
    }

    // Preparar os dados para atualização
    const updateData: any = {
      name,
      description,
    }

    // Se steps for fornecido, serializá-lo com validação
    if (steps !== undefined) {
      try {
        if (Array.isArray(steps) || (typeof steps === "object" && steps !== null)) {
          // Registrar o que estamos processando para debug
          console.log(`Processando steps da campanha ${id}, tipo:`, typeof steps)

          // Converter objeto/array para string JSON
          updateData.steps = JSON.stringify(steps)

          // Log após a serialização
          console.log(
            `Steps serializados para campanha ${id}:`,
            updateData.steps.substring(0, 100) + (updateData.steps.length > 100 ? "..." : ""),
          )
        } else if (typeof steps === "string") {
          // Verificar se a string é um JSON válido
          if (steps.trim() === "" || steps === "[]") {
            // String vazia ou array vazio em string, usar array vazio
            updateData.steps = "[]"
          } else {
            // Validar se é JSON válido
            JSON.parse(steps) // Isso vai lançar erro se não for válido
            updateData.steps = steps
          }
        } else {
          // Valor inválido, usar array vazio
          console.warn(`Valor de steps inválido para campanha ${id}, tipo: ${typeof steps}, usando array vazio`)
          updateData.steps = "[]"
        }
      } catch (err) {
        console.error(`Erro ao processar steps para campanha ${id}:`, err)
        console.error(
          `Conteúdo de steps: ${typeof steps === "string" ? steps.substring(0, 100) : JSON.stringify(steps).substring(0, 100)}`,
        )
        // Em caso de erro, definir como array vazio
        updateData.steps = "[]"
      }
    }

    // Se active for fornecido, atualizá-lo
    if (active !== undefined) {
      updateData.active = active
    }

    // Atualizar a campanha
    const { data: updatedCampaign, error: updateError } = await supabase
      .from("follow_up_campaigns")
      .update(updateData)
      .eq("id", id)
      .select("id, name, description, active, steps")
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      message: "Campanha atualizada com sucesso",
      data: updatedCampaign,
    })
  } catch (error) {
    console.error("Erro ao atualizar campanha:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

// Endpoint para excluir uma campanha
export async function DELETE(request: NextRequest) {
  // Obter o ID da URL usando a função auxiliar
  const id = extractIdFromUrl(request.url)

  try {
    // Verificar se a campanha existe e contar follow-ups ativos
    const { data: existingCampaign, error: checkError } = await supabase
      .from("follow_up_campaigns")
      .select("id")
      .eq("id", id)
      .single()

    if (checkError || !existingCampaign) {
      return NextResponse.json(
        {
          success: false,
          error: "Campanha não encontrada",
        },
        { status: 404 },
      )
    }

    // Verificar se há follow-ups ativos
    const { data: activeFollowUps, error: followUpsError } = await supabase
      .from("follow_ups")
      .select("id")
      .eq("campaign_id", id)
      .in("status", ["active", "paused"])

    if (!followUpsError && activeFollowUps && activeFollowUps.length > 0) {
      // Desativar follow-ups ativos antes de excluir
      await supabase
        .from("follow_ups")
        .update({
          status: "cancelled",
          completed_at: new Date(),
        })
        .eq("campaign_id", id)
        .in("status", ["active", "paused"])
    }

    // Excluir a campanha
    const { error: deleteError } = await supabase.from("follow_up_campaigns").delete().eq("id", id)

    if (deleteError) {
      throw deleteError
    }

    return NextResponse.json({
      success: true,
      message: "Campanha excluída com sucesso",
    })
  } catch (error) {
    console.error("Erro ao excluir campanha:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

