import { prisma } from '@/lib/db';

// Nova função para analisar respostas do cliente com IA
export async function analyzeClientResponse(
    clientId: string,
    message: string,
    followUpId: string
  ): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative',
    intent: string,
    topics: string[],
    nextAction: string,
    suggestedStage?: string
  }> {
    try {
      // Preparar o contexto para a IA
      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: {
          campaign: {
            include: {
              stages: {
                orderBy: { order: 'asc' }
              }
            }
          },
          messages: {
            orderBy: { sent_at: 'desc' },
            take: 5 // Últimas 5 mensagens para contexto
          }
        }
      });
  
      if (!followUp) {
        throw new Error(`Follow-up ${followUpId} não encontrado`);
      }
      
      // Buscar mensagem respondida se disponível
      const lastMessage = await prisma.followUpMessage.findFirst({
        where: { 
          follow_up_id: followUpId,
          is_from_client: false
        },
        orderBy: { sent_at: 'desc' }
      });
      
      const messageId = lastMessage?.id;
  
      // Construir o histórico de conversa para a IA
      const conversationHistory : any = followUp?.messages.map(msg => ({
        role: msg.is_from_client ? 'user' : 'assistant',
        content: msg.content
      })).reverse(); // Ordem cronológica
      
      // Informações de estágios para contextualização
      const stagesInfo = followUp.campaign.stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        order: stage.order,
        isCurrent: stage.id === followUp.current_stage_id
      }));
  
      // Consultar a API de IA
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...conversationHistory,
            {
              role: 'user',
              content: message
            },
            {
              role: 'system',
              content: `Analise esta mensagem do cliente e retorne um JSON com: 
              sentiment (positive, neutral, negative), 
              intent (a intenção principal detectada), 
              topics (array de tópicos mencionados), 
              nextAction (sugestão de próxima ação),
              suggestedStage (estágio sugerido para o cliente, opcional)
              
              Informações adicionais:
              - Cliente ID: ${clientId}
              - Estágio atual: ${stagesInfo.find(s => s.isCurrent)?.name || 'Desconhecido'}
              - Estágios disponíveis: ${stagesInfo.map(s => s.name).join(', ')}
              `
            }
          ]
        })
      });
  
      const result = await response.json();
      // Extrair e analisar o JSON da resposta da IA
      const aiAnalysis = JSON.parse(result.choices[0].message.content);
      
      // Salvar a análise no banco de dados
      const savedAnalysis = await prisma.followUpAIAnalysis.create({
        data: {
          follow_up_id: followUpId,
          message_id: messageId,
          sentiment: aiAnalysis.sentiment,
          intent: aiAnalysis.intent,
          topics: aiAnalysis.topics || [],
          next_action: aiAnalysis.nextAction,
          suggested_stage: aiAnalysis.suggestedStage
        }
      });
      
      console.log(`Análise de IA salva com ID ${savedAnalysis.id}`);
      
      return aiAnalysis;
    } catch (error) {
      console.error("Erro na análise de IA da resposta do cliente:", error);
      // Retornar análise padrão em caso de erro
      return {
        sentiment: 'neutral',
        intent: 'unknown',
        topics: [],
        nextAction: 'continue_sequence'
      };
    }
  }
  
  // Nova função para personalizar conteúdo de mensagens com IA
export async function personalizeMessageContent(
    originalMessage: string,
    clientId: string,
    followUpId: string,
    metadata: any
  ): Promise<string> {
    try {
      // Buscar informações do cliente e histórico de conversa
      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: {
          messages: {
            orderBy: { sent_at: 'desc' },
            take: 5 // Aumentado para 5 mensagens para melhor contexto
          },
          ai_analyses: {
            orderBy: { created_at: 'desc' },
            take: 3 // Incluir últimas análises para dar contexto à IA
          }
        }
      });
      
      // Se não encontrar o follow-up, retorna a mensagem original
      if (!followUp) return originalMessage;
  
      const clientMessages = followUp.messages
        .filter(msg => msg.is_from_client)
        .map(msg => msg.content);
        
      // Extrai as análises recentes para adicionar ao contexto
      const recentAnalyses = followUp.ai_analyses.map(analysis => ({
        sentiment: analysis.sentiment,
        intent: analysis.intent,
        topics: analysis.topics.join(', ')
      }));
      
      // Obtém a última resposta do cliente
      const lastClientMessage = followUp.messages
        .filter(msg => msg.is_from_client)
        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0]?.content;
  
      // Consultar a API de IA para personalizar a mensagem
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `Você é um assistente especializado em follow-up de clientes.
              Sua função é personalizar mensagens para torná-las mais relevantes e engajadoras.
              
              REGRAS IMPORTANTES:
              1. Mantenha um tom profissional e amigável
              2. Preserve a intenção original da mensagem
              3. Personalize o conteúdo com base no histórico e contexto do cliente
              4. Faça com que a mensagem pareça ser escrita por um humano
              5. NUNCA mencione que você é uma IA ou assistente virtual
              6. Mantenha o estilo conversacional e natural`
            },
            {
              role: 'user',
              content: `Mensagem original a personalizar: "${originalMessage}"
              
              Informações do cliente:
              - ID: ${clientId}
              - Estágio atual: ${metadata.stage_name || 'Desconhecido'}
              - Categoria da mensagem: ${metadata.category || 'Geral'}
              
              Histórico de mensagens do cliente:
              ${clientMessages?.join('\n')}
              
              Última resposta do cliente:
              ${lastClientMessage || 'Sem resposta recente'}
              
              Análises recentes:
              ${recentAnalyses.length > 0 ? JSON.stringify(recentAnalyses, null, 2) : 'Nenhuma análise disponível'}
              
              Personalize a mensagem original para torná-la mais relevante e natural, adaptada ao contexto específico deste cliente.`
            }
          ]
        })
      });
  
      const result = await response.json();
      const personalizedMessage = result.choices[0].message.content.trim();
      return personalizedMessage;
    } catch (error) {
      console.error("Erro ao personalizar mensagem com IA:", error);
      // Em caso de erro, retornar a mensagem original
      return originalMessage;
    }
  }
  
// Nova função: Gerar resposta dinamicamente pela IA
export async function generateAIResponse(
  clientId: string,
  clientMessage: string,
  followUpId: string,
  stageInfo: any
): Promise<string> {
  try {
    // Buscar o histórico completo da conversa e metadados
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        campaign: {
          include: {
            stages: { orderBy: { order: 'asc' } }
          }
        },
        messages: {
          orderBy: { sent_at: 'asc' }, // Ordem cronológica
          take: 10
        },
        ai_analyses: {
          orderBy: { created_at: 'desc' },
          take: 1
        }
      }
    });

    if (!followUp) {
      return "Não foi possível gerar uma resposta personalizada neste momento. Por favor, tente novamente mais tarde.";
    }

    // Identificar o estágio atual
    const currentStage = followUp.campaign.stages.find(s => s.id === followUp.current_stage_id);
    
    // Extrair o histórico de mensagens formatado para o contexto da IA
    const messageHistory = followUp.messages.map(msg => ({
      role: msg.is_from_client ? 'user' : 'assistant',
      content: msg.content
    }));

    // Informações de análise recente, se disponível
    const recentAnalysis = followUp.ai_analyses[0];
    
    // Buscar objetivos da campanha
    const campaignDetails = await prisma.followUpCampaign.findUnique({
      where: { id: followUp.campaign_id }
    });

    // Buscar próximo estágio (se houver)
    const currentStageIndex = followUp.campaign.stages.findIndex(s => s.id === followUp.current_stage_id);
    const nextStage = currentStageIndex >= 0 && currentStageIndex < followUp.campaign.stages.length - 1 
      ? followUp.campaign.stages[currentStageIndex + 1] 
      : null;

    // Consultar a API de IA para gerar uma resposta original
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: `Você é um assistente de vendas profissional especializado em follow-up.
        Sua tarefa é gerar respostas personalizadas para conversas com clientes.
        
        REGRAS IMPORTANTES:
        1. Você NUNCA deve mencionar que é uma IA. Escreva como um humano.
        2. Seu objetivo final é avançar o cliente para o próximo estágio no funil.
        3. Use um tom conversacional, amigável, mas profissional.
        4. Seja conciso - max 3-4 frases.
        5. Personalize sua resposta com base no histórico e contexto.
        6. Responda às perguntas do cliente com informações relevantes.
        7. Você pode inventar detalhes plausíveis quando necessário.
        8. Não use linguagem excessivamente formal ou robótica.
        
        Se o cliente mostra interesse, tente mover para o próximo estágio.
        Se o cliente mostra objeção, responda com empatia e solucione o problema.
        Se o cliente faz uma pergunta, responda e depois direcione para o próximo passo.
        
        AGORA, você responderá como se fosse um representante real da empresa, não como IA.`,
        messages: [
          ...messageHistory,
          {
            role: 'user',
            content: `CONTEXTO ATUAL:
            - Campanha: ${campaignDetails?.name || 'N/A'}
            - Cliente: ${clientId}
            - Estágio atual: ${currentStage?.name || 'Desconhecido'} 
            - Propósito deste estágio: ${stageInfo?.purpose || 'Continuar o engajamento com o cliente'}
            - Próximo estágio: ${nextStage?.name || 'Finalização'}
            
            Análise recente:
            - Sentimento: ${recentAnalysis?.sentiment || 'neutro'}
            - Intenção principal: ${recentAnalysis?.intent || 'desconhecida'}
            - Tópicos mencionados: ${recentAnalysis?.topics.join(', ') || 'nenhum'}
            
            A última mensagem do cliente foi: "${clientMessage}"
            
            Responda a esta mensagem de forma natural e personalizada, como um representante humano da empresa.`
          }
        ]
      })
    });

    const result = await response.json();
    
    // Extrair a resposta gerada pela IA e garantir que não seja muito longa
    let aiGeneratedResponse = result.choices[0].message.content.trim();
    
    // Logar a resposta gerada
    console.log(`Resposta IA gerada para ${clientId}:`, aiGeneratedResponse);
    
    return aiGeneratedResponse;
  } catch (error) {
    console.error("Erro ao gerar resposta com IA:", error);
    // Em caso de erro, retornar uma mensagem genérica
    return "Obrigado por sua mensagem. Um de nossos consultores entrará em contato em breve para ajudá-lo melhor.";
  }
}
  
  // Nova função para decidir o próximo passo com base em IA
export async function decideNextStepWithAI(
    followUp: any,
    currentStep: any,
    clientResponse?: string 
  ): Promise<{
    action: 'continue' | 'skip' | 'jump' | 'complete',
    targetStep?: number,
    targetStage?: string,
    reason?: string
  }> {
    try {
      // Buscar dados contextuais necessários
      const campaign = await prisma.followUpCampaign.findUnique({
        where: { id: followUp.campaign_id },
        include: {
          stages: {
            orderBy: { order: 'asc' },
            include: {
              steps: {
                orderBy: { wait_time_ms: 'asc' }
              }
            }
          }
        }
      });

      if(!campaign){
        return {
            action: 'continue'
          }
      }
      
      // Buscar análises de IA anteriores
      const previousAnalyses = await prisma.followUpAIAnalysis.findMany({
        where: { follow_up_id: followUp.id },
        orderBy: { created_at: 'desc' },
        take: 3
      });
  
      // Preparar a lista de estágios e passos disponíveis para contextualizar a IA
      const stagesInfo = campaign.stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        stepsCount: stage.steps.length,
        order: stage.order,
        isCurrent: stage.id === followUp.current_stage_id
      }));
      
      // Determinar o próximo estágio possível
      const currentStageIndex = stagesInfo.findIndex(s => s.isCurrent);
      const nextStageInfo = currentStageIndex >= 0 && currentStageIndex < stagesInfo.length - 1 
          ? stagesInfo[currentStageIndex + 1] 
          : null;
  
      // Buscar o histórico de mensagens
      const messages = await prisma.followUpMessage.findMany({
        where: { follow_up_id: followUp.id },
        orderBy: { sent_at: 'desc' },
        take: 5
      });
      
      // Analisar as métricas comportamentais do cliente
      const clientMetrics = {
        totalMessages: messages.filter(m => m.is_from_client).length,
        responseTime: followUp.last_response_at 
          ? new Date(followUp.last_response_at).getTime() - new Date(messages.find(m => !m.is_from_client)?.sent_at || 0).getTime() 
          : 0,
        sentiment: previousAnalyses[0]?.sentiment || 'neutral'
      };
  
      // Construir o prompt para a IA
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `Você é um assistente especializado em decidir o fluxo ideal de follow-up para clientes.
              Com base no contexto e no estágio atual, determine a melhor ação a seguir.
              Responda APENAS com um objeto JSON contendo: action, targetStep (opcional), targetStage (opcional) e reason.
              
              Opções de ação: 
              - continue (seguir sequência normal)
              - skip (pular para outro passo)
              - jump (pular para outro estágio)
              - complete (concluir follow-up)
              
              Se o cliente demonstrar interesse, você deve avançá-lo para o próximo estágio.
              Se o cliente demonstrar desinteresse, mantenha-o no estágio atual ou considere completar o follow-up.
              Se a resposta for neutra ou indecisa, continue no fluxo normal.`
            },
            {
              role: 'user',
              content: `Campanha: ${campaign.name}
              Cliente ID: ${followUp.client_id}
              Estágio atual: ${currentStep.stage_name || stagesInfo.find(s => s.isCurrent)?.name || 'Desconhecido'}
              Passo atual: ${currentStep.template_name || 'Não especificado'}
              
              Estágios disponíveis: ${JSON.stringify(stagesInfo)}
              Próximo estágio possível: ${nextStageInfo ? nextStageInfo.name : 'Nenhum (último estágio)'}
              
              ${clientResponse ? `Última resposta do cliente: "${clientResponse}"` : 'Sem resposta recente do cliente'}
              
              Análises anteriores de IA:
              ${previousAnalyses.map(a => `- Sentimento: ${a.sentiment}, Intenção: ${a.intent}, Próxima ação sugerida: ${a.next_action}`).join('\n')}
              
              Histórico de mensagens recentes:
              ${messages.map(m => `${m.is_from_client ? 'Cliente' : 'Sistema'}: ${m.content}`).join('\n')}
              
              Métricas do cliente:
              - Total de mensagens: ${clientMetrics.totalMessages}
              - Tempo de resposta: ${clientMetrics.responseTime > 0 ? `${Math.round(clientMetrics.responseTime / 1000 / 60)} minutos` : 'N/A'}
              - Sentimento geral: ${clientMetrics.sentiment}
              
              Com base nessas informações, qual deve ser a próxima ação no fluxo de follow-up?`
            }
          ]
        })
      });
  
      const result = await response.json();
      const aiDecision = JSON.parse(result.choices[0].message.content);
      
      // Registrar a decisão tomada
      console.log(`IA decidiu: ${aiDecision.action} - Razão: ${aiDecision.reason || 'Não especificada'}`);
      
      return aiDecision;
    } catch (error) {
      console.error("Erro ao decidir próximo passo com IA:", error);
      // Em caso de erro, continuar com o fluxo normal
      return {
        action: 'continue',
        reason: 'Erro na análise de IA, seguindo fluxo padrão'
      };
    }
  }