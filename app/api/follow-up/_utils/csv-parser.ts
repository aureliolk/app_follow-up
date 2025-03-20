// app/follow-up/_utils/csv-parser.ts
import fs from "fs/promises"
import path from "path"
import { parse } from "csv-parser"
import { Readable } from "stream"
import prisma from "@/lib/db"

// Interface para os dados do CSV de follow-up
export interface FollowUpStepData {
  etapa: string
  mensagem: string
  tempo_de_espera: string // Formato esperado: "1d", "2h", "30m", etc.
  condicionais?: string
}

// Interface para o resultado do parsing
export interface ParseResult {
  success: boolean
  data?: FollowUpStepData[]
  error?: string
  rowCount?: number
}

/**
 * Processa o arquivo CSV de follow-up
 * @param filePath Caminho para o arquivo CSV ou "default" para usar o arquivo padrão
 * @returns Resultado do processamento
 */
export async function parseFollowUpCsv(filePath = "default"): Promise<ParseResult> {
  try {
    // Se filePath é "default", usar o arquivo CSV padrão
    const csvPath =
      filePath === "default" ? path.join(process.cwd(), "public", "follow up sabrina nunes - Página1.csv") : filePath

    // Verificar se o arquivo existe
    try {
      await fs.access(csvPath)
    } catch (error) {
      return {
        success: false,
        error: `Arquivo não encontrado: ${csvPath}`,
      }
    }

    // Ler o conteúdo do arquivo
    const fileContent = await fs.readFile(csvPath, "utf-8")

    // Processar o CSV
    return new Promise((resolve) => {
      const results: FollowUpStepData[] = []
      let hasHeader = false

      // Criar um stream a partir do conteúdo do arquivo
      const stream = Readable.from([fileContent])

      // Processar o CSV linha por linha
      stream
        .pipe(
          parse({
            separator: ",",
            headers: ["etapa", "mensagem", "tempo_de_espera", "condicionais"],
            skipLines: 0,
          }),
        )
        .on("data", (data: any) => {
          // Verificar se é a linha de cabeçalho
          if (
            !hasHeader &&
            (data.etapa === "etapa" || data.etapa === "Etapa" || data.etapa.toLowerCase() === "etapa")
          ) {
            hasHeader = true
            return
          }

          // Validar dados mínimos necessários
          if (data.etapa && data.mensagem && data.tempo_de_espera) {
            results.push({
              etapa: data.etapa.trim(),
              mensagem: data.mensagem.trim(),
              tempo_de_espera: data.tempo_de_espera.trim(),
              condicionais: data.condicionais ? data.condicionais.trim() : undefined,
            })
          }
        })
        .on("end", () => {
          resolve({
            success: true,
            data: results,
            rowCount: results.length,
          })
        })
        .on("error", (error) => {
          resolve({
            success: false,
            error: `Erro ao processar CSV: ${error.message}`,
          })
        })
    })
  } catch (error: any) {
    return {
      success: false,
      error: `Erro ao processar arquivo: ${error.message}`,
    }
  }
}

/**
 * Importar dados do CSV para o banco de dados como uma nova campanha
 * @param name Nome da campanha
 * @param description Descrição opcional
 * @param filePath Caminho do arquivo CSV (opcional)
 * @returns ID da campanha criada
 */
export async function importCsvToCampaign(name: string, description?: string, filePath?: string): Promise<string> {
  try {
    // Processar o CSV
    const parseResult = await parseFollowUpCsv(filePath)

    if (!parseResult.success || !parseResult.data || parseResult.data.length === 0) {
      throw new Error(parseResult.error || "Nenhum dado encontrado no CSV")
    }

    // Criar a campanha no banco de dados
    const campaign = await prisma.followUpCampaign.create({
      data: {
        name,
        description,
        active: true,
        steps: JSON.stringify(parseResult.data),
      },
    })

    return campaign.id
  } catch (error: any) {
    console.error("Erro ao importar campanha:", error)
    throw new Error(`Falha ao importar campanha: ${error.message}`)
  }
}

/**
 * Validar o formato de tempo de espera
 * @param timeStr String no formato "Xd", "Xh", "Xm" ou "Xs"
 * @returns Booleano indicando se o formato é válido
 */
export function isValidWaitTimeFormat(timeStr: string): boolean {
  return /^\d+[smhd]$/i.test(timeStr)
}

/**
 * Converte string de tempo para milissegundos
 * @param timeStr String no formato "Xd", "Xh", "Xm" ou "Xs"
 * @returns Tempo em milissegundos
 */
export function waitTimeToMs(timeStr: string): number {
  if (!isValidWaitTimeFormat(timeStr)) {
    throw new Error(`Formato de tempo inválido: ${timeStr}. Use formatos como "30m", "2h", "1d"`)
  }

  const match = timeStr.match(/^(\d+)([smhd])$/i)!
  const value = Number.parseInt(match[1])
  const unit = match[2].toLowerCase()

  const units: Record<string, number> = {
    s: 1000, // segundos
    m: 60 * 1000, // minutos
    h: 60 * 60 * 1000, // horas
    d: 24 * 60 * 60 * 1000, // dias
  }

  return value * units[unit]
}

/**
 * Analisar o CSV e validar seu conteúdo
 * @param filePath Caminho do arquivo (opcional)
 * @returns Resultado da validação
 */
export async function validateFollowUpCsv(filePath?: string): Promise<{
  valid: boolean
  errors: string[]
  data?: FollowUpStepData[]
}> {
  const parseResult = await parseFollowUpCsv(filePath)
  const errors: string[] = []

  if (!parseResult.success) {
    errors.push(parseResult.error || "Erro desconhecido ao processar CSV")
    return { valid: false, errors }
  }

  if (!parseResult.data || parseResult.data.length === 0) {
    errors.push("CSV vazio ou sem dados válidos")
    return { valid: false, errors }
  }

  // Validar cada linha
  parseResult.data.forEach((step, index) => {
    // Validar campo etapa
    if (!step.etapa) {
      errors.push(`Linha ${index + 1}: Campo 'etapa' vazio`)
    }

    // Validar campo mensagem
    if (!step.mensagem) {
      errors.push(`Linha ${index + 1}: Campo 'mensagem' vazio`)
    }

    // Validar formato de tempo
    if (!step.tempo_de_espera) {
      errors.push(`Linha ${index + 1}: Campo 'tempo_de_espera' vazio`)
    } else if (!isValidWaitTimeFormat(step.tempo_de_espera)) {
      errors.push(`Linha ${index + 1}: Formato inválido para 'tempo_de_espera': ${step.tempo_de_espera}`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    data: parseResult.data,
  }
}

/**
 * Listar campanhas disponíveis
 * @param activeOnly Filtrar apenas campanhas ativas
 * @returns Lista de campanhas
 */
export async function listCampaigns(activeOnly = false) {
  try {
    const where = activeOnly ? { active: true } : {}

    const campaigns = await prisma.followUpCampaign.findMany({
      where,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        created_at: true,
        // Contar número de etapas
        _count: {
          select: {
            follow_ups: true,
          },
        },
      },
    })

    // Adicionar contagem de etapas
    return await Promise.all(
      campaigns.map(async (campaign) => {
        const steps = await prisma.followUpCampaign.findUnique({
          where: { id: campaign.id },
          select: { steps: true },
        })

        const stepsCount = steps?.steps ? JSON.parse(steps.steps as string).length : 0

        return {
          ...campaign,
          stepsCount,
          activeFollowUps: await prisma.followUp.count({
            where: {
              campaign_id: campaign.id,
              status: "active",
            },
          }),
        }
      }),
    )
  } catch (error) {
    console.error("Erro ao listar campanhas:", error)
    throw error
  }
}

// Function to parse CSV content
async function parseCsvFile(csvText: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = []
    const stream = Readable.from([csvText])

    stream
      .pipe(
        parse({
          separator: ",",
          headers: ["etapa", "mensagem", "tempo_de_espera", "condicionais"],
          skipLines: 0,
        }),
      )
      .on("data", (data: any) => {
        results.push(data)
      })
      .on("end", () => {
        resolve(results)
      })
      .on("error", (error) => {
        reject(error)
      })
  })
}

// Add this new function to work with Supabase storage
export async function parseCsvFromStorage(filePath: string, supabaseClient: any): Promise<any[]> {
  try {
    // Download the file from Supabase storage
    const { data, error } = await supabaseClient.storage.from("csv-imports").download(filePath)

    if (error) {
      throw new Error(`Error downloading CSV: ${error.message}`)
    }

    // Convert blob to text
    const text = await data.text()

    // Use the existing parseCsvFile function
    return parseCsvFile(text)
  } catch (error) {
    console.error("Error parsing CSV from storage:", error)
    throw error
  }
}

