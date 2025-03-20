import { type NextRequest, NextResponse } from "next/server"
import supabase from "@/lib/supabase"

// Função auxiliar para extrair ID do URL
function extractIdFromUrl(url: string): string {
  const parts = url.split("/")
  return parts[parts.length - 2] // Pegar o penúltimo segmento da URL (antes de /move-stage)
}

export async function POST(request: NextRequest) {
  try {
    // Obter o ID do follow-up da URL
    const followUpId = extractIdFromUrl(request.url)

    // Obter o ID do estágio do corpo da requisição
    const body = await request.json()
    const { stageId } = body

    if (!stageId) {
      return NextResponse.json(
        {
          success: false,
          error: "ID do estágio é obrigatório",
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

    // Verificar se o estágio existe
    const { data: stage, error: stageError } = await supabase
      .from("follow_up_funnel_stages")
      .select("id, name")
      .eq("id", stageId)
      .single()

    if (stageError || !stage) {
      return NextResponse.json(
        {
          success: false,
          error: "Estágio não encontrado",
        },
        { status: 404 },
      )
    }

    // Atualizar o follow-up com o novo estágio
    const { error: updateError } = await supabase
      .from("follow_ups")
      .update({
        current_stage_id: stageId,
        metadata: JSON.stringify({
          current_stage_name: stage.name,
          updated_at: new Date().toISOString(),
        }),
      })
      .eq("id", followUpId)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      message: `Follow-up movido para o estágio "${stage.name}" com sucesso`,
    })
  } catch (error) {
    console.error("Erro ao mover follow-up para outro estágio:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

