// app/api/follow-up/_lib/ai/functionIa.ts
import { prisma } from '@/lib/db';
import { generateChatCompletion } from '@/lib/ai/chatService'; // Verifique se este caminho está correto
import { CoreMessage } from 'ai';

// --- Tipagem para a resposta da análise ---
interface AIAnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  intent: string;
  topics: string[];
  nextAction: string;
  suggestedStage?: string;
}

// --- Tipagem para a resposta da decisão ---
interface AIDecisionResult {
    action: 'continue' | 'skip' | 'jump' | 'complete';
    targetStep?: number; // Assumindo que se refere ao índice ou ordem do passo
    targetStage?: string; // ID do estágio
    reason?: string;
}

// --- Valor Padrão para Análise em caso de erro ---
const defaultAnalysisResult: AIAnalysisResult = {
  sentiment: 'neutral',
  intent: 'unknown',
  topics: [],
  nextAction: 'continue_sequence', // Ação padrão segura
};

// --- Valor Padrão para Decisão em caso de erro ---
const defaultDecisionResult: AIDecisionResult = {
  action: 'continue',
  reason: 'Erro na análise de IA ou formato inválido, seguindo fluxo padrão'
};

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

      const conversationHistory : CoreMessage[] = followUp.messages
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

// Função para decidir o próximo passo com base em IA (Refatorada)
export async function decideNextStepWithAI(
    followUp: any, // Prisma FollowUp object (idealmente tipado)
    currentStep: any, // Prisma FollowUpStep object (idealmente tipado)
    clientResponse?: string // A última resposta do cliente, se houver
  ): Promise<AIDecisionResult> {
    try {
      console.log(`Decidindo próximo passo com IA para followUp ${followUp.id}`);
      const campaign = await prisma.followUpCampaign.findUnique({
        where: { id: followUp.campaign_id },
        include: {
          stages: {
            orderBy: { order: 'asc' },
            include: { steps: { orderBy: { wait_time_ms: 'asc' } } }
          }
        }
      });

      if (!campaign) {
        console.error(`Campanha ${followUp.campaign_id} não encontrada para decisão de IA.`);
        return defaultDecisionResult;
      }

      const previousAnalyses = await prisma.followUpAIAnalysis.findMany({
        where: { follow_up_id: followUp.id },
        orderBy: { created_at: 'desc' },
        take: 3
      });

      const stagesInfo = campaign.stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        stepsCount: stage.steps.length,
        order: stage.order,
        isCurrent: stage.id === followUp.current_stage_id
      }));
      const currentStageInfo = stagesInfo.find(s => s.isCurrent);
      const currentStageIndex = stagesInfo.findIndex(s => s.isCurrent);
      const nextStageInfo = currentStageIndex >= 0 && currentStageIndex < stagesInfo.length - 1
          ? stagesInfo[currentStageIndex + 1]
          : null;

      const messages = await prisma.followUpMessage.findMany({
        where: { follow_up_id: followUp.id },
        orderBy: { sent_at: 'desc' },
        take: 5
      });
      const messageHistorySummary = messages.map(m => `${m.is_from_client ? 'Cliente' : 'Sistema'}: ${m.content?.substring(0, 100)}...`).reverse().join('\n'); // Resumo do histórico recente

      // Prompt de Sistema para Decisão
      const systemPrompt = `Você é um estrategista de automação de follow-up. Sua função é decidir a PRÓXIMA AÇÃO mais eficaz no fluxo de um cliente, com base no contexto.
Responda SOMENTE com um objeto JSON válido contendo as chaves:
- "action": (string) Uma das opções: "continue" (seguir para o próximo passo da sequência atual), "skip" (pular para um passo específico DENTRO do estágio atual - use targetStep), "jump" (pular para um ESTÁGIO diferente - use targetStage), "complete" (encerrar o follow-up para este cliente).
- "targetStep": (number, opcional) O índice (ordem, começando em 0) do passo para o qual pular DENTRO do estágio atual, APENAS se action for "skip".
- "targetStage": (string, opcional) O ID do estágio para o qual pular, APENAS se action for "jump".
- "reason": (string) Uma breve explicação (1 frase) para a sua decisão.

Fatores a considerar:
- Resposta do cliente (se houver): Interesse forte -> 'jump' para próximo estágio ou 'complete' se for o último. Desinteresse claro -> 'complete'. Dúvida/Neutro -> 'continue' ou 'skip' para passo relevante.
- Sem resposta: Geralmente 'continue'. Após muitas tentativas sem resposta, talvez 'complete'.
- Histórico e análises anteriores: Reforçam a tendência do cliente.
- Estágio atual e próximos estágios: Qual o objetivo? É possível avançar?`;

      // Mensagem do usuário com contexto para a IA
      const userPrompt = `CONTEXTO PARA DECISÃO:
- Campanha: ${campaign.name}
- Cliente ID: ${followUp.client_id}
- Estágio Atual: ${currentStageInfo?.name || 'Desconhecido'} (ID: ${currentStageInfo?.id}, Ordem: ${currentStageInfo?.order})
- Passo Atual no Estágio: Ordem ${currentStep?.order || 'N/A'} (Template: ${currentStep?.template_name || 'N/A'})
- Total de Passos no Estágio Atual: ${currentStageInfo?.stepsCount || 'N/A'}

- Estágios Disponíveis (ID, Nome, Ordem): ${JSON.stringify(stagesInfo.map(s => ({id: s.id, name: s.name, order: s.order})))}
- Próximo Estágio Potencial: ${nextStageInfo ? `${nextStageInfo.name} (ID: ${nextStageInfo.id})` : 'Nenhum'}

- Última Resposta do Cliente (se aplicável): ${clientResponse ? `"${clientResponse}"` : 'Nenhuma resposta recente.'}
- Análises Anteriores (Sentimento/Intenção):
${previousAnalyses.length > 0 ? previousAnalyses.map(a => `- Sent: ${a.sentiment}, Int: ${a.intent}, Sugestão: ${a.next_action}`).join('\n') : 'Nenhuma'}
- Resumo do Histórico Recente:
${messageHistorySummary}

Qual a próxima ação ("action": "continue" | "skip" | "jump" | "complete") e os parâmetros opcionais ("targetStep", "targetStage", "reason")? Retorne APENAS o JSON.`;

      const messagesForAI: CoreMessage[] = [{ role: 'user', content: userPrompt }];

      // Chamar diretamente o serviço de IA
      const aiResponseString = await generateChatCompletion({
          messages: messagesForAI,
          systemPrompt: systemPrompt
      });

      // Tentar fazer o parse da resposta JSON
      let aiDecision: AIDecisionResult;
      try {
        aiDecision = JSON.parse(aiResponseString);
        // Validação básica do formato
        if (!aiDecision.action || !['continue', 'skip', 'jump', 'complete'].includes(aiDecision.action)) {
            throw new Error("Ação inválida ou ausente na decisão da IA.");
        }
        // Validações adicionais se necessário (ex: targetStep/targetStage presentes quando a ação exige)
        console.log(`Decisão de IA recebida para ${followUp.id}:`, aiDecision);
      } catch (parseError) {
        console.error("Erro ao fazer parse da resposta JSON da IA (decisão):", parseError, "Resposta recebida:", aiResponseString);
        return defaultDecisionResult; // Retorna padrão se o JSON for inválido
      }

      // Registrar e retornar a decisão
      console.log(`IA decidiu para followUp ${followUp.id}: ${aiDecision.action} - Razão: ${aiDecision.reason || 'Não especificada'}`);
      return aiDecision;

    } catch (error) {
      console.error(`Erro na função decideNextStepWithAI para followUp ${followUp.id}:`, error);
      return defaultDecisionResult; // Retorna padrão em caso de erro geral
    }
  }