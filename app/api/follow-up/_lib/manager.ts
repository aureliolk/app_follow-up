import supabase from "@/lib/db"
import { cancelScheduledMessages } from "./scheduler"
import path from "path"
import fs from "fs/promises"
import csv from "csv-parser"
import { Readable } from "stream"

// Interface para os dados do CSV de follow-up
interface FollowUpStep {
  etapa: string
  mensagem: string
  tempo_de_espera: string // Formato esperado: "1d", "2h", "30m", etc.
  condicionais?: string
}

const TEST_MODE = true // Defina como false em produção
console.log("MODO DE TESTE CONFIGURADO COMO:", TEST_MODE ? "ATIVADO" : "DESATIVADO")
// Função para converter string de tempo em milissegundos
// Função para analisar strings de tempo como "1 hora", "30 minutos", etc.
export function parseTimeString(timeString: string): number {
  if (!timeString) return 0

  // Converter para minúsculas e remover acentos
  const normalizedString = timeString
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  // Caso especial para "imediatamente"
  if (normalizedString === "imediatamente" || normalizedString === "immediately") {
    return 0
  }

  // Expressão regular para extrair número e unidade
  const match = normalizedString.match(/(\d+)\s*(minuto|minutos|hora|horas|dia|dias|segundo|segundos|min|hr|h|d|s)/)

  if (!match) {
    console.warn(`Formato de tempo não reconhecido: ${timeString}, usando 0`)
    return 0
  }

  const amount = Number.parseInt(match[1], 10)
  const unit = match[2]

  // Converter para milissegundos
  switch (unit) {
    case "segundo":
    case "segundos":
    case "s":
      return amount * 1000
    case "minuto":
    case "minutos":
    case "min":
      return amount * 60 * 1000
    case "hora":
    case "horas":
    case "hr":
    case "h":
      return amount * 60 * 60 * 1000
    case "dia":
    case "dias":
    case "d":
      return amount * 24 * 60 * 60 * 1000
    default:
      console.warn(`Unidade de tempo não reconhecida: ${unit}, usando minutos como padrão`)
      return amount * 60 * 1000
  }
}

// Função para processar o CSV e carregar os dados do funil
export async function loadFollowUpData(campaignId?: string): Promise<FollowUpStep[]> {
  try {
    // Se temos um ID de campanha, carregar do banco de dados
    if (campaignId) {
      const { data: campaign, error } = await supabase
        .from("follow_up_campaigns")
        .select("*")
        .eq("id", campaignId)
        .single()

      if (error || !campaign) {
        throw new Error(`Campanha de follow-up não encontrada: ${campaignId}`)
      }

      // Retornar os passos da campanha com tratamento seguro para strings vazias ou inválidas
      try {
        // Verificar se é uma string vazia ou inválida
        const stepsString = campaign.steps as string
        if (!stepsString || stepsString.trim() === "" || stepsString === "[]") {
          console.log(`Campanha ${campaignId} tem steps vazios ou inválidos, retornando array vazio`)
          return []
        }
        return JSON.parse(stepsString) as FollowUpStep[]
      } catch (err) {
        console.error(`Erro ao analisar steps da campanha ${campaignId}:`, err)
        return [] // Retornar array vazio em caso de erro
      }
    }

    // Caso contrário, carregar do arquivo CSV mais recente
    const csvFilePath = path.join(process.cwd(), "public", "follow-up-sabrina-nunes-atualizado.csv")

    // Verificar se o arquivo existe
    try {
      await fs.access(csvFilePath)
    } catch (error) {
      throw new Error(`Arquivo CSV não encontrado em ${csvFilePath}`)
    }

    // Ler o arquivo CSV
    const fileContent = await fs.readFile(csvFilePath, "utf-8")

    return new Promise((resolve, reject) => {
      const results: FollowUpStep[] = []

      // Criar um stream a partir do conteúdo do arquivo
      const stream = Readable.from([fileContent])

      stream
        .pipe(
          csv({
            separator: ",",
            headers: ["etapa", "tempo_de_espera", "template_name", "category", "mensagem", "auto_respond", "status"],
          }),
        )
        .on("data", (data) => {
          // Filtrar cabeçalhos ou linhas vazias
          if (data.etapa && data.etapa !== "Etapa do Funil") {
            results.push(data)
          }
        })
        .on("end", () => resolve(results))
        .on("error", (error) => reject(error))
    })
  } catch (error) {
    console.error("Erro ao carregar dados de follow-up:", error)
    throw error
  }
}

// Função principal para processar as etapas de follow-up
// Função para processar os passos de follow-up
export async function processFollowUpSteps(followUpId: string): Promise<void> {
  try {
    console.log(`Processando follow-up ID: ${followUpId}`)

    // Buscar o follow-up
    const { data: followUp, error: followUpError } = await supabase
      .from("follow_ups")
      .select(`
        id,
        campaign_id,
        client_id,
        status,
        current_step,
        current_stage_id,
        next_message_at,
        is_responsive
      `)
      .eq("id", followUpId)
      .single()

    if (followUpError || !followUp) {
      console.error(`Follow-up não encontrado: ${followUpId}`, followUpError)
      return
    }

    // Se o follow-up não estiver ativo, não processar
    if (followUp.status !== "active") {
      console.log(`Follow-up ${followUpId} não está ativo (status: ${followUp.status}), pulando processamento`)
      return
    }

    // Buscar a campanha
    const { data: campaign, error: campaignError } = await supabase
      .from("follow_up_campaigns")
      .select("id, name, steps")
      .eq("id", followUp.campaign_id)
      .single()

    if (campaignError || !campaign) {
      console.error(`Campanha não encontrada para follow-up ${followUpId}`, campaignError)
      return
    }

    // Analisar os passos da campanha
    let campaignSteps = []
    try {
      campaignSteps = JSON.parse(campaign.steps || "[]")
    } catch (e) {
      console.error(`Erro ao analisar passos da campanha ${campaign.id}:`, e)
      campaignSteps = []
    }

    // Se não houver passos ou todos os passos já foram executados
    if (campaignSteps.length === 0 || followUp.current_step >= campaignSteps.length) {
      console.log(`Todos os passos concluídos para follow-up ${followUpId}, marcando como concluído`)

      // Atualizar o follow-up como concluído
      await supabase
        .from("follow_ups")
        .update({
          status: "completed",
          completed_at: new Date(),
        })
        .eq("id", followUpId)

      return
    }

    // Obter o próximo passo
    const currentStepIndex = followUp.current_step
    const nextStep = campaignSteps[currentStepIndex]

    if (!nextStep) {
      console.error(`Passo ${currentStepIndex} não encontrado para follow-up ${followUpId}`)
      return
    }

    // Verificar se é hora de enviar a mensagem
    const now = new Date()
    const nextMessageTime = new Date(followUp.next_message_at)

    if (now < nextMessageTime) {
      console.log(
        `Ainda não é hora de enviar a mensagem para follow-up ${followUpId}, agendada para ${nextMessageTime}`,
      )

      // Agendar o próximo processamento
      const timeUntilNextMessage = nextMessageTime.getTime() - now.getTime()
      setTimeout(() => processFollowUpSteps(followUpId), timeUntilNextMessage)

      return
    }

    // Buscar o estágio atual
    let stageName = "Não definido"
    if (followUp.current_stage_id) {
      const { data: stage, error: stageError } = await supabase
        .from("follow_up_funnel_stages")
        .select("name")
        .eq("id", followUp.current_stage_id)
        .single()

      if (!stageError && stage) {
        stageName = stage.name
      }
    }

    // Enviar a mensagem
    console.log(`Enviando mensagem para follow-up ${followUpId}, passo ${currentStepIndex}`)

    // Criar registro da mensagem
    const { data: message, error: messageError } = await supabase
      .from("follow_up_messages")
      .insert({
        follow_up_id: followUpId,
        client_id: followUp.client_id,
        content: nextStep.message || "Conteúdo não definido",
        template_name: nextStep.template || "Template não definido",
        step_number: currentStepIndex,
        sent_at: now,
        funnel_stage: stageName,
      })
      .select()
      .single()

    if (messageError) {
      console.error(`Erro ao registrar mensagem para follow-up ${followUpId}:`, messageError)
      // Continuar mesmo com erro no registro
    }

    // Calcular o tempo de espera para o próximo passo
    let waitTime = 24 * 60 * 60 * 1000 // Padrão: 1 dia
    if (nextStep.wait_time) {
      waitTime = parseTimeString(nextStep.wait_time)
    }

    // Calcular o próximo horário de mensagem
    const nextMessageAt = new Date(now.getTime() + waitTime)

    // Atualizar o follow-up para o próximo passo
    await supabase
      .from("follow_ups")
      .update({
        current_step: currentStepIndex + 1,
        next_message_at: nextMessageAt,
      })
      .eq("id", followUpId)

    console.log(
      `Follow-up ${followUpId} atualizado para o passo ${currentStepIndex + 1}, próxima mensagem em ${nextMessageAt}`,
    )

    // Agendar o próximo processamento
    setTimeout(() => processFollowUpSteps(followUpId), waitTime)
  } catch (error) {
    console.error(`Erro ao processar follow-up ${followUpId}:`, error)
  }
}

// Função para agendar a próxima etapa
export async function scheduleNextStep(followUpId: string, nextStepIndex: number, scheduledTime: Date): Promise<void> {
  try {
    // Verificar se o follow-up existe e está ativo
    const { data: followUp, error: followUpError } = await supabase
      .from("follow_ups")
      .select(`
        id, 
        campaign_id, 
        status, 
        current_step, 
        is_responsive
      `)
      .eq("id", followUpId)
      .single()

    if (followUpError || !followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`)
    }

    if (followUp.status !== "active") {
      return
    }

    // Buscar a campanha
    const { data: campaign, error: campaignError } = await supabase
      .from("follow_up_campaigns")
      .select("steps")
      .eq("id", followUp.campaign_id)
      .single()

    if (campaignError || !campaign) {
      throw new Error(`Campanha não encontrada para follow-up ${followUpId}`)
    }

    // Carregar as etapas da campanha com tratamento seguro para strings vazias ou inválidas
    let steps: FollowUpStep[] = []
    if (campaign.steps) {
      try {
        const stepsString = campaign.steps as string
        if (stepsString && stepsString.trim() !== "" && stepsString !== "[]") {
          steps = JSON.parse(stepsString) as FollowUpStep[]
        } else {
          console.log(`Follow-up ${followUpId} tem campanha com steps vazios, carregando do CSV`)
          steps = await loadFollowUpData()
        }
      } catch (err) {
        console.error(`Erro ao analisar steps da campanha para follow-up ${followUpId}:`, err)
        // Fallback para o CSV em caso de erro
        steps = await loadFollowUpData()
      }
    } else {
      steps = await loadFollowUpData()
    }

    // Verificar se ainda há etapas restantes
    if (nextStepIndex >= steps.length) {
      console.log(`Follow-up ${followUpId} já atingiu a última etapa.`)

      // Agendar um evento para completar o follow-up
      setTimeout(async () => {
        await supabase
          .from("follow_ups")
          .update({
            status: "completed",
            completed_at: new Date(),
          })
          .eq("id", followUpId)
        console.log(`Follow-up ${followUpId} marcado como completo.`)
      }, scheduledTime.getTime() - Date.now())

      return
    }

    // Verificar se estamos na mesma etapa do funil ou mudando para outra
    const currentEtapa = steps[followUp.current_step]?.etapa || steps[followUp.current_step]?.stage_name
    const nextEtapa = steps[nextStepIndex]?.etapa || steps[nextStepIndex]?.stage_name

    // Verificar se estamos mudando de etapa no funil
    // Isso é importante para saber se estamos apenas avançando os estágios dentro da mesma etapa
    // ou se estamos mudando para uma etapa completamente diferente (o que só deve acontecer após resposta do cliente)
    const mudandoEtapa = currentEtapa !== nextEtapa

    // Verificar se a mudança de etapa é permitida
    // Normalmente, só mudamos de etapa se o cliente respondeu, então verificar is_responsive
    if (mudandoEtapa) {
      // Para seguir o fluxo correto, só permitir mudança de etapa após resposta do cliente
      if (!followUp.is_responsive) {
        // Procurar o próximo estágio na mesma etapa
        let proximoEstagioMesmaEtapa = -1
        for (let i = nextStepIndex; i < steps.length; i++) {
          const etapaDoStep = steps[i]?.etapa || steps[i]?.stage_name
          if (etapaDoStep === currentEtapa) {
            proximoEstagioMesmaEtapa = i
            break
          }
        }

        // Se não encontrou próximo estágio na mesma etapa, manter o atual
        if (proximoEstagioMesmaEtapa === -1) {
          // Não avançar, pois estaríamos mudando para uma etapa diferente
          return
        } else {
          // Atualizar para o próximo estágio na mesma etapa
          nextStepIndex = proximoEstagioMesmaEtapa
        }
      }
    }

    // Agendar a execução da próxima etapa no tempo especificado
    setTimeout(async () => {
      try {
        // Verificar se o follow-up ainda está ativo e não foi cancelado
        const { data: currentFollowUp, error } = await supabase
          .from("follow_ups")
          .select("*")
          .eq("id", followUpId)
          .single()

        if (error || !currentFollowUp || currentFollowUp.status !== "active") {
          return
        }

        // Verificar se o cliente respondeu
        if (currentFollowUp.is_responsive) {
          // Verificar se o follow-up já foi processado pela resposta do cliente
          let alreadyProcessed = false
          try {
            if (currentFollowUp.metadata) {
              const metadata = JSON.parse(currentFollowUp.metadata)
              alreadyProcessed = !!metadata.processed_by_response
            }
          } catch (e) {
            console.error("Erro ao analisar metadata:", e)
          }

          // Se já foi processado pela resposta, continuar normalmente
          if (alreadyProcessed) {
            // Continuar normalmente
          } else {
            // Caso contrário, pausar como antes
            // Atualizar status para "pausado"
            await supabase
              .from("follow_ups")
              .update({
                status: "paused",
              })
              .eq("id", followUpId)

            return
          }
        }

        // IMPORTANTE: Verificar se o current_step atual ainda é o esperado
        // Isso evita condições de corrida onde múltiplos agendamentos possam incrementar
        // o step várias vezes ou pular estágios
        if (currentFollowUp.current_step !== nextStepIndex - 1) {
          // Se o current_step atual for maior ou igual ao next_step que estamos tentando agendar
          // significa que esse passo já foi processado por outra instância, então abortamos
          if (currentFollowUp.current_step >= nextStepIndex) {
            return
          }
        }

        // Preparar dados para atualização
        const updateData: any = {
          current_step: nextStepIndex,
        }

        // Se estamos mudando para outra etapa do funil, atualizamos o metadata
        if (currentEtapa !== nextEtapa) {
          // Preparar o metadata como JSON
          const metadata = JSON.stringify({
            current_stage_name: nextEtapa,
            updated_at: new Date().toISOString(),
          })

          updateData.metadata = metadata
        }

        // Atualizar o follow-up para a próxima etapa
        await supabase.from("follow_ups").update(updateData).eq("id", followUpId)

        // Processar a próxima etapa
        await processFollowUpSteps(followUpId)
      } catch (error) {
        console.error(`Erro ao processar próxima etapa do follow-up ${followUpId}:`, error)
      }
    }, scheduledTime.getTime() - Date.now())
  } catch (error) {
    console.error("Erro ao agendar próxima etapa:", error)
    throw error
  }
}

// Função para reiniciar um follow-up pausado
export async function resumeFollowUp(followUpId: string): Promise<void> {
  try {
    const { data: followUp, error } = await supabase.from("follow_ups").select("*").eq("id", followUpId).single()

    if (error || !followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`)
    }

    if (followUp.status !== "paused") {
      console.log(`Follow-up ${followUpId} não está pausado, status atual: ${followUp.status}`)
      return
    }

    // Atualizar o status para ativo
    await supabase
      .from("follow_ups")
      .update({
        status: "active",
        is_responsive: false,
        next_message_at: new Date(), // Reiniciar imediatamente
      })
      .eq("id", followUpId)

    // Processar a etapa atual novamente
    await processFollowUpSteps(followUpId)

    console.log(`Follow-up ${followUpId} reiniciado com sucesso.`)
  } catch (error) {
    console.error("Erro ao reiniciar follow-up:", error)
    throw error
  }
}

// Função para avançar para a próxima etapa manualmente
export async function advanceToNextStep(followUpId: string): Promise<void> {
  try {
    const { data: followUp, error: followUpError } = await supabase
      .from("follow_ups")
      .select("*, campaign:follow_up_campaigns(*)")
      .eq("id", followUpId)
      .single()

    if (followUpError || !followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`)
    }

    if (followUp.status !== "active" && followUp.status !== "paused") {
      console.log(`Follow-up ${followUpId} não está ativo ou pausado, status atual: ${followUp.status}`)
      return
    }

    // Carregar as etapas da campanha com tratamento seguro para strings vazias ou inválidas
    let steps: FollowUpStep[] = []
    if (followUp.campaign?.steps) {
      try {
        const stepsString = followUp.campaign.steps as string
        if (stepsString && stepsString.trim() !== "" && stepsString !== "[]") {
          steps = JSON.parse(stepsString) as FollowUpStep[]
        } else {
          console.log(`Follow-up ${followUpId} tem campanha com steps vazios, carregando do CSV`)
          steps = await loadFollowUpData()
        }
      } catch (err) {
        console.error(`Erro ao analisar steps da campanha para follow-up ${followUpId}:`, err)
        // Fallback para o CSV em caso de erro
        steps = await loadFollowUpData()
      }
    } else {
      steps = await loadFollowUpData()
    }

    const nextStepIndex = followUp.current_step + 1

    // Verificar se ainda há etapas restantes
    if (nextStepIndex >= steps.length) {
      await supabase
        .from("follow_ups")
        .update({
          status: "completed",
          completed_at: new Date(),
        })
        .eq("id", followUpId)
      console.log(`Follow-up ${followUpId} completado por avanço manual.`)
      return
    }

    // Atualizar o follow-up para a próxima etapa
    await supabase
      .from("follow_ups")
      .update({
        current_step: nextStepIndex,
        status: "active",
        is_responsive: false,
        next_message_at: new Date(), // Executar próxima etapa imediatamente
      })
      .eq("id", followUpId)

    // Cancelar mensagens agendadas anteriormente
    await cancelScheduledMessages(followUpId)

    // Processar a próxima etapa
    await processFollowUpSteps(followUpId)

    console.log(`Follow-up ${followUpId} avançado manualmente para a etapa ${nextStepIndex}.`)
  } catch (error) {
    console.error("Erro ao avançar follow-up:", error)
    throw error
  }
}

// Função para lidar com uma resposta do cliente
export async function handleClientResponse(clientId: string, message: string): Promise<void> {
  try {
    // Buscar todos os follow-ups ativos para este cliente
    const { data: activeFollowUps, error } = await supabase
      .from("follow_ups")
      .select("*, campaign:follow_up_campaigns(*)")
      .eq("client_id", clientId)
      .in("status", ["active", "paused"])

    if (error) {
      throw error
    }

    if (!activeFollowUps || activeFollowUps.length === 0) {
      return
    }

    // Para cada follow-up ativo deste cliente
    for (const followUp of activeFollowUps) {
      // IMPORTANTE: Primeiro cancelar TODAS as mensagens agendadas
      await cancelScheduledMessages(followUp.id)

      // Registrar a resposta do cliente
      await supabase.from("follow_up_messages").insert({
        follow_up_id: followUp.id,
        step: -1, // Valor especial para indicar mensagem do cliente
        content: message,
        sent_at: new Date(),
        delivered: true,
        delivered_at: new Date(),
      })

      // Agora vamos identificar a próxima fase do funil
      // Primeiro, carregamos as etapas da campanha com tratamento seguro para strings vazias ou inválidas
      let steps: FollowUpStep[] = []
      if (followUp.campaign?.steps) {
        try {
          const stepsString = followUp.campaign.steps as string
          if (stepsString && stepsString.trim() !== "" && stepsString !== "[]") {
            steps = JSON.parse(stepsString) as FollowUpStep[]
          } else {
            console.log(`Follow-up ${followUp.id} tem campanha com steps vazios, carregando do CSV`)
            steps = await loadFollowUpData()
          }
        } catch (err) {
          console.error(`Erro ao analisar steps da campanha para follow-up ${followUp.id}:`, err)
          // Fallback para o CSV em caso de erro
          steps = await loadFollowUpData()
        }
      } else {
        steps = await loadFollowUpData()
      }

      if (!steps || steps.length === 0) {
        console.log(`Nenhuma etapa encontrada para o follow-up ${followUp.id}`)
        continue
      }

      // Identificar a fase atual do funil
      const currentStepIndex = followUp.current_step
      const currentStep = steps[currentStepIndex]
      const currentFunnelStage = currentStep?.etapa || currentStep?.stage_name

      console.log(`Fase atual do funil: ${currentFunnelStage}`)

      // Procurar a primeira etapa da próxima fase do funil
      let nextPhaseStepIndex = -1
      let nextPhaseName = ""

      for (let i = 0; i < steps.length; i++) {
        const stepFunnelStage = steps[i]?.etapa || steps[i]?.stage_name

        // Se encontrarmos uma fase diferente da atual, essa é a próxima fase
        if (stepFunnelStage && stepFunnelStage !== currentFunnelStage) {
          nextPhaseStepIndex = i
          nextPhaseName = stepFunnelStage
          break
        }
      }

      // Se encontramos a próxima fase, atualizar o follow-up
      if (nextPhaseStepIndex >= 0) {
        // PONTO CRÍTICO: Garantir que o status seja 'active' - não 'paused'
        await supabase
          .from("follow_ups")
          .update({
            current_step: nextPhaseStepIndex,
            is_responsive: true,
            status: "active", // IMPORTANTE: forçar como 'active' mesmo após resposta
            next_message_at: new Date(), // Processar a próxima mensagem imediatamente
            metadata: JSON.stringify({
              current_stage_name: nextPhaseName,
              updated_at: new Date().toISOString(),
              last_response: message,
              // Adicionar uma flag para identificar que este follow-up foi processado por resposta
              processed_by_response: true,
            }),
          })
          .eq("id", followUp.id)

        // Processar a primeira etapa da nova fase imediatamente
        await processFollowUpSteps(followUp.id)
      } else {
        // Se não houver próxima fase, marcar como completo
        await supabase
          .from("follow_ups")
          .update({
            status: "completed",
            completed_at: new Date(),
            is_responsive: true,
          })
          .eq("id", followUp.id)
      }
    }
  } catch (error) {
    console.error("Erro ao lidar com resposta do cliente:", error)
    throw error
  }
}

// Função para gerenciar importação inicial do CSV de follow-up para o banco de dados
export async function importFollowUpCampaign(name: string, description?: string): Promise<string> {
  try {
    // Carregar dados do CSV
    const steps = await loadFollowUpData()

    if (!steps || steps.length === 0) {
      throw new Error("Nenhuma etapa encontrada no CSV")
    }

    // Criar uma nova campanha no banco de dados
    const { data: campaign, error } = await supabase
      .from("follow_up_campaigns")
      .insert({
        name,
        description,
        active: true,
        steps: JSON.stringify(steps),
      })
      .select()
      .single()

    if (error || !campaign) {
      throw error || new Error("Erro ao criar campanha")
    }

    console.log(`Campanha de follow-up "${name}" importada com sucesso, ID: ${campaign.id}`)
    return campaign.id
  } catch (error) {
    console.error("Erro ao importar campanha de follow-up:", error)
    throw error
  }
}

