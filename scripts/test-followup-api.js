// test-followup-api.js
import axios from "axios"

// Configuração
const BASE_URL = "http://168.119.247.230:3000" // Ajuste para seu ambiente
const CLIENT_ID = "50"
const CAMPAIGN_ID = "852fabf3-e6c1-4c64-8ee3-d7b3f443b350" // ID da sua campanha

// Cores para saída no console
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
}

// Função para obter tempo atual formatado
function getFormattedTime() {
  return new Date().toLocaleTimeString()
}

// Log colorido
function log(message, color = colors.reset) {
  console.log(`${color}[${getFormattedTime()}] ${message}${colors.reset}`)
}

// Função para esperar um tempo determinado
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Testar criação de follow-up
async function testCreateFollowUp() {
  try {
    log("🔍 Testando criação de follow-up via API...", colors.cyan)

    // Verificar se já existe um follow-up para este cliente
    log("Verificando se já existe follow-up ativo para este cliente...", colors.yellow)
    const checkResponse = await axios.get(`${BASE_URL}/api/follow-up?clientId=${CLIENT_ID}`)

    if (checkResponse.data.data && checkResponse.data.data.length > 0) {
      const activeFollowUps = checkResponse.data.data.filter((f) => f.status === "active" || f.status === "paused")

      if (activeFollowUps.length > 0) {
        log(`Follow-up ativo encontrado: ${activeFollowUps[0].id}`, colors.yellow)
        log("Cancelando follow-up existente...", colors.yellow)

        await axios.post(`${BASE_URL}/api/follow-up/cancel`, {
          followUpId: activeFollowUps[0].id,
        })

        log("Follow-up existente cancelado com sucesso", colors.green)
      }
    }

    // Criando novo follow-up
    log("Criando novo follow-up via API...", colors.cyan)

    const createResponse = await axios.post(`${BASE_URL}/api/follow-up`, {
      clientId: CLIENT_ID,
      campaignId: CAMPAIGN_ID,
      metadata: {
        name: "Cliente de Teste",
        email: CLIENT_ID,
        source: "API Test",
      },
    })

    if (!createResponse.data.success) {
      throw new Error(`Erro ao criar follow-up: ${createResponse.data.error}`)
    }

    const followUpId = createResponse.data.followUpId
    log(`✅ Follow-up criado com sucesso! ID: ${followUpId}`, colors.green)

    return followUpId
  } catch (error) {
    log(`❌ Erro ao criar follow-up: ${error.message}`, colors.red)
    if (error.response) {
      log(`Detalhes da resposta: ${JSON.stringify(error.response.data)}`, colors.red)
    }
    throw error
  }
}

// Testar status do follow-up
async function testFollowUpStatus(followUpId) {
  try {
    log(`🔍 Verificando status do follow-up ${followUpId}...`, colors.cyan)

    const response = await axios.get(`${BASE_URL}/api/follow-up/status?id=${followUpId}`)

    if (!response.data.success) {
      throw new Error(`Erro ao obter status: ${response.data.error}`)
    }

    const status = response.data.data
    log(`Status atual: ${status.status}`, colors.green)
    log(`Etapa atual: ${status.current_step + 1}`, colors.green)
    log(`Próxima mensagem em: ${new Date(status.next_message_at).toLocaleString()}`, colors.green)

    if (status.progress) {
      log(`Progresso: ${status.progress.percentComplete}%`, colors.green)
    }

    return status
  } catch (error) {
    log(`❌ Erro ao verificar status: ${error.message}`, colors.red)
    throw error
  }
}

// Testar simulação de resposta do cliente
async function testClientResponse(followUpId, message = "Esta é uma resposta de teste do cliente via API") {
  try {
    log(`🔍 Simulando resposta do cliente para o follow-up ${followUpId}...`, colors.cyan)

    // Chamar o endpoint que processa respostas de clientes
    // Note: Esta API pode não existir exatamente assim no seu sistema,
    // ajuste conforme necessário
    const response = await axios.post(`${BASE_URL}/api/follow-up/client-response`, {
      followUpId,
      clientId: CLIENT_ID,
      message,
    })

    if (!response.data.success) {
      throw new Error(`Erro ao processar resposta: ${response.data.error}`)
    }

    log(`✅ Resposta do cliente processada com sucesso!`, colors.green)
    return response.data
  } catch (error) {
    log(`❌ Erro ao simular resposta do cliente: ${error.message}`, colors.red)
    throw error
  }
}

// Testar a retomada de um follow-up pausado
async function testResumeFollowUp(followUpId) {
  try {
    log(`🔍 Testando retomada de follow-up ${followUpId}...`, colors.cyan)

    const response = await axios.post(`${BASE_URL}/api/follow-up/resume`, {
      followUpId,
    })

    if (!response.data.success) {
      throw new Error(`Erro ao retomar follow-up: ${response.data.error}`)
    }

    log(`✅ Follow-up retomado com sucesso!`, colors.green)
    return response.data
  } catch (error) {
    log(`❌ Erro ao retomar follow-up: ${error.message}`, colors.red)
    throw error
  }
}

// Testar o cancelamento de um follow-up
async function testCancelFollowUp(followUpId) {
  try {
    log(`🔍 Testando cancelamento de follow-up ${followUpId}...`, colors.cyan)

    const response = await axios.post(`${BASE_URL}/api/follow-up/cancel`, {
      followUpId,
    })

    if (!response.data.success) {
      throw new Error(`Erro ao cancelar follow-up: ${response.data.error}`)
    }

    log(`✅ Follow-up cancelado com sucesso!`, colors.green)
    return response.data
  } catch (error) {
    log(`❌ Erro ao cancelar follow-up: ${error.message}`, colors.red)
    throw error
  }
}

// Testar todos os endpoints relacionados a follow-up
async function testFullFollowUpFlow() {
  try {
    log("🚀 INICIANDO TESTE COMPLETO DA API DE FOLLOW-UP", colors.bright + colors.magenta)
    log("================================================", colors.bright + colors.magenta)

    // 1. Criar novo follow-up
    const followUpId = await testCreateFollowUp()

    // 2. Verificar status inicial
    log("\n--- VERIFICANDO STATUS INICIAL ---", colors.bright)
    const initialStatus = await testFollowUpStatus(followUpId)

    // 3. Aguardar um pouco para que a primeira mensagem seja processada
    log("\nAguardando processamento da primeira mensagem (10s)...", colors.yellow)
    await sleep(10000)

    // 4. Verificar status novamente
    log("\n--- VERIFICANDO STATUS APÓS PRIMEIRA MENSAGEM ---", colors.bright)
    const afterFirstMessageStatus = await testFollowUpStatus(followUpId)

    // 5. Simular resposta do cliente
    log("\n--- SIMULANDO RESPOSTA DO CLIENTE ---", colors.bright)
    await testClientResponse(followUpId, "Olá, estou interessado no seu produto!")

    // 6. Verificar se o follow-up está pausado agora
    log("\n--- VERIFICANDO SE FOLLOW-UP FOI PAUSADO ---", colors.bright)
    const afterResponseStatus = await testFollowUpStatus(followUpId)

    if (afterResponseStatus.status !== "paused") {
      log("⚠️ ATENÇÃO: Follow-up não foi pausado após resposta do cliente!", colors.yellow)
    } else {
      log("✅ Follow-up foi corretamente pausado após resposta do cliente", colors.green)
    }

    // 7. Testar a retomada do follow-up
    log("\n--- TESTANDO RETOMADA DO FOLLOW-UP ---", colors.bright)
    await testResumeFollowUp(followUpId)

    // 8. Verificar status após retomada
    log("\n--- VERIFICANDO STATUS APÓS RETOMADA ---", colors.bright)
    const afterResumeStatus = await testFollowUpStatus(followUpId)

    if (afterResumeStatus.status !== "active") {
      log("⚠️ ATENÇÃO: Follow-up não está ativo após retomada!", colors.yellow)
    } else {
      log("✅ Follow-up foi corretamente retomado", colors.green)
    }

    // 9. Aguardar um pouco para ver se a próxima mensagem é processada
    log("\nAguardando processamento da próxima mensagem (10s)...", colors.yellow)
    await sleep(10000)

    // 10. Verificar status final
    log("\n--- VERIFICANDO STATUS FINAL ---", colors.bright)
    await testFollowUpStatus(followUpId)

    // 11. Cancelar o follow-up ao final do teste
    log("\n--- CANCELANDO FOLLOW-UP DE TESTE ---", colors.bright)
    await testCancelFollowUp(followUpId)

    log("\n🎉 TESTE COMPLETO FINALIZADO COM SUCESSO!", colors.bright + colors.green)
    log("===========================================", colors.bright + colors.green)
  } catch (error) {
    log(`\n❌ TESTE FALHOU: ${error.message}`, colors.bright + colors.red)
  }
}

// Executar o teste completo
testFullFollowUpFlow()

