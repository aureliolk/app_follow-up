#!/usr/bin/env node

import { PrismaClient } from "@prisma/client"
import path from "path"
import fs from "fs/promises"
import csv from "csv-parser"
import { Readable } from "stream"
import dotenv from "dotenv"
import { fileURLToPath } from "url"

// Configuração do dotenv
dotenv.config()

// Obtenção do diretório atual usando ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Inicialização do PrismaClient
const prisma = new PrismaClient()

// Interface para os dados do CSV de follow-up
/**
 * @typedef {Object} FollowUpStep
 * @property {string} etapa
 * @property {string} mensagem
 * @property {string} tempo_de_espera
 * @property {string} [condicionais]
 */

// Mapa para armazenar timeouts ativos
const activeTimeouts = new Map()

// Função para converter string de tempo em milissegundos
function parseTimeString(timeStr) {
  const units = {
    s: 1000, // segundos
    m: 60 * 1000, // minutos
    h: 60 * 60 * 1000, // horas
    d: 24 * 60 * 60 * 1000, // dias
  }

  const match = timeStr.match(/^(\d+)([smhd])$/i)
  if (!match) {
    throw new Error(`Formato de tempo inválido: ${timeStr}. Use formatos como "30m", "2h", "1d"`)
  }

  const value = Number.parseInt(match[1])
  const unit = match[2].toLowerCase()

  if (!(unit in units)) {
    throw new Error(`Unidade de tempo desconhecida: ${unit}`)
  }

  return value * units[unit]
}

// Função para processar o CSV e carregar os dados do funil
async function loadFollowUpData(campaignId) {
  try {
    // Se temos um ID de campanha, carregar do banco de dados
    if (campaignId) {
      const campaign = await prisma.followUpCampaign.findUnique({
        where: { id: campaignId },
      })

      if (!campaign) {
        throw new Error(`Campanha de follow-up não encontrada: ${campaignId}`)
      }

      // Retornar os passos da campanha
      return JSON.parse(campaign.steps)
    }

    // Caso contrário, carregar do arquivo CSV
    const csvFilePath = path.join(process.cwd(), "public", "follow-up-sabrina.csv")
    console.log(`Tentando acessar o arquivo CSV em: ${csvFilePath}`)

    // Verificar se o arquivo existe
    try {
      await fs.access(csvFilePath)
      console.log("Arquivo CSV encontrado com sucesso!")
    } catch (error) {
      console.error(`Erro ao acessar arquivo: ${error.message}`)

      // Listar os arquivos disponíveis na pasta public para debug
      try {
        const files = await fs.readdir(path.join(process.cwd(), "public"))
        console.log("Arquivos disponíveis na pasta public:", files)
      } catch (e) {
        console.error("Não foi possível listar os arquivos na pasta public:", e.message)
      }

      throw new Error(`Arquivo CSV não encontrado em ${csvFilePath}`)
    }

    // Ler o arquivo CSV
    const fileContent = await fs.readFile(csvFilePath, "utf-8")

    return new Promise((resolve, reject) => {
      const results = []

      // Criar um stream a partir do conteúdo do arquivo
      const stream = Readable.from([fileContent])

      stream
        .pipe(
          csv({
            separator: ",",
            headers: [
              "etapa",
              "tempo_de_espera",
              "nome_template",
              "categoria",
              "mensagem",
              "resposta_automatica",
              "status",
            ],
          }),
        )
        .on("data", (data) => results.push(data))
        .on("end", () => resolve(results))
        .on("error", (error) => reject(error))
    })
  } catch (error) {
    console.error("Erro ao carregar dados de follow-up:", error)
    throw error
  }
}

// Função para enviar a mensagem
async function sendMessage(message) {
  try {
    // Verificar se o follow-up ainda está ativo
    const followUp = await prisma.followUp.findUnique({
      where: { id: message.followUpId },
    })

    if (!followUp || followUp.status !== "active") {
      console.log(`Follow-up ${message.followUpId} não está mais ativo, cancelando envio.`)
      return
    }

    // Lógica para enviar a mensagem para o cliente
    // Aqui você pode integrar com sua API de mensagens (WhatsApp, SMS, email, etc.)
    console.log(`ENVIANDO MENSAGEM para cliente ${message.clientId}: ${message.message}`)

    // Na implementação real, esta seria a chamada para sua API de mensagens
    // Por exemplo: await sendWhatsAppMessage(message.clientId, message.message);

    // Simular envio bem-sucedido
    const success = true

    if (success) {
      // Atualizar o status da mensagem no banco de dados
      const dbMessage = await prisma.followUpMessage.findFirst({
        where: {
          follow_up_id: message.followUpId,
          step: message.stepIndex,
        },
        orderBy: { sent_at: "desc" },
      })

      if (dbMessage) {
        await prisma.followUpMessage.update({
          where: { id: dbMessage.id },
          data: {
            delivered: true,
            delivered_at: new Date(),
          },
        })
      }

      console.log(`Mensagem do follow-up ${message.followUpId} etapa ${message.stepIndex} enviada com sucesso.`)
    }
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error)
    throw error
  }
}

// Função para agendar uma mensagem
async function scheduleMessage(message) {
  try {
    const messageId = `${message.followUpId}-${message.stepIndex}`

    // Cancelar qualquer timeout existente para este ID
    if (activeTimeouts.has(messageId)) {
      clearTimeout(activeTimeouts.get(messageId))
      activeTimeouts.delete(messageId)
    }

    // Calcular o atraso em milissegundos
    const delay = message.scheduledTime.getTime() - Date.now()

    // Se o tempo já passou ou é imediato, enviar agora
    if (delay <= 0) {
      await sendMessage(message)
      return messageId
    }

    // Agendar o envio para o futuro
    const timeout = setTimeout(async () => {
      try {
        await sendMessage(message)
      } catch (error) {
        console.error(`Erro ao enviar mensagem agendada ${messageId}:`, error)
      } finally {
        // Remover do mapa após execução
        activeTimeouts.delete(messageId)
      }
    }, delay)

    // Armazenar o timeout
    activeTimeouts.set(messageId, timeout)

    console.log(`Mensagem ${messageId} agendada para ${message.scheduledTime.toISOString()}`)
    return messageId
  } catch (error) {
    console.error("Erro ao agendar mensagem:", error)
    throw error
  }
}

// Função para cancelar todas as mensagens agendadas para um follow-up
async function cancelScheduledMessages(followUpId) {
  try {
    // Encontrar todas as chaves no mapa que começam com o ID do follow-up
    const keysToRemove = Array.from(activeTimeouts.keys()).filter((key) => key.startsWith(`${followUpId}-`))

    // Cancelar cada timeout e remover do mapa
    keysToRemove.forEach((key) => {
      clearTimeout(activeTimeouts.get(key))
      activeTimeouts.delete(key)
    })

    console.log(`${keysToRemove.length} mensagens agendadas canceladas para o follow-up ${followUpId}.`)
  } catch (error) {
    console.error("Erro ao cancelar mensagens agendadas:", error)
    throw error
  }
}

// Função principal para processar as etapas de follow-up
async function processFollowUpSteps(followUpId) {
  try {
    // Carregar o follow-up do banco de dados
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: true,
      },
    })

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`)
    }

    // Verificar se o follow-up está ativo
    if (followUp.status !== "active") {
      console.log(`Follow-up ${followUpId} não está ativo, status atual: ${followUp.status}`)
      return
    }

    // Carregar as etapas da campanha
    const steps = followUp.campaign?.steps ? JSON.parse(followUp.campaign.steps) : await loadFollowUpData()

    if (!steps || steps.length === 0) {
      throw new Error("Nenhuma etapa de follow-up encontrada")
    }

    // Verificar qual é a etapa atual
    const currentStepIndex = followUp.current_step

    // Se já completou todas as etapas, marcar como concluído
    if (currentStepIndex >= steps.length) {
      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          status: "completed",
          completed_at: new Date(),
        },
      })
      console.log(`Follow-up ${followUpId} concluído com sucesso.`)
      return
    }

    // Obter a etapa atual
    const currentStep = steps[currentStepIndex]

    // Calcular o tempo de espera para a próxima mensagem
    // Adaptar formato de tempo_de_espera que pode estar em formato como "10 minutos", "1 hora", etc
    let tempoEspera = currentStep.tempo_de_espera || "30m" // Valor padrão se estiver vazio

    // Se o tempo estiver vazio, usar um padrão
    if (!tempoEspera || tempoEspera.trim() === "") {
      console.log("Tempo de espera não definido, usando padrão de 30 minutos")
      tempoEspera = "30m"
    }
    // Converter formatos específicos
    else if (tempoEspera.includes("minutos") || tempoEspera.includes("minuto")) {
      const minutos = Number.parseInt(tempoEspera)
      tempoEspera = minutos + "m"
    } else if (tempoEspera.includes("hora") || tempoEspera.includes("horas")) {
      const horas = Number.parseInt(tempoEspera)
      tempoEspera = horas + "h"
    } else if (tempoEspera.includes("dias") || tempoEspera.includes("dia")) {
      const dias = Number.parseInt(tempoEspera)
      tempoEspera = dias + "d"
    } else if (tempoEspera.toLowerCase() === "imediatamente") {
      tempoEspera = "1s" // Praticamente imediato
    }

    console.log(`Tempo de espera original: ${currentStep.tempo_de_espera}, convertido para: ${tempoEspera}`)
    const waitTime = parseTimeString(tempoEspera)

    // Calcular o horário da próxima mensagem
    const nextMessageTime = new Date(Date.now() + waitTime)

    // Atualizar o follow-up com o horário da próxima mensagem
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        next_message_at: nextMessageTime,
      },
    })

    // Registrar a mensagem atual
    await prisma.followUpMessage.create({
      data: {
        follow_up_id: followUpId,
        step: currentStepIndex,
        content: currentStep.mensagem,
        sent_at: new Date(),
        delivered: false,
      },
    })

    // Agendar o envio da mensagem atual
    await scheduleMessage({
      followUpId,
      stepIndex: currentStepIndex,
      message: currentStep.mensagem,
      scheduledTime: new Date(), // Enviar imediatamente
      clientId: followUp.client_id,
    })

    // Agendar a próxima etapa se o cliente não responder
    await scheduleNextStep(followUpId, currentStepIndex + 1, nextMessageTime)

    console.log(`Processamento da etapa ${currentStepIndex} do follow-up ${followUpId} agendado com sucesso.`)
  } catch (error) {
    console.error("Erro ao processar etapas de follow-up:", error)
    throw error
  }
}

// Função para agendar a próxima etapa
async function scheduleNextStep(followUpId, nextStepIndex, scheduledTime) {
  try {
    // Verificar se o follow-up existe e está ativo
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: { campaign: true },
    })

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`)
    }

    if (followUp.status !== "active") {
      console.log(`Follow-up ${followUpId} não está ativo, status atual: ${followUp.status}`)
      return
    }

    // Carregar as etapas da campanha
    const steps = followUp.campaign?.steps ? JSON.parse(followUp.campaign.steps) : await loadFollowUpData()

    // Verificar se ainda há etapas restantes
    if (nextStepIndex >= steps.length) {
      console.log(`Follow-up ${followUpId} já atingiu a última etapa.`)

      // Agendar um evento para completar o follow-up
      setTimeout(async () => {
        await prisma.followUp.update({
          where: { id: followUpId },
          data: {
            status: "completed",
            completed_at: new Date(),
          },
        })
        console.log(`Follow-up ${followUpId} marcado como completo.`)
      }, scheduledTime.getTime() - Date.now())

      return
    }

    // Agendar a execução da próxima etapa no tempo especificado
    setTimeout(async () => {
      try {
        // Verificar se o follow-up ainda está ativo e não foi cancelado
        const currentFollowUp = await prisma.followUp.findUnique({
          where: { id: followUpId },
        })

        if (!currentFollowUp || currentFollowUp.status !== "active") {
          console.log(`Follow-up ${followUpId} não está mais ativo, cancelando próxima etapa.`)
          return
        }

        // Verificar se o cliente respondeu
        if (currentFollowUp.is_responsive) {
          console.log(`Cliente respondeu ao follow-up ${followUpId}, pausando sequência.`)

          // Atualizar status para "pausado"
          await prisma.followUp.update({
            where: { id: followUpId },
            data: {
              status: "paused",
            },
          })

          return
        }

        // Atualizar o follow-up para a próxima etapa
        await prisma.followUp.update({
          where: { id: followUpId },
          data: {
            current_step: nextStepIndex,
          },
        })

        // Processar a próxima etapa
        await processFollowUpSteps(followUpId)
      } catch (error) {
        console.error(`Erro ao processar próxima etapa do follow-up ${followUpId}:`, error)
      }
    }, scheduledTime.getTime() - Date.now())

    console.log(`Próxima etapa do follow-up ${followUpId} agendada para ${scheduledTime.toISOString()}`)
  } catch (error) {
    console.error("Erro ao agendar próxima etapa:", error)
    throw error
  }
}

// Função para reiniciar um follow-up pausado
async function resumeFollowUp(followUpId) {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
    })

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`)
    }

    if (followUp.status !== "paused") {
      console.log(`Follow-up ${followUpId} não está pausado, status atual: ${followUp.status}`)
      return
    }

    // Atualizar o status para ativo
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status: "active",
        is_responsive: false,
        next_message_at: new Date(), // Reiniciar imediatamente
      },
    })

    // Processar a etapa atual novamente
    await processFollowUpSteps(followUpId)

    console.log(`Follow-up ${followUpId} reiniciado com sucesso.`)
  } catch (error) {
    console.error("Erro ao reiniciar follow-up:", error)
    throw error
  }
}

// Função para avançar para a próxima etapa manualmente
async function advanceToNextStep(followUpId) {
  try {
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: { campaign: true },
    })

    if (!followUp) {
      throw new Error(`Follow-up não encontrado: ${followUpId}`)
    }

    if (followUp.status !== "active" && followUp.status !== "paused") {
      console.log(`Follow-up ${followUpId} não está ativo ou pausado, status atual: ${followUp.status}`)
      return
    }

    // Carregar as etapas da campanha
    const steps = followUp.campaign?.steps ? JSON.parse(followUp.campaign.steps) : await loadFollowUpData()

    const nextStepIndex = followUp.current_step + 1

    // Verificar se ainda há etapas restantes
    if (nextStepIndex >= steps.length) {
      await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          status: "completed",
          completed_at: new Date(),
        },
      })
      console.log(`Follow-up ${followUpId} completado por avanço manual.`)
      return
    }

    // Atualizar o follow-up para a próxima etapa
    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        current_step: nextStepIndex,
        status: "active",
        is_responsive: false,
        next_message_at: new Date(), // Executar próxima etapa imediatamente
      },
    })

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
async function handleClientResponse(clientId, message) {
  try {
    // Buscar todos os follow-ups ativos para este cliente
    const activeFollowUps = await prisma.followUp.findMany({
      where: {
        client_id: clientId,
        status: { in: ["active", "paused"] },
      },
    })

    if (activeFollowUps.length === 0) {
      console.log(`Nenhum follow-up ativo encontrado para o cliente ${clientId}.`)
      return
    }

    // Atualizar todos os follow-ups ativos para este cliente como responsivos
    for (const followUp of activeFollowUps) {
      await prisma.followUp.update({
        where: { id: followUp.id },
        data: {
          is_responsive: true,
          status: followUp.status === "active" ? "paused" : followUp.status,
        },
      })

      // Registrar a resposta do cliente
      await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUp.id,
          step: -1, // Valor especial para indicar mensagem do cliente
          content: message,
          sent_at: new Date(),
          delivered: true,
          delivered_at: new Date(),
        },
      })

      console.log(`Follow-up ${followUp.id} marcado como responsivo devido à mensagem do cliente.`)
    }
  } catch (error) {
    console.error("Erro ao lidar com resposta do cliente:", error)
    throw error
  }
}

// Função para gerenciar importação inicial do CSV de follow-up para o banco de dados
async function importFollowUpCampaign(name, description) {
  try {
    // Tentar carregar dados do CSV
    let steps = []

    try {
      const rawSteps = await loadFollowUpData()
      console.log("Dados carregados do CSV:", rawSteps.length, "etapas encontradas")

      // Pular a primeira linha se for cabeçalho
      const stepsData = rawSteps[0].etapa === "Etapa do Funil" ? rawSteps.slice(1) : rawSteps

      // Mapear para o formato esperado pelo sistema
      steps = stepsData.map((step) => ({
        etapa: step.etapa,
        mensagem: step.mensagem ? step.mensagem.replace(/^"|"$/g, "") : "", // Remover aspas
        tempo_de_espera: step.tempo_de_espera,
        nome_template: step.nome_template,
        categoria: step.categoria,
        resposta_automatica: step.resposta_automatica,
        status: step.status,
      }))

      console.log("Dados processados:", steps.length, "etapas válidas")
    } catch (error) {
      console.warn("Não foi possível carregar dados do CSV, usando passos padrão:", error.message)

      // Criar passos padrão de demonstração
      steps = [
        {
          etapa: "Primeiro contato",
          mensagem: "Olá! Obrigado por seu interesse em nossos produtos. Estamos aqui para ajudar com qualquer dúvida.",
          tempo_de_espera: "30m",
          condicionais: "",
        },
        {
          etapa: "Segundo contato",
          mensagem:
            "Não recebemos sua resposta. Gostaria de conhecer mais sobre nossos produtos ou tem alguma dúvida específica?",
          tempo_de_espera: "3h",
          condicionais: "",
        },
        {
          etapa: "Terceiro contato",
          mensagem: "Estamos oferecendo um desconto especial para novos clientes. Posso te apresentar algumas opções?",
          tempo_de_espera: "1d",
          condicionais: "",
        },
      ]
    }

    if (!steps || steps.length === 0) {
      throw new Error("Nenhuma etapa definida para a campanha")
    }

    console.log(`Criando campanha com ${steps.length} etapas`)

    // Criar uma nova campanha no banco de dados
    const campaign = await prisma.followUpCampaign.create({
      data: {
        name,
        description,
        active: true,
        steps: JSON.stringify(steps),
      },
    })

    console.log(`Campanha de follow-up "${name}" criada com sucesso, ID: ${campaign.id}`)
    return campaign.id
  } catch (error) {
    console.error("Erro ao importar campanha de follow-up:", error)
    throw error
  }
}

// Função para carregar e reagendar mensagens pendentes
async function reloadPendingMessages() {
  try {
    console.log("Carregando mensagens pendentes...")

    // Buscar todos os follow-ups ativos com mensagens agendadas
    const activeFollowUps = await prisma.followUp.findMany({
      where: {
        status: "active",
        next_message_at: { not: null },
      },
    })

    if (activeFollowUps.length === 0) {
      console.log("Nenhuma mensagem pendente encontrada.")
      return
    }

    console.log(`Encontrados ${activeFollowUps.length} follow-ups ativos com mensagens pendentes.`)

    // Reagendar cada mensagem
    for (const followUp of activeFollowUps) {
      if (!followUp.next_message_at) continue

      // Verificar se a próxima mensagem já está no passado
      const now = new Date()
      let scheduledTime = followUp.next_message_at

      // Se a mensagem já deveria ter sido enviada, enviar imediatamente
      if (scheduledTime < now) {
        scheduledTime = now
      }

      try {
        // Carregar a mensagem atual
        const latestMessage = await prisma.followUpMessage.findFirst({
          where: { follow_up_id: followUp.id },
          orderBy: { sent_at: "desc" },
        })

        if (!latestMessage) {
          console.log(`Nenhuma mensagem encontrada para o follow-up ${followUp.id}, iniciando do zero.`)

          // Iniciar o processamento do follow-up do zero
          await processFollowUpSteps(followUp.id)
          continue
        }

        // Agendar a mensagem
        await scheduleMessage({
          followUpId: followUp.id,
          stepIndex: followUp.current_step,
          message: latestMessage.content,
          scheduledTime,
          clientId: followUp.client_id,
        })

        console.log(`Mensagem para follow-up ${followUp.id} reagendada para ${scheduledTime.toISOString()}.`)
      } catch (innerError) {
        console.error(`Erro ao reagendar mensagem para follow-up ${followUp.id}:`, innerError)
      }
    }
  } catch (error) {
    console.error("Erro ao recarregar mensagens pendentes:", error)
  }
}

// Função para criar um novo follow-up
async function createFollowUp(campaignId, clientId) {
  try {
    if (!campaignId) {
      throw new Error("ID da campanha não especificado")
    }

    if (!clientId) {
      throw new Error("ID do cliente não especificado")
    }

    // Verificar se a campanha existe
    const campaign = await prisma.followUpCampaign.findUnique({
      where: { id: campaignId },
    })

    if (!campaign) {
      throw new Error(`Campanha não encontrada: ${campaignId}`)
    }

    // Criar novo follow-up
    const followUp = await prisma.followUp.create({
      data: {
        campaign_id: campaignId,
        client_id: clientId,
        current_step: 0,
        status: "active",
        next_message_at: new Date(),
        is_responsive: false,
      },
    })

    console.log(`Follow-up criado com sucesso: ${followUp.id}`)
    console.log(`- ID da campanha: ${followUp.campaign_id}`)
    console.log(`- ID do cliente: ${followUp.client_id}`)
    console.log(`- Status: ${followUp.status}`)

    // Iniciar processamento imediatamente
    await processFollowUpSteps(followUp.id)

    return followUp.id
  } catch (error) {
    console.error("Erro ao criar follow-up:", error)
    throw error
  }
}

// Função para listar campanhas disponíveis
async function listCampaigns() {
  try {
    const campaigns = await prisma.followUpCampaign.findMany({
      where: { active: true },
      orderBy: { created_at: "desc" },
    })

    if (campaigns.length === 0) {
      console.log("Nenhuma campanha encontrada.")
      return []
    }

    console.log("\nCampanhas disponíveis:")
    console.log("======================")

    campaigns.forEach((campaign, index) => {
      console.log(`${index + 1}. ID: ${campaign.id}`)
      console.log(`   Nome: ${campaign.name}`)
      console.log(`   Descrição: ${campaign.description || "N/A"}`)
      console.log(`   Criada em: ${campaign.created_at.toISOString()}`)
      console.log("----------------------")
    })

    return campaigns
  } catch (error) {
    console.error("Erro ao listar campanhas:", error)
    throw error
  }
}

// Função para listar follow-ups
async function listFollowUps(clientId) {
  try {
    const query = clientId ? { where: { client_id: clientId } } : {}

    const followUps = await prisma.followUp.findMany({
      ...query,
      include: { campaign: true },
      orderBy: { updated_at: "desc" },
    })

    if (followUps.length === 0) {
      console.log(clientId ? `Nenhum follow-up encontrado para o cliente ${clientId}.` : "Nenhum follow-up encontrado.")
      return []
    }

    console.log("\nFollow-ups:")
    console.log("===========")

    followUps.forEach((followUp, index) => {
      console.log(`${index + 1}. ID: ${followUp.id}`)
      console.log(`   Campanha: ${followUp.campaign?.name || followUp.campaign_id}`)
      console.log(`   Cliente: ${followUp.client_id}`)
      console.log(`   Status: ${followUp.status}`)
      console.log(`   Etapa atual: ${followUp.current_step}`)
      console.log(`   Iniciado em: ${followUp.started_at.toISOString()}`)
      console.log(`   Última atualização: ${followUp.updated_at.toISOString()}`)
      console.log("----------------------")
    })

    return followUps
  } catch (error) {
    console.error("Erro ao listar follow-ups:", error)
    throw error
  }
}

// Função principal para mostrar como usar o script
async function showUsage() {
  console.log(`
Uso do script de Follow-Up:
--------------------------
node scripts/follow-up-manager.js [comando] [parâmetros]

Comandos disponíveis:
  import [nome] [descrição]            - Cria uma nova campanha (tenta usar CSV ou usa passos padrão)
  campaign list                        - Lista todas as campanhas disponíveis
  create [campaignId] [clientId]       - Cria um novo follow-up para um cliente
  list [clientId]                      - Lista todos os follow-ups (opcionalmente filtra por cliente)
  process [followUpId]                 - Processa um follow-up específico
  resume [followUpId]                  - Retoma um follow-up pausado
  advance [followUpId]                 - Avança manualmente para a próxima etapa
  reload                               - Recarrega todas as mensagens pendentes
  help                                 - Mostra esta ajuda
  
Exemplos:
  node scripts/follow-up-manager.js import "Campanha Verão" "Sequência para novos clientes"
  node scripts/follow-up-manager.js campaign list
  node scripts/follow-up-manager.js create 123e4567-e89b-12d3-a456-426614174000 cliente123
  node scripts/follow-up-manager.js list cliente123
  node scripts/follow-up-manager.js process 1234-5678-90ab-cdef
  node scripts/follow-up-manager.js resume 1234-5678-90ab-cdef
  node scripts/follow-up-manager.js advance 1234-5678-90ab-cdef
  node scripts/follow-up-manager.js reload
  `)
}

// Função principal para processar os argumentos da linha de comando
async function main() {
  try {
    const args = process.argv.slice(2)
    const command = args[0]?.toLowerCase()

    if (!command || command === "help") {
      await showUsage()
      return
    }

    switch (command) {
      case "import":
        const name = args[1] || "Campanha padrão"
        const description = args[2] || "Criada por script"
        await importFollowUpCampaign(name, description)
        break

      case "campaign":
        const campaignCommand = args[1]?.toLowerCase()
        if (campaignCommand === "list") {
          await listCampaigns()
        } else {
          console.error("Comando de campanha inválido.")
          await showUsage()
        }
        break

      case "create":
        if (!args[1] || !args[2]) {
          console.error("ID da campanha e ID do cliente são obrigatórios.")
          console.log("Dica: Use 'campaign list' para ver as campanhas disponíveis")
          await showUsage()
          break
        }
        await createFollowUp(args[1], args[2])
        break

      case "list":
        // Listar todos os follow-ups ou filtrar por cliente
        await listFollowUps(args[1])
        break

      case "process":
        if (!args[1]) {
          console.error("ID do follow-up não especificado.")
          await showUsage()
          break
        }
        await processFollowUpSteps(args[1])
        break

      case "resume":
        if (!args[1]) {
          console.error("ID do follow-up não especificado.")
          await showUsage()
          break
        }
        await resumeFollowUp(args[1])
        break

      case "advance":
        if (!args[1]) {
          console.error("ID do follow-up não especificado.")
          await showUsage()
          break
        }
        await advanceToNextStep(args[1])
        break

      case "reload":
        await reloadPendingMessages()
        break

      default:
        console.error(`Comando desconhecido: ${command}`)
        await showUsage()
    }
  } catch (error) {
    console.error("Erro ao executar comando:", error)
  } finally {
    // Fechar a conexão com o Prisma ao finalizar
    await prisma.$disconnect()
  }
}

// Executar a função principal
main().catch((error) => {
  console.error(`Erro fatal: ${error.message}`)
  process.exit(1)
})

