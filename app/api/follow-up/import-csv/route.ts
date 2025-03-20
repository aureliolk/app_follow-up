import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { parseCsvFile } from "../_utils/csv-parser"

export async function POST(req: NextRequest) {
  try {
    const { filePath } = await req.json()

    if (!filePath) {
      return NextResponse.json(
        {
          success: false,
          error: "Caminho do arquivo é obrigatório",
        },
        { status: 400 },
      )
    }

    // Get the file from Supabase storage
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.storage.from("csv-imports").download(filePath)

    if (error || !data) {
      console.error("Error downloading CSV from storage:", error)
      return NextResponse.json(
        {
          success: false,
          error: "Erro ao baixar arquivo CSV",
        },
        { status: 500 },
      )
    }

    // Convert blob to text
    const text = await data.text()

    // Parse CSV
    const parsedData = await parseCsvFile(text)

    return NextResponse.json({
      success: true,
      data: parsedData,
    })
  } catch (error) {
    console.error("Erro ao processar arquivo CSV:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro interno do servidor",
      },
      { status: 500 },
    )
  }
}