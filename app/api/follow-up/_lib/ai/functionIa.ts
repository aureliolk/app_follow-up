// app/api/follow-up/_lib/ai/functionIa.ts

import { prisma } from '@/lib/db';
import { generateChatCompletion } from '@/lib/ai/chatService';
import { CoreMessage } from 'ai';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- Tipagens para Ações da IA ---
interface AIActionBase {
  action_type: 'SEND_MESSAGE' | 'CHANGE_STAGE' | 'SCHEDULE_EVALUATION' | 'PAUSE' | 'REQUEST_HUMAN_REVIEW' | 'COMPLETE';
  reason: string;
}
interface SendMessageAction extends AIActionBase {
  action_type: 'SEND_MESSAGE';
  content_source: 'generate' | 'template';
  template_name?: string;
  is_hsm: boolean;
  delay_ms?: number;
}
interface ChangeStageAction extends AIActionBase {
  action_type: 'CHANGE_STAGE';
  target_stage_id: string;
}
interface ScheduleEvaluationAction extends AIActionBase {
  action_type: 'SCHEDULE_EVALUATION';
  delay_ms: number;
}
interface PauseAction extends AIActionBase { action_type: 'PAUSE'; }
interface RequestHumanReviewAction extends AIActionBase { action_type: 'REQUEST_HUMAN_REVIEW'; }
interface CompleteAction extends AIActionBase { action_type: 'COMPLETE'; }
export type AIAction = SendMessageAction | ChangeStageAction | ScheduleEvaluationAction | PauseAction | RequestHumanReviewAction | CompleteAction;
const defaultAIAction: ScheduleEvaluationAction = {
  action_type: 'SCHEDULE_EVALUATION',
  reason: 'Erro na análise da IA ou formato de resposta inválido. Agendando reavaliação em 1 hora.',
  delay_ms: 60 * 60 * 1000
};

interface AIAnalysisResult {
  sentiment: string;
  intent: string;
  topics: string[];
  nextAction?: string;
  suggestedStage?: string;
}
const defaultAnalysisResult: AIAnalysisResult = {
    sentiment: 'neutral', intent: 'unknown', topics: [], nextAction: 'review', suggestedStage: undefined
};

// --- Fim das Tipagens ---

// Função Principal de Decisão da IA (Com Ambas Correções Forçadas de HSM)
export async function determineNextAction(followUpId: string): Promise<AIAction> {
  try {
    console.log(`🧠 Iniciando determinação de próxima ação para FollowUp ${followUpId}`);
    const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: {
            campaign: {
                include: {
                    stages: {
                        orderBy: { order: 'asc' },
                        include: { steps: { orderBy: { order: 'asc' } } }
                    }
                }
            },
            messages: { orderBy: { sent_at: 'desc' }, take: 20 },
            ai_analyses: { orderBy: { created_at: 'desc' }, take: 1 }
        }
    });

    // Validações Iniciais
    if (!followUp) {
        console.error(`FollowUp ${followUpId} não encontrado.`);
        return { ...defaultAIAction, reason: `FollowUp ID ${followUpId} não encontrado.` };
    }
    if (!followUp.campaign) {
        console.error(`Campanha para ${followUpId} não encontrada.`);
        return { ...defaultAIAction, action_type: 'PAUSE', reason: `Campanha não encontrada.` };
    }
    if (!followUp.current_stage_id) {
        const firstStage = followUp.campaign.stages[0];
        if (firstStage) {
            await prisma.followUp.update({ where: { id: followUpId }, data: { current_stage_id: firstStage.id } });
            followUp.current_stage_id = firstStage.id;
            console.log(`Definido estágio inicial ${firstStage.name} para FollowUp ${followUpId}.`);
        } else {
            return { ...defaultAIAction, action_type: 'PAUSE', reason: `FollowUp sem estágio e campanha sem estágios.` };
        }
    }

    // Preparar Contexto para o Prompt
    const currentStage = followUp.campaign.stages.find(s => s.id === followUp.current_stage_id);
    if (!currentStage) {
        console.error(`Estágio atual ID ${followUp.current_stage_id} inválido.`);
        return { ...defaultAIAction, action_type: 'PAUSE', reason: `Estágio atual ID ${followUp.current_stage_id} inválido.` };
    }
    const lastSystemMessage = followUp.messages.find(msg => !msg.is_from_client);
    const lastSentTemplateName = lastSystemMessage?.template_used;
    const lastSentTime = lastSystemMessage?.sent_at;
    const timeSinceLastSentMs = lastSentTime ? Date.now() - new Date(lastSentTime).getTime() : Infinity;
    let waitTimeAfterLastSentMs = 0;
    if (lastSentTemplateName) {
        const lastSentStepData = await prisma.followUpStep.findFirst({
            where: { template_name: lastSentTemplateName, funnel_stage_id: currentStage.id },
            select: { wait_time_ms: true }
        });
        waitTimeAfterLastSentMs = lastSentStepData?.wait_time_ms || 0;
    }
    const timeRemainingMs = waitTimeAfterLastSentMs - timeSinceLastSentMs;
    const hasWaitTimePassed = waitTimeAfterLastSentMs <= 0 || timeRemainingMs <= 0;
    const formattedTimeSinceSent = lastSentTime ? formatDistanceToNowStrict(new Date(lastSentTime), { addSuffix: true, locale: ptBR }) : 'nunca';
    const agora = Date.now();
    const lastClientMsgTime = followUp.last_client_message_at ? new Date(followUp.last_client_message_at).getTime() : 0;
    const timeSinceLastClientMessageMs = lastClientMsgTime > 0 ? agora - lastClientMsgTime : Infinity;
    const isOutside24hWindow = (lastClientMsgTime === 0) || timeSinceLastClientMessageMs >= (24 * 60 * 60 * 1000);
    const formattedTimeSinceClient = lastClientMsgTime > 0 ? formatDistanceToNowStrict(new Date(lastClientMsgTime), { addSuffix: true, locale: ptBR }) : 'nunca';
    const history = followUp.messages.slice(0, 15).reverse().map(msg => { /* ... */ }).join('\n'); // Simplificado para brevidade
    const lastAnalysis = followUp.ai_analyses[0];
    const formattedAnalysis = lastAnalysis ? `Análise: Sentimento=${lastAnalysis.sentiment}, Intenção=${lastAnalysis.intent}` : 'Nenhuma análise.';
    const currentStageTemplates = currentStage.steps || [];

    // 3. Construir o Prompt (com reforços anteriores)
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
    - Espera Padrão Após '${lastSentTemplateName || 'última msg'}': ${waitTimeAfterLastSentMs > 0 ? (waitTimeAfterLastSentMs / 1000 / 60).toFixed(1) + ' minutos' : 'N/A'}
    - Status da Espera Atual: ${waitTimeAfterLastSentMs > 0 ? (hasWaitTimePassed ? '**TEMPO CONCLUÍDO**' : `**AGUARDANDO** (faltam aprox. ${(timeRemainingMs / 1000 / 60).toFixed(1)} min)`) : 'N/A (Pode agir)'}

    HISTÓRICO RECENTE (Últimas ~15 mensagens, mais recentes no final):
    ${history || 'Nenhuma mensagem ainda.'}

    TEMPLATES DISPONÍVEIS NESTE ESTÁGIO (${currentStage.name}):
    ${currentStageTemplates.length > 0 ? currentStageTemplates.map(t => `- Nome: "${t.template_name}" (HSM: ${t.is_hsm}, Espera Padrão: ${(t.wait_time_ms / 1000 / 60).toFixed(1)} min)`).join('\n') : 'Nenhum template definido para este estágio.'}

    REGRAS CRÍTICAS - SIGA ESTRITAMENTE:
    1.  **REGRA MAIS IMPORTANTE - JANELA 24H FECHADA:** Se "Janela 24h WhatsApp" for **FECHADA**, a **ÚNICA** ação de envio permitida é \`SEND_MESSAGE\` com \`content_source: "template"\`, **obrigatoriamente \`"is_hsm": true\`**, e um \`template_name\` da lista que tenha "HSM: true". É **ABSOLUTAMENTE PROIBIDO** retornar \`"is_hsm": false\` ou \`content_source: "generate"\` quando a janela estiver FECHADA. Se não houver template HSM adequado, retorne \`SCHEDULE_EVALUATION\` ou \`PAUSE\`. **VERIFIQUE A JANELA ANTES.**

    2.  **PRIORIDADE MÁXIMA - RESPOSTA DIRETA (Janela 24h ABERTA):**
        *   **SE** a "Janela 24h WhatsApp" estiver **ABERTA** **E** o cliente acabou de enviar uma mensagem (veja "Última Mensagem do Cliente" e "Histórico Recente", especialmente se for uma pergunta ou cumprimento simples como "Oi"):
            *   **IGNORE TEMPORARIAMENTE** a Regra 3 (Tempo de Espera).
            *   Sua ação **DEVE SER** \`SEND_MESSAGE\` com \`content_source: "generate"\` e **obrigatoriamente \`"is_hsm": false\`**.
            *   Gere uma resposta curta, natural e útil para a mensagem do cliente (Ex: responda a pergunta, confirme recebimento, faça a próxima pergunta relevante do fluxo).
            *   Após decidir gerar a resposta, a *próxima* ação provavelmente será \`SCHEDULE_EVALUATION\` com delay CURTO (1-5 min) para verificar se ele respondeu de volta. (O sistema cuidará disso, foque em gerar a resposta AGORA).
            *   **EXCEÇÃO:** Se a resposta do cliente for claramente desinteressada ("pare", "não quero mais", "cancelar"), use \`PAUSE\` ou \`COMPLETE\`.

    3.  **FLUXO PADRÃO / TEMPO DE ESPERA (Aplicar SOMENTE se Regra 2 não se aplicar):**
        *   Analise o "Status da Espera Atual":
        *   **SE for "AGUARDANDO":**
            *   **NÃO ENVIE MENSAGEM.**
            *   Sua **ÚNICA** ação deve ser \`action_type: "SCHEDULE_EVALUATION"\`.
            *   Use \`delay_ms\` restante (aprox. ${timeRemainingMs > 0 ? timeRemainingMs : 60000} ms).
            *   Use \`reason\` "Aguardando tempo de espera padrão...".
        *   **SE for "TEMPO CONCLUÍDO" ou "N/A (Pode agir)":**
            *   Você está livre para decidir a próxima ação (geralmente \`SEND_MESSAGE\` com o *próximo* template lógico do fluxo, ou \`CHANGE_STAGE\`), respeitando as outras regras (Janela 24h, Não Repetir).

    4.  **NÃO REPITA MENSAGENS:** Se a "Última Mensagem ENVIADA por VOCÊ" foi o template "X", evite decidir enviar o template "X" novamente nesta mesma avaliação. Tente encontrar o *próximo* template lógico no estágio atual ou considere outra ação (gerar resposta, mudar estágio, agendar avaliação).

    5.  **TIMING DA AÇÃO:**
        *   Ao enviar um template do fluxo (\'content_source: "template"\'): NÃO inclua 'delay_ms' na ação 'SEND_MESSAGE'. O sistema usará a "Espera Padrão" do template para agendar a próxima avaliação.
        *   Ao gerar uma resposta (\'content_source: "generate"\'): Use \'SCHEDULE_EVALUATION\' com delay CURTO (ex: 60000-300000 ms) após o envio da sua resposta gerada.

    6.  **HUMANIZAÇÃO, PROGRESSÃO, NÃO INCOMODAR, DÚVIDAS:** (Aja como Alex, tente progredir, não incomode, peça ajuda se confuso).

    SUA TAREFA:
    Analise TODO o contexto. **VERIFIQUE PRIMEIRO A REGRA 2 (RESPOSTA DIRETA).** Se ela se aplicar (Janela Aberta + Interação Recente do Cliente), gere uma resposta com \`"content_source": "generate"\` e \`"is_hsm": false\`. Caso contrário, verifique a Regra 3 (Tempo de Espera) e depois as outras. Retorne **APENAS UM ÚNICO OBJETO JSON VÁLIDO**, seguindo a estrutura e regras.

    Estrutura JSON obrigatória:
    - "action_type": ("SEND_MESSAGE", "CHANGE_STAGE", "SCHEDULE_EVALUATION", "PAUSE", "REQUEST_HUMAN_REVIEW", "COMPLETE")
    - "reason": (Sua justificativa clara)
    - Campos adicionais conforme action_type.

    Exemplo de estrutura COMPLETA para SEND_MESSAGE com template:
    \`\`\`json
    {
      "action_type": "SEND_MESSAGE",
      "reason": "Justificativa detalhada aqui.",
      "content_source": "template",
      "is_hsm": true, // ou false, conforme a regra e o template
      "template_name": "nome_do_template_escolhido"
    }
    \`\`\`

    Exemplo de estrutura COMPLETA para SEND_MESSAGE com generate:
    \`\`\`json
    {
      "action_type": "SEND_MESSAGE",
      "reason": "Respondendo diretamente à pergunta do cliente.",
      "content_source": "generate",
      "is_hsm": false // OBRIGATÓRIO para generate
      // Não precisa de template_name aqui
    }
    \`\`\`

    Exemplo de estrutura COMPLETA para SCHEDULE_EVALUATION:
    \`\`\`json
    {
      "action_type": "SCHEDULE_EVALUATION",
      "reason": "Justificativa detalhada aqui.",
      "delay_ms": 60000 // Exemplo de 1 minuto
    }
    \`\`\`

    Qual a próxima ação (apenas o JSON completo)?
    `;

    // 4. Chamar a IA
    console.log(`FollowUp ${followUpId}: Enviando prompt para IA...`);
    const aiResponseString = await generateChatCompletion({ /* ... */
        messages: [{ role: 'user', content: `Cliente: ${followUp.client_id}, Estágio: ${currentStage.name}. Última resposta: ${followUp.last_response || 'Nenhuma'}. Qual a próxima ação?` }],
        systemPrompt: systemPrompt
    });
    

    // 5. Parse, CORREÇÕES FORÇADAS e Validação
    console.log(`FollowUp ${followUpId}: Resposta bruta da IA: ${aiResponseString}`);
    let aiDecision: AIAction;
    try {
        const cleanResponse = aiResponseString.replace(/^```json\s*|```$/g, '').trim();
        aiDecision = JSON.parse(cleanResponse);

        // --- INÍCIO DAS CORREÇÕES FORÇADAS ---
        if (aiDecision.action_type === 'SEND_MESSAGE') {
            // Forçar is_hsm: true para TEMPLATE fora da janela 24h
            if (isOutside24hWindow && aiDecision.content_source === 'template') {
                if (aiDecision.is_hsm !== true) { // Se não for explicitamente true
                    console.warn(`FollowUp ${followUpId}: CORREÇÃO HSM (TEMPLATE): Fora da janela 24h, IA sugeriu/esqueceu is_hsm:true. Forçando para true.`);
                    (aiDecision as SendMessageAction).is_hsm = true;
                }
            }
            // Forçar is_hsm: false para GENERATE
            else if (aiDecision.content_source === 'generate') {
                if (aiDecision.is_hsm !== false) { // Se não for explicitamente false
                    console.warn(`FollowUp ${followUpId}: CORREÇÃO HSM (GENERATE): IA usou 'generate' mas is_hsm não era 'false'. Forçando para false.`);
                    (aiDecision as SendMessageAction).is_hsm = false;
                }
            }
             // Garantir que is_hsm exista se for template (mesmo dentro da janela) - Default para false se ausente
             else if (aiDecision.content_source === 'template' && (aiDecision.is_hsm === undefined || aiDecision.is_hsm === null)) {
                console.warn(`FollowUp ${followUpId}: CORREÇÃO HSM (TEMPLATE): IA não definiu is_hsm para template. Assumindo 'false' por segurança.`);
                (aiDecision as SendMessageAction).is_hsm = false;
             }
        }
        // --- FIM DAS CORREÇÕES FORÇADAS ---


        // Validação Principal
        if (!aiDecision.action_type || typeof aiDecision.reason !== 'string') {
            throw new Error('Estrutura JSON básica inválida (action_type ou reason).');
        }
        switch (aiDecision.action_type) {
            case 'SEND_MESSAGE':
                if (!['generate', 'template'].includes(aiDecision.content_source)) {
                    throw new Error('Valor inválido para "content_source".');
                }
                // Verificar se is_hsm é boolean após correções
                if (typeof aiDecision.is_hsm !== 'boolean') {
                     throw new Error('Falha interna: Parâmetro "is_hsm" não é booleano após correções.');
                }
                if (aiDecision.content_source === 'template' && (typeof aiDecision.template_name !== 'string' || !aiDecision.template_name)) {
                    throw new Error('Parâmetro "template_name" obrigatório para content_source="template".');
                }
                // Validação final da regra 24h (agora deve estar correta)
                if (isOutside24hWindow && !aiDecision.is_hsm) {
                     console.error(`FollowUp ${followUpId}: VIOLAÇÃO FINAL! Tentativa de enviar não-HSM fora da janela.`);
                     throw new Error('Ação viola regra das 24h.');
                 }
                break;
            case 'CHANGE_STAGE':
                if (typeof aiDecision.target_stage_id !== 'string' || !aiDecision.target_stage_id) { /*...*/ }
                break;
            case 'SCHEDULE_EVALUATION':
                if (typeof aiDecision.delay_ms !== 'number' || aiDecision.delay_ms <= 0) { /*...*/ }
                break;
            // ... outros cases ...
        }

        console.log(`FollowUp ${followUpId}: Decisão da IA (pós-correções) validada:`, aiDecision);
        return aiDecision;

    } catch (parseOrValidationError) {
        console.error(`FollowUp ${followUpId}: Erro ao parsear ou validar JSON da IA:`, parseOrValidationError, `\nResposta recebida:\n${aiResponseString}`);
        return { ...defaultAIAction, reason: `Erro processando resposta IA (${parseOrValidationError instanceof Error ? parseOrValidationError.message : 'Formato inválido'}). Agendando reavaliação.` };
    }

  } catch (error) {
    console.error(`Erro GERAL em determineNextAction para FollowUp ${followUpId}:`, error);
    return { ...defaultAIAction, reason: `Erro interno (${error instanceof Error ? error.message : 'Erro desconhecido'}). Agendando reavaliação.` };
  }
}

export async function analyzeClientResponse(
  clientId: string,
  messageContent: string,
  followUpId: string
): Promise<AIAnalysisResult> { // <<< Tipo de retorno definido
  try {
    console.log(`Iniciando análise de IA para cliente ${clientId}, followUp ${followUpId}`);
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: { include: { stages: { orderBy: { order: 'asc' } } } },
        messages: { orderBy: { sent_at: 'asc' }, take: 20 } // Pegar histórico recente ordenado
      }
    });

    if (!followUp || !followUp.campaign) {
      console.error(`Follow-up ${followUpId} ou campanha não encontrados.`);
      return defaultAnalysisResult;
    }

    const lastNonClientMessage = await prisma.followUpMessage.findFirst({
      where: { follow_up_id: followUpId, is_from_client: false },
      orderBy: { sent_at: 'desc' }
    });
    const messageId = lastNonClientMessage?.id;

    // --- CORRIGIDO: Mapeamento do Histórico (Com Tipagem Explícita) ---
    const conversationHistory: CoreMessage[] = followUp.messages
      .map((msg): CoreMessage => { // Anotar o tipo de retorno da função map
          if (msg.is_from_client) {
              return { role: 'user', content: msg.content || '' };
          } else {
              // Assumindo que mensagens não-cliente são 'assistant' por enquanto
              return { role: 'assistant', content: msg.content || '' };
          }
      });
      // Não precisamos mais do .reverse() aqui se buscamos em ordem ASC e adicionamos a nova no final
    // --- FIM DA CORREÇÃO ---

    const stagesInfo = followUp.campaign.stages.map(stage => ({
      id: stage.id, name: stage.name, order: stage.order, description: stage.description, isCurrent: stage.id === followUp.current_stage_id
    }));
    const currentStageName = stagesInfo.find(s => s.isCurrent)?.name || 'Desconhecido';

    const systemPrompt = `Sua única tarefa é analisar a última mensagem do cliente e retornar um objeto JSON.
NÃO adicione nenhum texto antes ou depois do JSON. NÃO use blocos de código markdown.
O JSON DEVE ter EXATAMENTE as seguintes chaves:
- "sentiment": string ("positive", "neutral", "negative")
- "intent": string (ex: "pedir_informacao", "mostrar_interesse", "reclamar", "agendar_reuniao", "desinteresse", "cumprimento", "confirmacao_simples")
- "topics": array de strings (palavras-chave principais)
- "nextAction": string (sugestão interna: "responder_duvida", "agendar_demonstracao", "ignorar_seguir_fluxo", "escalar_atendimento", "encerrar_positivo", "encerrar_negativo")
- "suggestedStage": string (ID do estágio, opcional, apenas se MUITO claro que deve mudar)

Exemplo de Saída Válida:
{
  "sentiment": "positive",
  "intent": "mostrar_interesse",
  "topics": ["preço", "demonstração"],
  "nextAction": "agendar_demonstração",
  "suggestedStage": "fase_negociacao_id"
}

Analise a mensagem do cliente fornecida e retorne APENAS o JSON.`;

    // Mensagens para a IA (Histórico + Mensagem atual)
    const messages: CoreMessage[] = [
      ...conversationHistory, // Histórico já na ordem correta
      { role: 'user', content: messageContent }
    ];

    // Chamar a IA
    const aiResponseString = await generateChatCompletion({ messages, systemPrompt: systemPrompt });

    // Parse da resposta JSON
    let aiAnalysis: AIAnalysisResult;
    try {
      const cleanResponse = aiResponseString.replace(/^```json\s*|```$/g, '').trim();
      aiAnalysis = JSON.parse(cleanResponse);
      if (typeof aiAnalysis.sentiment !== 'string' || typeof aiAnalysis.intent !== 'string' || !Array.isArray(aiAnalysis.topics)) {
        throw new Error("Formato JSON da análise de IA inválido.");
      }
      console.log(`Análise de IA recebida para ${followUpId}:`, aiAnalysis);
    } catch (parseError) {
      console.error("Erro ao fazer parse da resposta JSON da IA (análise):", parseError, "Resposta recebida:", aiResponseString);
      return defaultAnalysisResult;
    }

    // Salvar a análise no banco de dados
    try {
        const savedAnalysis = await prisma.followUpAIAnalysis.create({
          data: {
            follow_up_id: followUpId,
            message_id: messageId,
            sentiment: aiAnalysis.sentiment,
            intent: aiAnalysis.intent,
            topics: aiAnalysis.topics || [],
            next_action: aiAnalysis.nextAction || 'review',
            suggested_stage: aiAnalysis.suggestedStage
          }
        });
        console.log(`Análise de IA salva com ID ${savedAnalysis.id} para followUp ${followUpId}`);
    } catch(dbError) {
        console.error(`Erro ao salvar análise de IA no BD para ${followUpId}:`, dbError);
    }

    return aiAnalysis;

  } catch (error) {
    console.error(`Erro GERAL na função analyzeClientResponse para followUp ${followUpId}:`, error);
    return defaultAnalysisResult;
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
