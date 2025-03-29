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

// Função Principal de Decisão da IA
export async function determineNextAction(followUpId: string): Promise<AIAction> {
  try {
    console.log(`🧠 Iniciando determinação de próxima ação para FollowUp ${followUpId}`);

    // 1. Buscar Contexto Abrangente
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: {
          include: {
            stages: { // Inclui todos os estágios da campanha
              orderBy: { order: 'asc' },
              include: {
                steps: { // Inclui os templates/passos de cada estágio
                  orderBy: { order: 'asc' } // ou wait_time_ms
                }
              }
            }
          }
        },
        messages: { // Histórico recente
          orderBy: { sent_at: 'asc' }, // Ordem cronológica
          take: 15 // Aumentar um pouco para dar mais contexto à IA
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
      // Poderia tentar definir o primeiro estágio ou pausar
      const firstStage = followUp.campaign.stages[0];
      if (firstStage) {
        await prisma.followUp.update({ where: { id: followUpId }, data: { current_stage_id: firstStage.id } });
        followUp.current_stage_id = firstStage.id; // Atualiza localmente
        console.log(`Definido estágio inicial ${firstStage.name} para FollowUp ${followUpId}.`);
      } else {
        return { ...defaultAIAction, action_type: 'PAUSE', reason: `FollowUp sem estágio atual e campanha sem estágios.` };
      }
    }


    // 2. Preparar Informações para o Prompt
    const currentStage = followUp.campaign.stages.find(s => s.id === followUp.current_stage_id);
    if (!currentStage) {
      console.error(`Estágio atual ID ${followUp.current_stage_id} não encontrado nos estágios da campanha ${followUp.campaign.id}.`);
      // Tentar encontrar pelo nome se disponível nos logs ou pausar
      return { ...defaultAIAction, action_type: 'PAUSE', reason: `Estágio atual ID ${followUp.current_stage_id} inválido.` };
    }

    const currentStageTemplates = currentStage.steps || [];
    const hsmTemplates = currentStageTemplates.filter(step => step.template_name);
    const regularTemplates = currentStageTemplates.filter(step => !step.template_name);

    const agora = Date.now();
    const lastClientMsgTime = followUp.last_client_message_at ? new Date(followUp.last_client_message_at).getTime() : 0;
    const timeSinceLastClientMessageMs = lastClientMsgTime > 0 ? agora - lastClientMsgTime : Infinity;
    const isOutside24hWindow = timeSinceLastClientMessageMs >= (24 * 60 * 60 * 1000);

    const formattedTimeSince = lastClientMsgTime > 0
      ? formatDistanceToNowStrict(new Date(lastClientMsgTime), { addSuffix: true, locale: ptBR })
      : 'nunca';

    // Montar a string 'history'
    const history = followUp.messages.map(msg => {
    const prefix = msg.is_from_client ? 'Cliente' : 'Assistente';
    const suffix = !msg.is_from_client ? ` (Template: ${msg.template_used || 'Gerado'}; Status: ${msg.delivered ? 'Entregue' : (msg.error_sending ? 'Falhou' : 'Enviando')})` : '';
    return `${prefix}: ${msg.content?.substring(0, 100)}${msg.content && msg.content.length > 100 ? '...' : ''}${suffix}`;
    }).join('\n');

    const lastAnalysis = followUp.ai_analyses[0];
    const formattedAnalysis = lastAnalysis
      ? `Sentimento: ${lastAnalysis.sentiment}, Intenção: ${lastAnalysis.intent}, Tópicos: ${lastAnalysis.topics?.join(', ') || 'N/A'}, Próx. Ação Sugerida: ${lastAnalysis.next_action || 'N/A'}`
      : 'Nenhuma análise recente.';


    // 3. Construir o Prompt Detalhado para a IA
    const systemPrompt = `
    Você é "Alex", um assistente de vendas/suporte especialista em gerenciar follow-ups de forma inteligente e humana. Seu objetivo é guiar o cliente pela campanha, respeitando o contexto e as regras do WhatsApp.
    
    OBJETIVO GERAL DA CAMPANHA "${followUp.campaign.name}": ${followUp.campaign.description || 'Não especificado.'}
    OBJETIVO DO ESTÁGIO ATUAL "${currentStage.name}": ${currentStage.description || 'Não especificado.'}
    
    CONTEXTO DO CLIENTE (ID: ${followUp.client_id}):
    - Estágio Atual: ${currentStage.name} (Ordem: ${currentStage.order})
    - Última Mensagem do Cliente: ${formattedTimeSince}
    - Status Janela 24h: ${isOutside24hWindow ? '**FECHADA** (> 24h ou nunca interagiu)' : 'ABERTA (< 24h)'}
    - Análise da Última Resposta (se houver): ${formattedAnalysis}
    - Histórico Recente da Conversa:
    ${history || 'Nenhuma mensagem ainda.'}
    
    RECURSOS DISPONÍVEIS NESTE ESTÁGIO (${currentStage.name}):
    - Templates Padrão (NÃO USAR se janela FECHADA):
    ${regularTemplates.length > 0 ? regularTemplates.map(t => `  - Nome: "${t.template_name}" (Espera Padrão Após Envio: ${t.wait_time})`).join('\n') : '  Nenhum'}
    - Templates HSM Aprovados (**OBRIGATÓRIO** para iniciar conversa se janela FECHADA):
    ${hsmTemplates.length > 0 ? hsmTemplates.map(t => `  - Nome: "${t.template_name}" (Espera Padrão Após Envio: ${t.wait_time})`).join('\n') : '  Nenhum'}
    
    REGRAS CRÍTICAS **IMPOSTAS**:
    1.  **SE A JANELA DE 24H ESTIVER FECHADA:** Sua *única* opção de envio é \`action_type: "SEND_MESSAGE"\` com \`is_hsm: true\` e \`content_source: "template"\`, utilizando um \`template_name\` da lista de **HSMs Aprovados** acima. É **PROIBIDO** usar \`content_source: "generate"\` ou \`is_hsm: false\`. Se não houver HSMs adequados na lista acima, escolha "SCHEDULE_EVALUATION" ou "PAUSE".
    2.  **SE A JANELA DE 24H ESTIVER ABERTA:** Você pode usar \`SEND_MESSAGE\` com \`content_source: "generate"\` (e \`is_hsm: false\`) OU \`content_source: "template"\` (com \`is_hsm: true\` se for HSM, ou \`is_hsm: false\` se for padrão).
    3.  **TIMING PADRÃO vs DIÁLOGO:**
        *   **Fluxo Padrão:** Se decidir enviar uma mensagem usando um template (\`SEND_MESSAGE\` com \`content_source: "template"\`) para seguir a sequência planejada, **NÃO** retorne um \`delay_ms\` para esta ação. O sistema agendará a próxima avaliação automaticamente com base na "Espera Padrão Após Envio" do template que você escolheu.
        *   **Diálogo Ativo:** Se está respondendo diretamente a uma mensagem recente do cliente (especialmente usando \`content_source: "generate"\`), ou se a intenção é manter uma conversa rápida, você **DEVE** usar \`action_type: "SCHEDULE_EVALUATION"\` com um \`delay_ms\` CURTO (ex: 1 a 5 minutos = 60000 a 300000 ms).
        *   **Espera Específica:** Se precisar esperar um tempo *diferente* do padrão (ex: cliente pediu), use \`action_type: "SCHEDULE_EVALUATION"\` com o \`delay_ms\` apropriado (ex: 86400000 para 1 dia).
    4.  **HUMANIZAÇÃO:** Aja como "Alex"... [manter regra]
    5.  **PROGRESSÃO:** Tente mover o cliente... [manter regra]
    6.  **NÃO INCOMODAR:** ... [manter regra]
    7.  **DÚVIDAS:** ... [manter regra]
    
    SUA TAREFA:
    Analise o contexto e decida a PRÓXIMA MELHOR AÇÃO, **respeitando estritamente a regra da janela de 24h e as regras de timing**.
    
    RESPONDA ESTRITAMENTE COM UM ÚNICO OBJETO JSON **VÁLIDO**, sem nenhum texto antes ou depois. Use aspas duplas para chaves e valores de string. Certifique-se de que há vírgulas (,) entre cada par chave-valor, exceto após o último. Exemplo:
    \`\`\`json
    {
      "action_type": "SEND_MESSAGE",
      "reason": "Exemplo de razão.",
      "content_source": "template",
      "is_hsm": true,
      "template_name": "nome_template_hsm"
    }
    \`\`\`
    
    O JSON DEVE conter:
    - "action_type": (Obrigatório) Uma das strings: "SEND_MESSAGE", "CHANGE_STAGE", "SCHEDULE_EVALUATION", "PAUSE", "REQUEST_HUMAN_REVIEW", "COMPLETE".
    - "reason": (Obrigatório) Sua justificativa.
    - Parâmetros Adicionais (conforme action_type):
        - Se "SEND_MESSAGE": inclua "content_source", "is_hsm", e "template_name" (se source for "template"). **NÃO inclua 'delay_ms' aqui** (será tratado pelo sistema ou por SCHEDULE_EVALUATION).
        - Se "SCHEDULE_EVALUATION": **SEMPRE** inclua "delay_ms".
        - Se "CHANGE_STAGE": inclua "target_stage_id".
    
    Qual a próxima ação (apenas o JSON)?
    `;

    // 4. Chamar a IA
    console.log(`FollowUp ${followUpId}: Enviando prompt para IA...`);
    const aiResponseString = await generateChatCompletion({
      // Não precisamos de histórico aqui, já está no prompt do sistema
      messages: [{ role: 'user', content: `Cliente: ${followUp.client_id}, Estágio: ${currentStage.name}. Qual a próxima ação?` }], // Mensagem curta apenas para iniciar
      systemPrompt: systemPrompt // O prompt principal está aqui
    });

    // 5. Parse e Validar a Resposta da IA
    console.log(`FollowUp ${followUpId}: Resposta bruta da IA: ${aiResponseString}`);
    let aiDecision: AIAction;
    try {
      // Tenta remover ```json ... ``` se a IA incluir
      const cleanResponse = aiResponseString.replace(/^```json\s*|```$/g, '').trim();
      aiDecision = JSON.parse(cleanResponse);

      // Validação básica da estrutura
      if (!aiDecision.action_type || typeof aiDecision.reason !== 'string') {
        throw new Error('Estrutura JSON básica inválida (action_type ou reason ausente/inválido).');
      }

      // Validação específica por tipo de ação
      switch (aiDecision.action_type) {
        case 'SEND_MESSAGE':
          if (typeof aiDecision.is_hsm !== 'boolean' || !['generate', 'template'].includes(aiDecision.content_source)) {
            throw new Error('Parâmetros inválidos para SEND_MESSAGE (is_hsm ou content_source).');
          }
          if (aiDecision.content_source === 'template' && typeof aiDecision.template_name !== 'string') {
            throw new Error('Parâmetro "template_name" obrigatório para SEND_MESSAGE com content_source="template".');
          }
          // Validar se a ação respeita a regra das 24h
          if (isOutside24hWindow && (!aiDecision.is_hsm || aiDecision.content_source === 'generate')) {
            console.warn(`FollowUp ${followUpId}: IA sugeriu ação (${aiDecision.action_type}, source: ${aiDecision.content_source}, hsm: ${aiDecision.is_hsm}) que viola regra das 24h. Forçando reavaliação.`);
            throw new Error('Ação sugerida viola regra das 24h.'); // Força cair no catch e usar default
          }
          break;
        case 'CHANGE_STAGE':
          if (typeof aiDecision.target_stage_id !== 'string') {
            throw new Error('Parâmetro "target_stage_id" obrigatório/inválido para CHANGE_STAGE.');
          }
          break;
        case 'SCHEDULE_EVALUATION':
          if (typeof aiDecision.delay_ms !== 'number' || aiDecision.delay_ms <= 0) {
            throw new Error('Parâmetro "delay_ms" obrigatório/inválido para SCHEDULE_EVALUATION.');
          }
          break;
        // PAUSE, REQUEST_HUMAN_REVIEW, COMPLETE só precisam de 'reason', já validado.
      }

      console.log(`FollowUp ${followUpId}: Decisão da IA validada:`, aiDecision);
      return aiDecision;

    } catch (parseOrValidationError) {
      console.error(`FollowUp ${followUpId}: Erro ao parsear ou validar JSON da IA:`, parseOrValidationError, `\nResposta recebida:\n${aiResponseString}`);
      return { ...defaultAIAction, reason: `Erro ao processar resposta da IA: ${parseOrValidationError instanceof Error ? parseOrValidationError.message : 'Formato inválido'}. Agendando reavaliação.` };
    }

  } catch (error) {
    console.error(`Erro GERAL em determineNextAction para FollowUp ${followUpId}:`, error);
    return { ...defaultAIAction, reason: `Erro interno no servidor ao determinar ação: ${error instanceof Error ? error.message : 'Erro desconhecido'}. Agendando reavaliação.` };
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
