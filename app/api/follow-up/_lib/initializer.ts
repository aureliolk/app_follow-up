// app/api/follow-up/_lib/initializer.ts
import { prisma } from '@/lib/db';
// REMOVER import de setMessageProcessor
// import { setMessageProcessor, MessageProcessor } from './scheduler';
// Adicionar import da interface MessageProcessor do scheduler
import type { MessageProcessor } from '../_lib/scheduler'; // Use 'type' para importar apenas o tipo
import axios from 'axios';
import { createSystemMessage, updateFollowUpStatus } from './internal/followUpHelpers';

// --- Funções Auxiliares de Envio para Lumibot (Colocadas aqui para encapsulamento) ---
async function enviarHSMLumibot(
  accountId: string,
  conversationId: string, // clientId
  token: string,
  // Receber dados relevantes do passo/template
  stepData: {
    message_content: string;    // Conteúdo base do template
    template_name: string;      // Nome EXATO do HSM aprovado
    category: string;           // Categoria do template
  },
  clientName: string // Nome real do cliente para usar em {{1}}
): Promise<{ success: boolean, responseData: any }> {

  const apiUrl = `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const headers = { 'Content-Type': 'application/json', 'api_access_token': token };

  // --- Montando o corpo EXATAMENTE como especificado ---
  const body = {
    content: stepData.message_content, // Conteúdo base do template do seu BD
    message_type: "outgoing",         // Fixo
    template_params: {
      name: stepData.template_name,         // Nome EXATO do HSM
      category: stepData.category || "UTILITY", // Categoria do passo (com fallback)
      language: "pt_BR",                // Fixo
      ...(stepData.message_content.includes('{{1}}') && clientName ?
          { processed_params: { "1": clientName } } :
          {} // Objeto vazio se não precisar/tiver nome
      )
    }
  };
  // --- Fim da montagem do corpo ---

  console.log(`[Lumibot Processor] Enviando HSM: ${apiUrl}, Payload:`, JSON.stringify(body));
  try {
    const response = await axios.post(apiUrl, body, { headers });
    console.log(`[Lumibot Processor] Resposta Lumibot (HSM): Status ${response.status}`);
    // Usar >= 200 e < 300 para cobrir outros status de sucesso como 201, 202
    return { success: response.status >= 200 && response.status < 300, responseData: response.data };
  } catch (err: any) {
    console.error(`[Lumibot Processor] Erro ao enviar HSM (${stepData.template_name}): ${err.message}`, err.response?.data);
    return { success: false, responseData: err.response?.data || { error: err.message } };
  }
}

async function enviarTextoLivreLumibot(accountId: string, conversationId: string, token: string, content: string): Promise<{ success: boolean, responseData: any }> {
  const apiUrl = `https://app.lumibot.com.br/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const headers = { 'Content-Type': 'application/json', 'api_access_token': token };
  const body = { content: content, message_type: "outgoing" }; // Confirmar message_type
  console.log(`[Lumibot Processor] Enviando Texto Livre: ${apiUrl}, Payload:`, JSON.stringify(body));
  try {
    const response = await axios.post(apiUrl, body, { headers });
    console.log(`[Lumibot Processor] Resposta Lumibot (Texto Livre): Status ${response.status}`);
    return { success: response.status === 200 || response.status === 201, responseData: response.data };
  } catch (err: any) {
    console.error(`[Lumibot Processor] Erro ao enviar Texto Livre: ${err.message}`, err.response?.data);
    return { success: false, responseData: err.response?.data || { error: err.message } };
  }
}
// --- Fim Funções Auxiliares ---


// --- Objeto do Processador (Agora Exportado) ---
export const lumibotProcessor: MessageProcessor = {
  process: async (dataToSend: {
    followUpId: string;
    stepIndex: number;
    message: string;   // Conteúdo final a ser enviado (finalMessageContent)
    clientId: string;  // ID do cliente/conversa
    metadata?: any;    // Objeto contendo dados extras
  }) => {
    const { followUpId, clientId, message, metadata } = dataToSend;
    // Extrair TODOS os dados relevantes do metadata
    const {
      messageDbId, // ID da msg no BD
      isHSM,
      templateNameWhatsapp, // Nome HSM (vem do executeAIAction -> scheduleMessage)
      templateCategory,   // Categoria (vem do executeAIAction -> scheduleMessage)
    } = metadata || {};

    let success = false;
    let errorReason = 'Erro desconhecido no processador Lumibot';

    if (!messageDbId) {
      console.error(`[Processor] Erro Crítico: messageDbId não encontrado nos metadados para FollowUp ${followUpId}.`);
      return false;
    }

    try {
      // **** SUBSTITUIÇÃO DO PLACEHOLDER AQUI ****
      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        select: {
          last_client_message_at: true, // Para verificar janela 24h
          campaign: { // Para obter credenciais Lumibot
            select: { idLumibot: true, tokenAgentLumibot: true }
          }
        }
      });
      // **** FIM DA SUBSTITUIÇÃO ****

      if (!followUp) throw new Error(`FollowUp ${followUpId} não encontrado no processador.`);
      if (!followUp.campaign?.idLumibot || !followUp.campaign?.tokenAgentLumibot) {
        throw new Error(`Credenciais Lumibot não encontradas na campanha do FollowUp ${followUpId}.`);
      }

      const effectiveAccountId = followUp.campaign.idLumibot;
      const effectiveToken = followUp.campaign.tokenAgentLumibot;

      // **** BUSCAR NOME DO CLIENTE ****
      let actualClientName = clientId; // Fallback para ID
      try {
        console.log(`[Processor] Buscando nome do cliente ${clientId} na Lumibot...`);
        const convApiUrl = `https://app.lumibot.com.br/api/v1/accounts/${effectiveAccountId}/conversations/${clientId}`;
        const conversation = await axios.get(convApiUrl, { headers: { 'api_access_token': effectiveToken } });
        if (conversation.data?.meta?.sender?.name) {
          actualClientName = conversation.data.meta.sender.name;
          console.log(`[Processor] Nome encontrado: ${actualClientName}`);
        } else {
          console.warn(`[Processor] Nome do cliente não encontrado na resposta da Lumibot para ${clientId}. Usando ID.`);
        }
      } catch (nameError: any) {
        console.error(`[Processor] Erro ao buscar nome do cliente ${clientId}: ${nameError.message}. Usando ID.`);
      }
      // **** FIM BUSCAR NOME ****

      const agora = Date.now();
      const lastClientMsgTime = followUp.last_client_message_at ? new Date(followUp.last_client_message_at).getTime() : 0;
      const isOutside24hWindow = (lastClientMsgTime === 0) || (agora - lastClientMsgTime >= (24 * 60 * 60 * 1000));

      console.log(`[Processor] FollowUp ${followUpId}, Cliente ${clientId}. Janela 24h: ${isOutside24hWindow ? 'FECHADA' : 'ABERTA'}. isHSM: ${isHSM}`);

      let sendMethod: 'HSM' | 'FREE_TEXT' | 'NONE' = 'NONE';

      if (isOutside24hWindow) {
        if (isHSM === true) { sendMethod = 'HSM'; }
        else { errorReason = `Falha: Tentativa envio não-HSM > 24h`; console.error(`[Processor] ERRO ENVIO: ${errorReason}`); }
      } else {
        if (isHSM === true) { sendMethod = 'HSM'; } else { sendMethod = 'FREE_TEXT'; }
      }

      let result: { success: boolean, responseData: any };

      if (sendMethod === 'HSM') {
        // Usar os dados recebidos via metadata
        if (!templateNameWhatsapp) { // Usa o nome HSM que veio do executeAIAction
          errorReason = "Falha HSM: Nome do template WhatsApp não fornecido nos metadados.";
          result = { success: false, responseData: { error: errorReason } };
        } else {
            // Passar os dados do template recebidos para a função de envio
            result = await enviarHSMLumibot(
                effectiveAccountId,
                clientId,
                effectiveToken,
                { // Objeto com dados do step/template
                    message_content: message, // Conteúdo base/final vindo do scheduleMessage
                    template_name: templateNameWhatsapp, // Nome HSM para a API
                    category: templateCategory || "UTILITY" // Categoria vinda do scheduleMessage
                },
                actualClientName // Nome real do cliente
            );
            if (!result.success) errorReason = `Falha API Lumibot (HSM): ${JSON.stringify(result.responseData)}`;
        }
      } else if (sendMethod === 'FREE_TEXT') {
        result = await enviarTextoLivreLumibot(effectiveAccountId, clientId, effectiveToken, message);
        if (!result.success) errorReason = `Falha API Lumibot (Texto Livre): ${JSON.stringify(result.responseData)}`;
      } else {
        result = { success: false, responseData: { error: errorReason } };
      }

      success = result.success;
      console.log(`[Processor] Resultado final do envio para msg ${messageDbId}: ${success ? 'SUCESSO' : 'FALHA'}. Razão: ${errorReason}`);
      return success;

    } catch (error) {
      const messageIdSuffix = metadata?.messageDbId ? `(Msg DB ID: ${metadata.messageDbId})` : '(ID msg BD desconhecido)';
      errorReason = `Erro CRÍTICO no processador Lumibot ${messageIdSuffix}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
      console.error(errorReason, error);
      // Pausar via updateFollowUpStatus é mais seguro aqui do que dentro do catch
      try {
        await updateFollowUpStatus(followUpId, 'paused', { paused_reason: errorReason });
      } catch (pauseError) {
        console.error(`Falha ao pausar follow-up ${followUpId} após erro no processador:`, pauseError);
      }
      return false; // Indica falha
    }
  } // Fim da função process
};
// --- Fim Objeto Processador ---
// --- Funções de Domínio (isCampaignInWorkspace, findActiveCampaignForWorkspace, etc.) ---
// Mantenha as outras funções que você já tinha aqui, elas são úteis.

/**
 * Verifica se uma campanha pertence a um workspace específico
 */
export async function isCampaignInWorkspace(
  campaignId: string,
  workspaceId: string
): Promise<boolean> {
  const count = await prisma.workspaceFollowUpCampaign.count({
    where: { workspace_id: workspaceId, campaign_id: campaignId }
  });
  return count > 0;
}

/**
 * Busca uma campanha ativa para um workspace
 */
export async function findActiveCampaignForWorkspace(
  workspaceId: string
): Promise<string | null> {
  const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
    where: { workspace_id: workspaceId },
    select: { campaign_id: true }
  });
  if (workspaceCampaigns.length === 0) return null;
  const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);
  const defaultCampaign = await prisma.followUpCampaign.findFirst({
    where: { id: { in: campaignIds }, active: true },
    orderBy: { created_at: 'desc' },
    select: { id: true }
  });
  return defaultCampaign?.id || null;
}

/**
 * Busca um follow-up ativo ou pausado para um cliente e campanha específicos
 */
export async function findActiveFollowUp(
  clientId: string,
  campaignId: string
): Promise<any | null> { // Use um tipo mais específico se tiver
  return await prisma.followUp.findFirst({
    where: {
      client_id: clientId,
      campaign_id: campaignId,
      status: { in: ['active', 'paused'] }
    }
  });
}

/**
 * Inicia um novo follow-up (adaptado para o novo paradigma)
 */
export async function initializeNewFollowUp(
  clientId: string,
  campaignId: string,
  workspaceId?: string | null
): Promise<any> {
  // Remover a transação explícita daqui pode simplificar e resolver.
  // O Prisma geralmente gerencia transações implícitas para operações sequenciais.
  // Tentativa SEM transação explícita:

  try {
    const campaign = await prisma.followUpCampaign.findUnique({
      where: { id: campaignId },
      include: { stages: { orderBy: { order: 'asc' }, take: 1 } }
    });
    if (!campaign) throw new Error(`Campanha ${campaignId} não encontrada.`);
    const initialStage = campaign.stages[0];
    if (!initialStage) throw new Error(`Campanha ${campaignId} não possui estágios.`);

    const initialEvaluationDelayMs = 5000;
    const initialEvaluationTime = new Date(Date.now() + initialEvaluationDelayMs);

    // 1. Criar o FollowUp PRIMEIRO
    const newFollowUp = await prisma.followUp.create({
      data: {
        campaign_id: campaignId,
        client_id: clientId,
        status: "active",
        current_stage_id: initialStage.id,
        started_at: new Date(),
        next_evaluation_at: initialEvaluationTime,
        waiting_for_response: false,
      }
    });
    console.log(`Novo FollowUp ${newFollowUp.id} criado para cliente ${clientId}. Estágio: ${initialStage.name}.`);

    // 2. Criar a Mensagem de Sistema DEPOIS, usando o ID confirmado
    await createSystemMessage(
      newFollowUp.id, // Usar o ID que sabemos que foi criado
      `Follow-up iniciado no estágio "${initialStage.name}" (Workspace: ${workspaceId || 'N/A'}). Próxima avaliação agendada.`
    );

    // 3. Agendar a Primeira Avaliação DEPOIS de tudo criado
    const { scheduleNextEvaluation_V2 } = await import('../_lib/scheduler');
    await scheduleNextEvaluation_V2(newFollowUp.id, initialEvaluationDelayMs, "Início do FollowUp");

    return newFollowUp; // Retornar o objeto criado

  } catch (error) {
    console.error(`Erro CRÍTICO ao inicializar novo follow-up para cliente ${clientId}:`, error);
    // É importante relançar o erro aqui para que a rota POST /api/follow-up saiba que falhou
    throw error;
  }
}


// **** A FUNÇÃO ESTÁ AQUI ****
/**
 * Busca os detalhes de uma campanha específica com seus estágios e passos
 */
export async function getCampaignDetails( // <-- JÁ TEM EXPORT
  campaignId: string
): Promise<any> {
  const campaign = await prisma.followUpCampaign.findUnique({
    where: { id: campaignId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: { // Incluir passos dentro de cada estágio
          steps: {
            orderBy: [{ order: 'asc' }, { wait_time_ms: 'asc' }]
          }
        }
      }
    }
  });

  if (!campaign) {
    throw new Error("Campanha não encontrada");
  }

  // Formatar a resposta para o formato esperado (incluindo todos os passos achatados)
  const allStepsFormatted: any[] = [];
  campaign.stages.forEach(stage => {
    stage.steps.forEach(step => {
      allStepsFormatted.push({
        id: step.id,
        // Dados do Passo
        name: step.name,
        template_name: step.template_name,
        template_name_whatsapp: step.template_name_whatsapp,
        wait_time: step.wait_time,
        wait_time_ms: step.wait_time_ms,
        message_content: step.message_content,
        category: step.category,
        order: step.order,
        // Dados do Estágio associado
        stage_id: stage.id,
        stage_name: stage.name,
        stage_order: stage.order,
        // Outros campos que a UI espera
        message: step.message_content, // Alias comum
      });
    });
  });

  // Ordenar a lista achatada final pela ordem do estágio e depois pela ordem do passo/tempo
  allStepsFormatted.sort((a, b) => {
    if (a.stage_order !== b.stage_order) {
      return a.stage_order - b.stage_order;
    }
    if (a.order !== b.order) { // Usar a ordem do passo se definida
      return a.order - b.order;
    }
    return a.wait_time_ms - b.wait_time_ms; // Fallback para tempo
  });


  // Estruturar a resposta final
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    active: campaign.active,
    idLumibot: campaign.idLumibot,
    tokenAgentLumibot: campaign.tokenAgentLumibot,
    steps: allStepsFormatted, // Lista achatada e ordenada de todos os passos
    stages: campaign.stages.map(s => ({ // Lista dos estágios (sem os passos aninhados aqui)
      id: s.id,
      name: s.name,
      order: s.order,
      description: s.description,
      requires_response: s.requires_response
    }))
  };
}
// **** FIM DA FUNÇÃO ****

