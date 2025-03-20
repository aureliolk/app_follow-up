// scripts/add-more-funnel-steps.js
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Função para converter string de tempo em milissegundos
function parseTimeString(timeStr) {
  // Se o tempo estiver vazio ou for inválido, usar 30 minutos como padrão
  if (!timeStr || timeStr.trim() === "") {
    return 30 * 60 * 1000 // 30 minutos
  }

  const units = {
    s: 1000, // segundos
    m: 60 * 1000, // minutos
    h: 60 * 60 * 1000, // horas
    d: 24 * 60 * 60 * 1000, // dias
  }

  // Extrair números do texto (para lidar com formatos como "10 minutos")
  const extractNumbers = (text) => {
    const match = text.match(/(\d+)/)
    return match ? Number.parseInt(match[1]) : Number.NaN
  }

  // Verificar formato de texto com minutos
  if (timeStr.toLowerCase().includes("minuto")) {
    const minutos = extractNumbers(timeStr)
    return isNaN(minutos) ? 30 * 60 * 1000 : minutos * 60 * 1000
  }
  // Verificar formato de texto com horas
  else if (timeStr.toLowerCase().includes("hora")) {
    const horas = extractNumbers(timeStr)
    return isNaN(horas) ? 60 * 60 * 1000 : horas * 60 * 60 * 1000
  }
  // Verificar formato de texto com dias
  else if (timeStr.toLowerCase().includes("dia")) {
    const dias = extractNumbers(timeStr)
    return isNaN(dias) ? 24 * 60 * 60 * 1000 : dias * 24 * 60 * 60 * 1000
  }

  // Valor padrão se nenhum formato for reconhecido
  return 30 * 60 * 1000
}

async function addMoreFunnelSteps() {
  try {
    console.log("Iniciando adição de passos adicionais para o funil...")

    // Dados adicionais para cada etapa do funil
    const additionalSteps = [
      // New - Aguardando Resposta (IA)
      {
        stageName: "New - Aguardando Resposta (IA)",
        steps: [
          {
            name: "30 minutos sem resposta",
            template_name: "novo_lead_30min",
            wait_time: "30 minutos",
            message_content:
              "Notei que você ainda não respondeu. Posso esclarecer alguma dúvida ou ajudar de alguma forma?",
          },
          {
            name: "1 hora sem resposta",
            template_name: "novo_lead_1h",
            wait_time: "1 hora",
            message_content: "Olá! Apenas para lembrar que estou aqui para ajudar com qualquer dúvida que você tenha.",
          },
          {
            name: "24 horas sem resposta",
            template_name: "novo_lead_24h",
            wait_time: "24 horas",
            message_content:
              "Oi! Já faz um dia que iniciamos nossa conversa. Caso ainda tenha interesse, é só responder a esta mensagem.",
          },
          {
            name: "48 horas sem resposta",
            template_name: "novo_lead_48h",
            wait_time: "48 horas",
            message_content:
              "Estamos finalizando seu atendimento por inatividade. Se precisar, é só iniciar uma nova conversa.",
          },
        ],
      },

      // Conexão - Lead Engajado - Em Qualificação (IA)
      {
        stageName: "Conexão - Lead Engajado - Em Qualificação (IA)",
        steps: [
          {
            name: "30 minutos em qualificação",
            template_name: "qualificacao_30min",
            wait_time: "30 minutos",
            message_content:
              "Para entendermos melhor suas necessidades, poderia nos contar um pouco mais sobre seu negócio?",
          },
          {
            name: "2 horas em qualificação",
            template_name: "qualificacao_2h",
            wait_time: "2 horas",
            message_content:
              "Apenas para lembrar que estamos no processo de entender melhor suas necessidades para oferecer a melhor solução.",
          },
        ],
      },

      // Qualificado IA
      {
        stageName: "Qualificado IA",
        steps: [
          {
            name: "2 horas após qualificação",
            template_name: "qualificado_2h",
            wait_time: "2 horas",
            message_content:
              "Com base nas informações que você nos forneceu, preparamos uma solução personalizada. Podemos conversar sobre os detalhes?",
          },
        ],
      },

      // Fechamento (IA)
      {
        stageName: "Fechamento (IA)",
        steps: [
          {
            name: "1 hora após início do fechamento",
            template_name: "fechamento_1h",
            wait_time: "1 hora",
            message_content: "Estamos quase finalizando! Tem alguma última dúvida sobre nossa solução?",
          },
          {
            name: "24 horas após início do fechamento",
            template_name: "fechamento_24h",
            wait_time: "24 horas",
            message_content: "Não queremos que você perca essa oportunidade. Podemos finalizar o processo hoje?",
          },
        ],
      },

      // Checkout
      {
        stageName: "Checkout",
        steps: [
          {
            name: "15 minutos no checkout",
            template_name: "checkout_15min",
            wait_time: "15 minutos",
            message_content: "Notamos que você iniciou o processo de pagamento. Precisa de ajuda para finalizar?",
          },
          {
            name: "1 hora no checkout",
            template_name: "checkout_1h",
            wait_time: "1 hora",
            message_content: "Seu processo de compra ainda está pendente. Posso ajudar a finalizar?",
          },
        ],
      },
    ]

    // Buscar todos os estágios do funil
    const stages = await prisma.followUpFunnelStage.findMany()
    console.log(`Encontrados ${stages.length} estágios do funil.`)

    // Para cada conjunto de dados adicionais
    for (const additionalStep of additionalSteps) {
      // Encontrar o estágio correspondente
      const stage = stages.find((s) => s.name === additionalStep.stageName)

      if (!stage) {
        console.log(`Estágio não encontrado: ${additionalStep.stageName}`)
        continue
      }

      console.log(`\nProcessando estágio: ${stage.name} (ID: ${stage.id})`)

      // Para cada passo adicional
      for (const step of additionalStep.steps) {
        try {
          // Verificar se já existe
          const existingStep = await prisma.followUpStep.findFirst({
            where: {
              funnel_stage_id: stage.id,
              template_name: step.template_name,
            },
          })

          if (existingStep) {
            console.log(`Passo já existe: ${existingStep.name} (${existingStep.template_name})`)
            continue
          }

          // Criar o novo passo
          const waitTimeMs = parseTimeString(step.wait_time)

          const newStep = await prisma.followUpStep.create({
            data: {
              funnel_stage_id: stage.id,
              name: step.name,
              template_name: step.template_name,
              wait_time: step.wait_time,
              wait_time_ms: waitTimeMs,
              message_content: step.message_content,
              message_category: "Utility",
              auto_respond: true,
              status: "created",
            },
          })

          console.log(`Passo criado: ${newStep.name} (${newStep.template_name})`)
        } catch (error) {
          console.error(`Erro ao criar passo: ${error.message}`)
        }
      }
    }

    console.log("\nAdição de passos concluída com sucesso!")
  } catch (error) {
    console.error("Erro durante a adição de passos:", error)
  } finally {
    await prisma.$disconnect()
  }
}

// Executar o script
addMoreFunnelSteps()
  .then(() => console.log("Script finalizado."))
  .catch((e) => console.error("Erro no script:", e))

