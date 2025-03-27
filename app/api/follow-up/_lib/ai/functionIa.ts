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
          campaign: true,
          messages: {
            orderBy: { sent_at: 'desc' },
            take: 5 // Últimas 5 mensagens para contexto
          }
        }
      });
  
      // Construir o histórico de conversa para a IA
      const conversationHistory : any = followUp?.messages.map(msg => ({
        role: msg.is_from_client ? 'user' : 'assistant',
        content: msg.content
      })).reverse(); // Ordem cronológica
  
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
              suggestedStage (estágio sugerido para o cliente, opcional)`
            }
          ]
        })
      });
  
      const result = await response.json();
      // Extrair e analisar o JSON da resposta da IA
      const aiAnalysis = JSON.parse(result.choices[0].message.content);
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
export  async function personalizeMessageContent(
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
            take: 3 // Últimas 3 mensagens
          }
        }
      });
  
      const clientMessages = followUp?.messages
        .filter(msg => msg.is_from_client)
        .map(msg => msg.content);
  
      // Consultar a API de IA para personalizar a mensagem
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `Você é um assistente especializado em melhorar mensagens de follow-up. 
              Personalize a mensagem a seguir com base no contexto do cliente e histórico de conversa.
              Mantenha o tom profissional e a intenção original, mas torne mais personalizado e relevante.`
            },
            {
              role: 'user',
              content: `Mensagem original: "${originalMessage}"
              
              Informações do cliente: ${clientId}
              
              Histórico de mensagens do cliente: ${clientMessages?.join('\n')}
              
              Estágio atual: ${metadata.stage_name || 'Desconhecido'}
              
              Por favor, personalize esta mensagem mantendo a essência, mas tornando-a mais relevante para este cliente específico.`
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
  
  // Nova função para decidir o próximo passo com base em IA
export  async function decideNextStepWithAI(
    followUp: any,
    currentStep: any,
    clientResponse: string 
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
  
      // Preparar a lista de estágios e passos disponíveis para contextualizar a IA
      const stagesInfo = campaign.stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        stepsCount: stage.steps.length,
        order: stage.order
      }));
  
      // Buscar o histórico de mensagens
      const messages = await prisma.followUpMessage.findMany({
        where: { follow_up_id: followUp.id },
        orderBy: { sent_at: 'desc' },
        take: 5
      });
  
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
              Opções de ação: continue (seguir sequência normal), skip (pular para outro passo), jump (pular para outro estágio), complete (concluir follow-up).`
            },
            {
              role: 'user',
              content: `Campanha: ${campaign.name}
              Cliente ID: ${followUp.client_id}
              Estágio atual: ${currentStep.stage_name}
              Passo atual: ${currentStep.template_name}
              
              Estágios disponíveis: ${JSON.stringify(stagesInfo)}
              
              ${clientResponse ? `Última resposta do cliente: "${clientResponse}"` : 'Sem resposta recente do cliente'}
              
              Histórico de mensagens recentes:
              ${messages.map(m => `${m.is_from_client ? 'Cliente' : 'Sistema'}: ${m.content}`).join('\n')}
              
              Com base nessas informações, qual deve ser a próxima ação no fluxo de follow-up?`
            }
          ]
        })
      });
  
      const result = await response.json();
      const aiDecision = JSON.parse(result.choices[0].message.content);
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