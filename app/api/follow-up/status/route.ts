// app/api/follow-up/status/route.ts
import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams

    // Obter ID do follow-up ou cliente da consulta
    const followUpId = searchParams.get("id")
    const clientId = searchParams.get("clientId")

    if (!followUpId && !clientId) {
      return NextResponse.json(
        {
          success: false,
          error: "É necessário fornecer id ou clientId",
        },
        { status: 400 },
      )
    }

    let followUpData

    if (followUpId) {
      // Buscar pelo ID específico do follow-up
      followUpData = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              steps: true,
            },
          },
          messages: {
            orderBy: { sent_at: "desc" },
            take: 10, // Limitar para as 10 mensagens mais recentes
          },
        },
      })

      if (!followUpData) {
        return NextResponse.json(
          {
            success: false,
            error: "Follow-up não encontrado",
          },
          { status: 404 },
        )
      }
    } else {
      // Buscar todos os follow-ups ativos para um cliente
      followUpData = await prisma.followUp.findMany({
        where: {
          client_id: clientId as string,
        },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
            },
          },
          messages: {
            orderBy: { sent_at: "desc" },
            take: 3, // Limitar para as 3 mensagens mais recentes por follow-up
          },
        },
        orderBy: { updated_at: "desc" },
      })

      if (followUpData.length === 0) {
        return NextResponse.json({
          success: true,
          message: "Nenhum follow-up encontrado para este cliente",
          data: [],
        })
      }
    }

    // Calcular o progresso se for um follow-up específico
    let progress
    if (followUpId && followUpData && "campaign" in followUpData && followUpData.campaign.steps) {
      const steps = JSON.parse(followUpData.campaign.steps as string)
      progress = {
        currentStep: followUpData.current_step,
        totalSteps: steps.length,
        percentComplete: Math.round((followUpData.current_step / steps.length) * 100),
        nextMessageTime: followUpData.next_message_at,
      }
    }

    return NextResponse.json({
      success: true,
      data: followUpData,
      progress: progress,
    })
  } catch (error) {
    console.error("Erro ao obter status do follow-up:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}

// Endpoint para atualizar o status do follow-up (por exemplo, marcar como responsivo)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { followUpId, clientResponse, clientId } = body

    if (!followUpId && !clientId) {
      return NextResponse.json(
        {
          success: false,
          error: "É necessário fornecer followUpId ou clientId",
        },
        { status: 400 },
      )
    }

    // Construir o where com base nos parâmetros fornecidos
    const where = followUpId ? { id: followUpId } : { client_id: clientId }

    // Se temos uma resposta do cliente, marcar como responsivo
    if (clientResponse) {
      const updatedFollowUp = await prisma.followUp.update({
        where: where as any,
        data: {
          is_responsive: true,
          // Outras atualizações conforme necessário
        },
      })

      return NextResponse.json({
        success: true,
        message: "Status atualizado com sucesso",
        data: updatedFollowUp,
      })
    }

    // Se não temos uma resposta, apenas buscar o status atual
    const followUp = await prisma.followUp.findFirst({
      where: where as any,
    })

    if (!followUp) {
      return NextResponse.json(
        {
          success: false,
          error: "Follow-up não encontrado",
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      data: followUp,
    })
  } catch (error) {
    console.error("Erro ao atualizar status do follow-up:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}

