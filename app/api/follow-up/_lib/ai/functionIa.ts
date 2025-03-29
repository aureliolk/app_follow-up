// app/api/follow-up/_lib/ai/functionIa.ts

import { prisma } from '@/lib/db';
import { generateChatCompletion } from '@/lib/ai/chatService';
import { CoreMessage } from 'ai';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- Tipagens para Ações da IA ---
interface AIActionBase {
  action_type: 'SEND_MESSAGE' | 'CHANGE_STAGE' | 'SCHEDULE_EVALUATION' | 'PAUSE' | 'REQUEST_HUMAN_REVIEW' | 'COMPLETE';
  reason: string; // Explicação da IA para a decisão
}

interface SendMessageAction extends AIActionBase {
  action_type: 'SEND_MESSAGE';
  content_source: 'generate' | 'template'; // 'generate' para criar nova msg, 'template' para usar/personalizar
  template_name?: string; // Nome do template base (FollowUpStep.template_name), se content_source for 'template'
  is_hsm: boolean; // O sistema de envio usará isso para chamar a API correta (HSM ou texto livre)
  delay_ms?: number; // Atraso em milissegundos antes de agendar o envio (ex: 5000 para 5s)
}

interface ChangeStageAction extends AIActionBase {
  action_type: 'CHANGE_STAGE';
  target_stage_id: string; // ID do estágio de destino (FollowUpFunnelStage.id)
}

interface ScheduleEvaluationAction extends AIActionBase {
  action_type: 'SCHEDULE_EVALUATION';
  delay_ms: number; // Tempo em milissegundos até a IA reavaliar este follow-up
}

interface PauseAction extends AIActionBase {
  action_type: 'PAUSE';
  // 'reason' já está em AIActionBase
}

interface RequestHumanReviewAction extends AIActionBase {
  action_type: 'REQUEST_HUMAN_REVIEW';
  // 'reason' já está em AIActionBase
}

interface CompleteAction extends AIActionBase {
  action_type: 'COMPLETE';
  // 'reason' já está em AIActionBase
}

// Union Type para o retorno da função principal
export type AIAction = SendMessageAction | ChangeStageAction | ScheduleEvaluationAction | PauseAction | RequestHumanReviewAction | CompleteAction;

// Ação padrão segura em caso de erro na IA ou parsing
const defaultAIAction: ScheduleEvaluationAction = {
  action_type: 'SCHEDULE_EVALUATION',
  reason: 'Erro na análise da IA ou formato de resposta inválido. Agendando reavaliação em 1 hora.',
  delay_ms: 60 * 60 * 1000 // 1 hora
};
// --- Fim das Tipagens ---

// Função Principal de Decisão da IA (Refinada)
export async function determineNextAction(followUpId: string): Promise<AIAction> {
  try {
    console.log(`🧠 Iniciando determinação de próxima ação para FollowUp ${followUpId}`);

    // 1. Buscar Contexto Abrangente (incluir a última mensagem enviada PELO SISTEMA)
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: {
          include: {
            stages: {
              orderBy: { order: 'asc' },
              include: {
                steps: { // Inclui os templates/passos de cada estágio
                  orderBy: { order: 'asc' } // ou wait_time_ms
                }
              }
            }
          }
        },
        messages: { // <<< Aumentar um pouco e buscar a última do sistema
          orderBy: { sent_at: 'desc' }, // Mais recentes primeiro
          take: 20 // Aumentar para garantir pegar a última do sistema
        },
        ai_analyses: { // Última análise feita
          orderBy: { created_at: 'desc' },
          take: 1
        }
      }
    });

    // Validação inicial
    if (!followUp) {
      console.error(`FollowUp ${followUpId} não encontrado para determinar ação.`);
      return { ...defaultAIAction, reason: `FollowUp ID ${followUpId} não encontrado.` };
    }
    if (!followUp.campaign) {
      console.error(`Campanha associada ao FollowUp ${followUpId} não encontrada.`);
      return { ...defaultAIAction, action_type: 'PAUSE', reason: `Campanha não encontrada.` };
    }
    if (!followUp.current_stage_id) {
      console.warn(`FollowUp ${followUpId} não tem um estágio atual definido.`);
      const firstStage = followUp.campaign.stages[0];
      if (firstStage) {
        await prisma.followUp.update({ where: { id: followUpId }, data: { current_stage_id: firstStage.id } });
        followUp.current_stage_id = firstStage.id;
        console.log(`Definido estágio inicial ${firstStage.name} para FollowUp ${followUpId}.`);
      } else {
        return { ...defaultAIAction, action_type: 'PAUSE', reason: `FollowUp sem estágio atual e campanha sem estágios.` };
      }
    }

    // 2. Preparar Informações para o Prompt
    const currentStage = followUp.campaign.stages.find(s => s.id === followUp.current_stage_id);
    if (!currentStage) {
      console.error(`Estágio atual ID ${followUp.current_stage_id} não encontrado nos estágios da campanha ${followUp.campaign.id}.`);
      return { ...defaultAIAction, action_type: 'PAUSE', reason: `Estágio atual ID ${followUp.current_stage_id} inválido.` };
    }

    // Encontrar a última mensagem enviada PELO SISTEMA
    const lastSystemMessage = followUp.messages.find(msg => !msg.is_from_client);
    const lastSentTemplateName = lastSystemMessage?.template_used;
    const lastSentTime = lastSystemMessage?.sent_at;
    const timeSinceLastSentMs = lastSentTime ? Date.now() - new Date(lastSentTime).getTime() : Infinity;

    // Encontrar o wait_time_ms do último template enviado, se aplicável
    let waitTimeAfterLastSentMs = 0;
    if (lastSentTemplateName) {
      // Buscar o step correspondente no estágio atual
      const lastSentStepData = await prisma.followUpStep.findFirst({
        where: {
          template_name: lastSentTemplateName,
          funnel_stage_id: currentStage.id
        },
        select: { wait_time_ms: true }
      });
      waitTimeAfterLastSentMs = lastSentStepData?.wait_time_ms || 0;
    }
    const timeRemainingMs = waitTimeAfterLastSentMs - timeSinceLastSentMs;
    // Considera que passou se for 0 ou negativo, ou se nunca houve envio/espera
    const hasWaitTimePassed = waitTimeAfterLastSentMs <= 0 || timeRemainingMs <= 0;

    // Formatar tempo desde a última enviada
    const formattedTimeSinceSent = lastSentTime
      ? formatDistanceToNowStrict(new Date(lastSentTime), { addSuffix: true, locale: ptBR })
      : 'nunca';

    // Informações da Janela 24h e Última Mensagem do Cliente
    const agora = Date.now();
    const lastClientMsgTime = followUp.last_client_message_at ? new Date(followUp.last_client_message_at).getTime() : 0;
    const timeSinceLastClientMessageMs = lastClientMsgTime > 0 ? agora - lastClientMsgTime : Infinity;
    const isOutside24hWindow = (lastClientMsgTime === 0) || timeSinceLastClientMessageMs >= (24 * 60 * 60 * 1000); // >= 24h é FORA
    const formattedTimeSinceClient = lastClientMsgTime > 0
      ? formatDistanceToNowStrict(new Date(lastClientMsgTime), { addSuffix: true, locale: ptBR })
      : 'nunca';

    // Histórico da Conversa
    const history = followUp.messages
      .slice(0, 15) // Limitar histórico recente
      .reverse() // Ordenar do mais antigo para mais novo
      .map(msg => {
        const prefix = msg.is_from_client ? 'Cliente' : 'Assistente (Alex)';
        // Incluir detalhes importantes como template e status
        const suffix = !msg.is_from_client ? ` (Template: ${msg.template_used || 'Gerado'}; Status: ${msg.delivered ? 'Entregue' : (msg.error_sending ? 'Falha' : 'Enviando')})` : '';
        return `${prefix}: ${msg.content?.substring(0, 100)}${msg.content && msg.content.length > 100 ? '...' : ''}${suffix}`;
      }).join('\n');

    // Última Análise de IA
    const lastAnalysis = followUp.ai_analyses[0];
    const formattedAnalysis = lastAnalysis ? `Análise da última resposta do cliente: Sentimento=${lastAnalysis.sentiment}, Intenção=${lastAnalysis.intent}` : 'Nenhuma análise recente.';

    // Lista de Templates do Estágio Atual
    const currentStageTemplates = currentStage.steps || [];


    // 3. Construir o Prompt Detalhado para a IA (*** REFINADO ***)
    const systemPrompt = `
    Você é "Alex", um assistente especialista em follow-ups via WhatsApp. Seu objetivo é guiar o cliente pela campanha "${followUp.campaign.name}", respeitando o contexto e as regras.

    OBJETIVO GERAL: ${followUp.campaign.description || 'Engajar e converter o cliente.'}
    OBJETIVO DO ESTÁGIO ATUAL "${currentStage.name}": ${currentStage.description || 'Não especificado.'}

    CONTEXTO ATUAL (Cliente ID: ${followUp.client_id}):
    - Estágio: ${currentStage.name} (Ordem: ${currentStage.order})
    - Última Mensagem do Cliente: ${formattedTimeSinceClient}
    - Janela 24h WhatsApp: ${isOutside24hWindow ? '**FECHADA (> 24h)**' : 'ABERTA (< 24h)'}
    - ${formattedAnalysis}
    - Última Mensagem ENVIADA por VOCÊ (Alex): ${lastSentTemplateName ? `Template "${lastSentTemplateName}" enviado ${formattedTimeSinceSent}.` : 'Nenhuma mensagem enviada ainda.'}
    - Tempo de Espera Padrão APÓS '${lastSentTemplateName || 'última msg'}': ${waitTimeAfterLastSentMs > 0 ? (waitTimeAfterLastSentMs / 1000 / 60).toFixed(1) + ' minutos' : 'N/A'}
    - Status da Espera Atual: ${waitTimeAfterLastSentMs > 0 ? (hasWaitTimePassed ? '**TEMPO CONCLUÍDO**' : `**AGUARDANDO** (faltam aprox. ${(timeRemainingMs / 1000 / 60).toFixed(1)} min)`) : 'N/A (Pode agir)'}

    HISTÓRICO RECENTE (Últimas ~15 mensagens, mais recentes no final):
    ${history || 'Nenhuma mensagem ainda.'}

    TEMPLATES DISPONÍVEIS NESTE ESTÁGIO (${currentStage.name}):
    ${currentStageTemplates.length > 0 ? currentStageTemplates.map(t => `- Nome: "${t.template_name}" (HSM: ${t.is_hsm}, Espera Padrão: ${(t.wait_time_ms / 1000 / 60).toFixed(1)} min)`).join('\n') : 'Nenhum template definido para este estágio.'}

    REGRAS CRÍTICAS - SIGA ESTRITAMENTE:
    1.  **REGRA MAIS IMPORTANTE - JANELA 24H FECHADA:** Se "Janela 24h WhatsApp" for **FECHADA**, a **ÚNICA** ação de envio permitida é \'SEND_MESSAGE\' com \'content_source: "template"\', **obrigatoriamente '"is_hsm": true'**, e um \'template_name\' da lista que tenha "HSM: true". É **ABSOLUTAMENTE PROIBIDO** retornar \'"is_hsm": false\' ou \'content_source: "generate"\' quando a janela estiver FECHADA. Se não houver template HSM adequado, retorne \'SCHEDULE_EVALUATION\' ou \'PAUSE\'. **VERIFIQUE A JANELA ANTES DE QUALQUER DECISÃO DE ENVIO.**
    2.  **JANELA 24H ABERTA:**
        *   SE cliente interagiu diretamente: Use \"SEND_MESSAGE\" com \"content_source: "generate"\" e **obrigatoriamente ""is_hsm": false"**. Depois, agende \"SCHEDULE_EVALUATION\" (delay curto).
        *   SE for seguir fluxo padrão: Pode usar \"SEND_MESSAGE\" com \"content_source: "template"\" (use \"is_hsm\" do template).
    3.  **RESPEITE O TEMPO DE ESPERA (Status da Espera Atual):**
        *   SE "Status da Espera" for **AGUARDANDO**: Sua ÚNICA opção é \"action_type: "SCHEDULE_EVALUATION"\". Use \"delay_ms\" restante (aprox. ${timeRemainingMs > 0 ? timeRemainingMs : 60000} ms). **NÃO ENVIE NADA.**
        *   SE "Status da Espera" for **TEMPO CONCLUÍDO** ou N/A: Pode enviar a *próxima* mensagem do fluxo.
    4.  **NÃO REPITA MENSAGENS:** Se a "Última Mensagem ENVIADA por VOCÊ" foi "X", não envie "X" novamente agora. Envie o *próximo* template ou gere uma resposta.
    5.  **TIMING DA AÇÃO:**
        *   Ao enviar um template do fluxo (\"content_source: "template"\"): NÃO inclua "delay_ms" na ação "SEND_MESSAGE". O sistema usará a "Espera Padrão" do template para agendar a próxima avaliação.
        *   Ao gerar uma resposta (\"content_source: "generate"\"): Use \"SCHEDULE_EVALUATION\" com delay CURTO (ex: 60000-300000 ms) após o envio da sua resposta gerada.
    6.  **HUMANIZAÇÃO, PROGRESSÃO, NÃO INCOMODAR, DÚVIDAS:** (Manter regras originais - aja como Alex, tente progredir, não incomode, peça ajuda se confuso).

    SUA TAREFA:
    Analise TODO o contexto (status da espera, janela 24h, histórico, última análise) e decida a PRÓXIMA MELHOR AÇÃO. Retorne **APENAS UM ÚNICO OBJETO JSON VÁLIDO**, seguindo a estrutura e regras. Lembre-se: inclua '"is_hsm": false' se usar '"content_source": "generate"'.

    Estrutura JSON:
    - "action_type": (Obrigatório) "SEND_MESSAGE", "CHANGE_STAGE", "SCHEDULE_EVALUATION", "PAUSE", "REQUEST_HUMAN_REVIEW", "COMPLETE".
    - "reason": (Obrigatório) Sua justificativa clara.
    - Campos Adicionais:
        - Se "SEND_MESSAGE": inclua "content_source", "is_hsm", e "template_name" (se source="template").
        - Se "SCHEDULE_EVALUATION": **SEMPRE** inclua "delay_ms".
        - Se "CHANGE_STAGE": inclua "target_stage_id".

    Qual a próxima ação (apenas o JSON)?
    `;


    // 4. Chamar a IA
    console.log(`FollowUp ${followUpId}: Enviando prompt para IA...`);
    const aiResponseString = await generateChatCompletion({
      messages: [{ role: 'user', content: `Cliente: ${followUp.client_id}, Estágio: ${currentStage.name}. Última resposta: ${followUp.last_response || 'Nenhuma'}. Qual a próxima ação?` }], // Prompt do usuário mais informativo
      systemPrompt: systemPrompt
    });

    // 5. Parse e Validar a Resposta da IA (*** VALIDAÇÃO REFINADA ***)
    console.log(`FollowUp ${followUpId}: Resposta bruta da IA: ${aiResponseString}`);
    let aiDecision: AIAction;
    try {
      const cleanResponse = aiResponseString.replace(/^```json\s*|```$/g, '').trim();
      aiDecision = JSON.parse(cleanResponse);

      // <<< CORREÇÃO FORÇADA de is_hsm para TEMPLATE fora da janela 24h >>>
      if (isOutside24hWindow && aiDecision.action_type === 'SEND_MESSAGE' && aiDecision.content_source === 'template') {
        if (aiDecision.is_hsm === false || aiDecision.is_hsm === undefined || aiDecision.is_hsm === null) {
          console.warn(`FollowUp ${followUpId}: IA sugeriu/esqueceu is_hsm fora da janela 24h para template. FORÇANDO para true.`);
          (aiDecision as SendMessageAction).is_hsm = true;
        }
      }

      // <<< CORREÇÃO/GARANTIA de is_hsm para GENERATE (NOVO) >>>
      if (aiDecision.action_type === 'SEND_MESSAGE' && aiDecision.content_source === 'generate') {
        if (aiDecision.is_hsm !== false) { // Se não for explicitamente false (seja true, undefined, null)
          console.warn(`FollowUp ${followUpId}: IA usou 'generate' mas is_hsm não era 'false'. FORÇANDO para false.`);
          (aiDecision as SendMessageAction).is_hsm = false; // Garante que seja false
        }
      }
      // <<< FIM DA CORREÇÃO/GARANTIA PARA GENERATE >>>

      // Validação Principal (agora deve passar para ambos os casos corrigidos)
      if (!aiDecision.action_type || typeof aiDecision.reason !== 'string') { /*...*/ }
      switch (aiDecision.action_type) {
        case 'SEND_MESSAGE':
          if (!['generate', 'template'].includes(aiDecision.content_source)) { /*...*/ }
          // A validação de 'is_hsm' ser boolean AINDA É IMPORTANTE aqui como salvaguarda final
          if (typeof aiDecision.is_hsm !== 'boolean') {
            throw new Error('Parâmetro "is_hsm" (boolean) é obrigatório para SEND_MESSAGE (após correções).');
          }
          // ... resto da validação ...
          break;
        // ... outros cases ...
      }

      console.log(`FollowUp ${followUpId}: Decisão da IA (pós-correções) validada:`, aiDecision);
      return aiDecision;

    } catch (parseOrValidationError) {
      console.error(`FollowUp ${followUpId}: Erro ao parsear ou validar JSON da IA:`, parseOrValidationError, `\nResposta recebida:\n${aiResponseString}`);
      // Retorna ação de fallback
      return { ...defaultAIAction, reason: `Erro processando resposta IA (${parseOrValidationError instanceof Error ? parseOrValidationError.message : 'Formato inválido'}). Agendando reavaliação.` };
    }

  } catch (error) {
    console.error(`Erro GERAL em determineNextAction para FollowUp ${followUpId}:`, error);
    // Retorna ação de fallback
    return { ...defaultAIAction, reason: `Erro interno (${error instanceof Error ? error.message : 'Erro desconhecido'}). Agendando reavaliação.` };
  }
}

// Função para analisar respostas do cliente com IA (Refatorada)
export async function analyzeClientResponse(
  clientId: string,
  messageContent: string, // Renomeado de 'message' para clareza
  followUpId: string
): Promise<AIAnalysisResult> {
  try {
    console.log(`Iniciando análise de IA para cliente ${clientId}, followUp ${followUpId}`);
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: { include: { stages: { orderBy: { order: 'asc' } } } },
        messages: { orderBy: { sent_at: 'desc' }, take: 5 }
      }
    });

    if (!followUp || !followUp.campaign) {
      console.error(`Follow-up ${followUpId} ou campanha associada não encontrados.`);
      return defaultAnalysisResult;
    }

    const lastNonClientMessage = await prisma.followUpMessage.findFirst({
      where: { follow_up_id: followUpId, is_from_client: false },
      orderBy: { sent_at: 'desc' }
    });
    const messageId = lastNonClientMessage?.id; // ID da *nossa* mensagem à qual o cliente pode estar respondendo

    const conversationHistory: CoreMessage[] = followUp.messages
      .map(msg => ({
        role: msg.is_from_client ? 'user' : 'assistant',
        content: msg.content || '' // Garantir que content não seja null
      }))
      .reverse(); // Ordem cronológica (mais antigo primeiro)

    const stagesInfo = followUp.campaign.stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      order: stage.order,
      isCurrent: stage.id === followUp.current_stage_id
    }));
    const currentStageName = stagesInfo.find(s => s.isCurrent)?.name || 'Desconhecido';

    // Prompt de Sistema claro pedindo JSON
    const systemPrompt = `Analise a última mensagem do cliente no contexto da conversa.
Retorne SOMENTE um objeto JSON válido com as seguintes chaves:
- "sentiment": ("positive", "neutral", "negative") - O sentimento predominante da mensagem do cliente.
- "intent": (string) - A intenção principal do cliente (ex: "pedir_informacao", "mostrar_interesse", "reclamar", "agendar_reuniao", "desinteresse"). Seja específico.
- "topics": (array de strings) - Os principais tópicos ou palavras-chave mencionados pelo cliente.
- "nextAction": (string) - Sugestão de próxima ação INTERNA para o sistema ou atendente (ex: "responder_duvida", "agendar_demonstracao", "ignorar_seguir_fluxo", "escalar_atendimento").
- "suggestedStage": (string, opcional) - O ID do estágio para o qual o cliente deveria ser movido, se aplicável. Retorne apenas se houver forte indicação para mudança.

Contexto adicional:
- Cliente ID: ${clientId}
- Estágio atual do Funil: ${currentStageName}
- Estágios disponíveis: ${stagesInfo.map(s => s.name).join(', ')}
`;

    // Mensagens para a IA (Histórico + Mensagem atual do cliente)
    const messages: CoreMessage[] = [
      ...conversationHistory,
      {
        role: 'user', // A mensagem que estamos analisando
        content: messageContent
      }
    ];

    // Chamar diretamente o serviço de IA
    const aiResponseString = await generateChatCompletion({ messages, systemPrompt: systemPrompt }); // Passando system separado

    // Tentar fazer o parse da resposta JSON
    let aiAnalysis: AIAnalysisResult;
    try {
      aiAnalysis = JSON.parse(aiResponseString);
      // Validação básica do formato esperado
      if (typeof aiAnalysis.sentiment !== 'string' || typeof aiAnalysis.intent !== 'string' || !Array.isArray(aiAnalysis.topics)) {
        throw new Error("Formato JSON da análise de IA inválido.");
      }
      console.log(`Análise de IA recebida para ${followUpId}:`, aiAnalysis);
    } catch (parseError) {
      console.error("Erro ao fazer parse da resposta JSON da IA (análise):", parseError, "Resposta recebida:", aiResponseString);
      return defaultAnalysisResult; // Retorna padrão se o JSON for inválido
    }

    // Salvar a análise no banco de dados (se o parse foi bem-sucedido)
    const savedAnalysis = await prisma.followUpAIAnalysis.create({
      data: {
        follow_up_id: followUpId,
        message_id: messageId, // Pode ser null se não houver mensagem anterior do sistema
        sentiment: aiAnalysis.sentiment,
        intent: aiAnalysis.intent,
        topics: aiAnalysis.topics || [],
        next_action: aiAnalysis.nextAction, // Usar a chave correta do JSON
        suggested_stage: aiAnalysis.suggestedStage // Usar a chave correta do JSON
      }
    });
    console.log(`Análise de IA salva com ID ${savedAnalysis.id} para followUp ${followUpId}`);

    return aiAnalysis;

  } catch (error) {
    console.error(`Erro na função analyzeClientResponse para followUp ${followUpId}:`, error);
    return defaultAnalysisResult; // Retorna padrão em caso de erro geral
  }
}

// Função para personalizar conteúdo de mensagens com IA (Já refatorada, sem alterações aqui)
export async function personalizeMessageContent(
  originalMessage: string,
  clientId: string,
  followUpId: string,
  metadata: any // Contém informações como stage_name, category, etc.
): Promise<string> {
  try {
    console.log(`Personalizando mensagem para cliente ${clientId}, followUp ${followUpId}`);
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        messages: { orderBy: { sent_at: 'desc' }, take: 5 },
        ai_analyses: { orderBy: { created_at: 'desc' }, take: 3 }
      }
    });

    if (!followUp) {
      console.warn(`Follow-up ${followUpId} não encontrado para personalização. Usando mensagem original.`);
      return originalMessage;
    }

    const clientMessagesContent = followUp.messages
      .filter(msg => msg.is_from_client)
      .map(msg => msg.content || ''); // Garantir strings

    const recentAnalysesSummary = followUp.ai_analyses.map(analysis => ({
      sentiment: analysis.sentiment,
      intent: analysis.intent,
      topics: analysis.topics?.join(', ') || 'N/A' // Usar ?. e fallback
    }));

    const lastClientMessageContent = followUp.messages
      .filter(msg => msg.is_from_client)
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0]?.content || 'Sem resposta recente';


    // Prompt de Sistema para personalização
    const systemPrompt = `Você é um assistente de vendas especialista em follow-up.
Sua função é REESCREVER e PERSONALIZAR mensagens para torná-las mais relevantes, naturais e engajadoras, como se um humano estivesse escrevendo.

REGRAS IMPORTANTES:
1. Mantenha o TOM e a INTENÇÃO ORIGINAL da mensagem.
2. NÃO adicione informações novas que não estavam implícitas. FOQUE em adaptar a linguagem.
3. Use um tom profissional, amigável e conversacional.
4. Personalize sutilmente com base no histórico e contexto do cliente, se relevante, mas sem parecer repetitivo.
5. NUNCA mencione que você é uma IA ou assistente virtual.
6. Mantenha a mensagem CONCISA, idealmente com tamanho similar à original.
7. Se a mensagem original contém placeholders como {{nome}}, mantenha-os ou adapte-os contextualmente se souber o valor (ex: use o client ID se for o caso).
8. Retorne APENAS o texto da mensagem personalizada, sem nenhuma explicação adicional.`;

    // Mensagem do usuário com o contexto e a mensagem original
    const userPrompt = `Mensagem original a personalizar:
"${originalMessage}"

Contexto do Cliente (ID: ${clientId}):
- Estágio atual: ${metadata?.stage_name || 'Desconhecido'}
- Categoria da mensagem: ${metadata?.category || 'Geral'}
- Histórico recente de mensagens DO CLIENTE:
${clientMessagesContent.length > 0 ? clientMessagesContent.map(m => `- ${m}`).join('\n') : 'Nenhuma mensagem anterior do cliente.'}
- Última resposta DO CLIENTE: ${lastClientMessageContent}
- Análises recentes (sentimento/intenção):
${recentAnalysesSummary.length > 0 ? JSON.stringify(recentAnalysesSummary, null, 2) : 'Nenhuma análise disponível.'}

Reescreva a mensagem original de forma personalizada e natural para este cliente.`;

    const messages: CoreMessage[] = [{ role: 'user', content: userPrompt }];

    // Chamar diretamente o serviço de IA
    const personalizedMessage = await generateChatCompletion({ messages, systemPrompt: systemPrompt });

    console.log(`Mensagem original: "${originalMessage}"`);
    console.log(`Mensagem personalizada para ${followUpId}: "${personalizedMessage.trim()}"`);
    return personalizedMessage.trim();

  } catch (error) {
    console.error(`Erro ao personalizar mensagem com IA para followUp ${followUpId}:`, error);
    return originalMessage; // Retorna original em caso de erro
  }
}

// Função: Gerar resposta dinamicamente pela IA (Refatorada)
export async function generateAIResponse(
  clientId: string,
  clientMessage: string,
  followUpId: string,
  stageInfo: any // Informações sobre o propósito do estágio atual
): Promise<string> {
  try {
    console.log(`Gerando resposta de IA para cliente ${clientId}, followUp ${followUpId}`);
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: { include: { stages: { orderBy: { order: 'asc' } } } },
        messages: { orderBy: { sent_at: 'asc' }, take: 10 }, // Histórico cronológico
        ai_analyses: { orderBy: { created_at: 'desc' }, take: 1 }
      }
    });

    if (!followUp || !followUp.campaign) {
      console.error(`Follow-up ${followUpId} ou campanha não encontrados para gerar resposta.`);
      return "Desculpe, não consegui processar sua solicitação no momento. Nosso time entrará em contato.";
    }

    const currentStage = followUp.campaign.stages.find(s => s.id === followUp.current_stage_id);
    const currentStageIndex = followUp.campaign.stages.findIndex(s => s.id === followUp.current_stage_id);
    const nextStage = currentStageIndex >= 0 && currentStageIndex < followUp.campaign.stages.length - 1
      ? followUp.campaign.stages[currentStageIndex + 1]
      : null;

    const messageHistory: CoreMessage[] = followUp.messages.map(msg => ({
      role: msg.is_from_client ? 'user' : 'assistant',
      content: msg.content || ''
    }));

    const recentAnalysis = followUp.ai_analyses[0];

    // Prompt de Sistema para Geração de Resposta
    const systemPrompt = `Você é um representante de vendas/suporte humano, chamado Alex. Sua tarefa é responder às mensagens dos clientes de forma natural, útil e com o objetivo de avançar a conversa no funil de vendas/follow-up.

REGRAS ESSENCIAIS:
1. Aja como um HUMANO (Alex), NUNCA mencione ser uma IA.
2. Objetivo principal: Engajar o cliente e, se apropriado, movê-lo para o próximo passo ou estágio.
3. Tom: Conversacional, amigável, profissional, empático e prestativo.
4. Concisão: Respostas curtas e diretas (2-4 frases geralmente).
5. Personalização: Use o contexto da conversa para tornar a resposta relevante.
6. Ação: Se o cliente fizer pergunta, responda. Se mostrar interesse, incentive o próximo passo. Se tiver objeção, trate-a com empatia.
7. Evite linguagem robótica ou excessivamente formal. Use contrações (ex: "você pode", "estou aqui").
8. Se não tiver certeza ou informação, diga que vai verificar ou que um especialista entrará em contato. NÃO INVENTE detalhes técnicos complexos.
9. Retorne APENAS o texto da resposta, sem explicações.`;

    // Mensagem do usuário com contexto para a IA
    const userPrompt = `CONTEXTO DA CONVERSA:
- Campanha: ${followUp.campaign.name || 'N/A'}
- Cliente ID: ${clientId}
- Estágio Atual: ${currentStage?.name || 'Desconhecido'} (Propósito: ${stageInfo?.purpose || 'Engajamento'})
- Próximo Estágio Potencial: ${nextStage?.name || 'Finalização/Nenhum'}
- Análise da Última Mensagem do Cliente: Sentimento=${recentAnalysis?.sentiment || 'N/A'}, Intenção=${recentAnalysis?.intent || 'N/A'}

HISTÓRICO DA CONVERSA (Últimas mensagens):
${messageHistory.map(m => `${m.role === 'user' ? 'Cliente' : 'Alex (Você)'}: ${m.content}`).join('\n')}

ÚLTIMA MENSAGEM DO CLIENTE: "${clientMessage}"

Sua Tarefa (Como Alex): Responda à última mensagem do cliente de forma natural e útil, considerando o contexto e o objetivo de avançar a conversa.`;

    // Não precisamos incluir o histórico novamente aqui se já está no prompt do usuário
    const messagesForAI: CoreMessage[] = [{ role: 'user', content: userPrompt }];

    // Chamar diretamente o serviço de IA
    const aiGeneratedResponse = await generateChatCompletion({
      messages: messagesForAI,
      systemPrompt: systemPrompt
    });

    console.log(`Resposta de IA gerada para ${followUpId}: "${aiGeneratedResponse.trim()}"`);
    return aiGeneratedResponse.trim();

  } catch (error) {
    console.error(`Erro ao gerar resposta com IA para followUp ${followUpId}:`, error);
    return "Obrigado por sua mensagem! Recebemos sua solicitação e um de nossos consultores entrará em contato em breve para ajudá-lo."; // Mensagem segura
  }
}
