// app/api/follow-up/steps/route.ts
import { type NextRequest, NextResponse } from "next/server"
import supabase from "@/lib/db"
import { parseTimeString } from "../_lib/manager"

// Endpoint para atualizar um passo específico
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    console.log("Recebendo requisição PUT para atualizar passo (rota /steps):", body)

    // Obter os campos necessários para atualização no formato do frontend
    const { id, stage_id, stage_name, template_name, wait_time, message, category, auto_respond } = body

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "ID do passo é obrigatório",
        },
        { status: 400 },
      )
    }

    // Verificar se o passo existe
    const { data: existingStep, error: stepError } = await supabase
      .from("follow_up_steps")
      .select("*")
      .eq("id", id)
      .single()

    if (stepError || !existingStep) {
      return NextResponse.json(
        {
          success: false,
          error: "Passo não encontrado",
        },
        { status: 404 },
      )
    }

    // Mapear os campos do frontend para o formato do backend
    const updateData: any = {
      funnel_stage_id: stage_id || existingStep.funnel_stage_id,
      name: stage_name || template_name || existingStep.name,
      template_name: template_name || existingStep.template_name,
      message_content: message || existingStep.message_content,
      message_category: category || existingStep.message_category,
    }

    // Atualizar wait_time se fornecido, e recalcular wait_time_ms
    if (wait_time) {
      updateData.wait_time = wait_time
      updateData.wait_time_ms = parseTimeString(wait_time)
    }

    // Adicionar auto_respond se definido
    if (auto_respond !== undefined) {
      updateData.auto_respond = auto_respond
    }

    // Log para ajudar na depuração
    console.log("Dados mapeados para atualização do passo:", {
      id,
      ...updateData,
    })

    // Atualizar o passo
    const { data: updatedStep, error: updateError } = await supabase
      .from("follow_up_steps")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("Erro ao atualizar passo:", updateError)
      return NextResponse.json(
        {
          success: false,
          error: "Erro ao atualizar passo",
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Passo atualizado com sucesso",
      data: updatedStep,
    })
  } catch (error) {
    console.error("Erro ao atualizar passo (rota /steps):", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

// Endpoint para excluir um passo específico (redirecionamento para manter compatibilidade)
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "ID do passo é obrigatório",
        },
        { status: 400 },
      )
    }

    // Verificar se o passo existe
    const { data: existingStep, error: stepError } = await supabase
      .from("follow_up_steps")
      .select("*")
      .eq("id", id)
      .single()

    if (stepError || !existingStep) {
      return NextResponse.json(
        {
          success: false,
          error: "Passo não encontrado",
        },
        { status: 404 },
      )
    }

    // Excluir o passo
    const { error: deleteError } = await supabase.from("follow_up_steps").delete().eq("id", id)

    if (deleteError) {
      console.error("Erro ao excluir passo:", deleteError)
      return NextResponse.json(
        {
          success: false,
          error: "Erro ao excluir passo",
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Passo excluído com sucesso",
    })
  } catch (error) {
    console.error("Erro ao excluir passo:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

