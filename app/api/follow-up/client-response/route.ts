// app/api/follow-up/client-response/route.ts
import { NextResponse } from "next/server"
import { handleClientResponse } from "../_lib/manager"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { followUpId, clientId, message } = body
    console.log("=== DADOS DA RESPOSTA DO CLIENTE ===")
    console.log("followUpId:", followUpId)
    console.log("clientId:", clientId)
    console.log("message:", message)
    console.log("=== FIM DADOS DA RESPOSTA DO CLIENTE ===")

    if (!clientId) {
      return NextResponse.json(
        {
          success: false,
          error: "ClientId é obrigatório",
        },
        { status: 400 },
      )
    }

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          error: "Mensagem é obrigatória",
        },
        { status: 400 },
      )
    }

    // Processar a resposta do cliente
    await handleClientResponse(clientId, message)

    return NextResponse.json({
      success: true,
      message: "Resposta processada com sucesso",
      clientId,
    })
  } catch (error) {
    console.error("Erro ao processar resposta do cliente:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}

