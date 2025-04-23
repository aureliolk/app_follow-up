// lib/workers/sequenceStepProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { sendWhatsappMessage } from '@/lib/channel/whatsappSender';
import { decrypt } from '@/lib/encryption';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue';
import { FollowUpStatus, Prisma, ConversationStatus, MessageSenderType } from '@prisma/client'; // Importe Prisma para tipos
import { formatMsToDelayString, parseDelayStringToMs } from '@/lib/timeUtils'; // Importar utils
import { generateChatCompletion } from '../ai/chatService';
import { CoreMessage } from 'ai';

// <<< RENOMEAR QUEUE_NAME se fizermos um worker separado no futuro >>>
const QUEUE_NAME = 'sequence-steps';

// <<< ATUALIZAR INTERFACE >>>
interface SequenceJobData {
  // Campos para FollowUp por Inatividade (tornar opcionais)
  followUpId?: string;
  stepRuleId?: string; // ID da WorkspaceAiFollowUpRule

  // Campos para Recuperação de Carrinho Abandonado (novos, opcionais)
  conversationId?: string;
  abandonedCartRuleId?: string; // ID da AbandonedCartRule

  // Campo comum e identificador de tipo (opcional, mas recomendado)
  workspaceId: string;
  jobType?: 'inactivity' | 'abandonedCart';
}

// --- Função de Processamento do Job ---
async function processSequenceStepJob(job: Job<SequenceJobData>) {
  // <<< EXTRAIR DADOS COM BASE NO TIPO >>>
  const jobId = job.id || 'unknown-job'; // Renomear para ser genérico
  const {
    followUpId,           // Pode ser undefined para jobs de carrinho
    stepRuleId,           // Pode ser undefined para jobs de carrinho
    conversationId,       // Pode ser undefined para jobs de inatividade
    abandonedCartRuleId,  // Pode ser undefined para jobs de inatividade
    workspaceId,
    jobType = abandonedCartRuleId ? 'abandonedCart' : 'inactivity' // Inferir tipo se não fornecido
  } = job.data;

  // <<< DECIDIR FLUXO COM BASE NO TIPO >>>
  if (jobType === 'abandonedCart') {

    if (!conversationId || !abandonedCartRuleId || !workspaceId) {
      console.error(`[AbandonedCartWorker ${jobId}] ERRO: Dados insuficientes para job de carrinho abandonado. Need conversationId, abandonedCartRuleId, workspaceId.`);
      throw new Error('Dados insuficientes para job de carrinho abandonado.');
    }
    try {

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          client: true,
          workspace: {
            select: {
              id: true,
              whatsappAccessToken: true,
              whatsappPhoneNumberId: true,
              ai_model_preference: true,
              ai_default_system_prompt: true,
              ai_name: true,
              // Incluir regras de carrinho abandonado aqui
              abandonedCartRules: {
                orderBy: { sequenceOrder: 'asc' },
                select: { id: true, delay_milliseconds: true, message_content: true, sequenceOrder: true },
              },
            }
          },
          messages: { // Opcional: incluir histórico se a IA precisar
            orderBy: { timestamp: 'asc' },
            take: 20,
            select: { sender_type: true, content: true, timestamp: true }
          }
        }
      });

      if (!conversation) {
        console.warn(`[AbandonedCartWorker ${jobId}] Conversation ${conversationId} não encontrada. Ignorando job.`);
        return { status: 'skipped', reason: 'Conversation não encontrada', type: 'abandonedCart' };
      }

      // 3. Verificar Workspace e Cliente
      if (!conversation.workspace) {
        console.error(`[AbandonedCartWorker ${jobId}] ERRO: Workspace não incluído para Conversation ${conversationId}.`);
        throw new Error(`Workspace não encontrado para Conversation ${conversationId}.`);
      }
      if (!conversation.client?.phone_number) {
        console.error(`[AbandonedCartWorker ${jobId}] ERRO: Cliente ou telefone não encontrado para Conversation ${conversationId}.`);
        throw new Error(`Cliente ou telefone não encontrado para Conversation ${conversationId}.`);
      }

      const workspaceData = conversation.workspace;
      const clientData = conversation.client;
      const clientPhoneNumber = clientData.phone_number;
      console.log(`[AbandonedCartWorker ${jobId}] Dados do Workspace (ID: ${workspaceData.id}) e Cliente (ID: ${clientData.id}) carregados.`);

      // 4. Encontrar a regra ATUAL de Carrinho Abandonado
      const currentAbandonedCartRule = workspaceData.abandonedCartRules.find((rule) => rule.id === abandonedCartRuleId);
      if (!currentAbandonedCartRule) {
        console.error(`[AbandonedCartWorker ${jobId}] Regra de carrinho abandonado ${abandonedCartRuleId} não encontrada no workspace ${workspaceData.id}.`);
        throw new Error(`Regra de carrinho ${abandonedCartRuleId} não encontrada.`);
      }
      console.log(`[AbandonedCartWorker ${jobId}] Regra de carrinho atual encontrada: ID=${currentAbandonedCartRule.id}`);

      // 5. Obter Credenciais e Descriptografar
      const { whatsappAccessToken, whatsappPhoneNumberId } = workspaceData;
      if (!whatsappAccessToken || !whatsappPhoneNumberId) {
        console.warn(`[AbandonedCartWorker ${jobId}] Credenciais WhatsApp ausentes para workspace ${workspaceData.id}.`);
        return { status: 'skipped', reason: 'Credenciais WhatsApp ausentes', type: 'abandonedCart' };
      }
      let decryptedAccessToken: string | null = null;
      try {
        decryptedAccessToken = decrypt(whatsappAccessToken);
        if (!decryptedAccessToken) throw new Error("Token descriptografado vazio.");
      } catch (decryptError: any) {
        console.error(`[AbandonedCartWorker ${jobId}] Falha ao descriptografar token WhatsApp:`, decryptError.message);
        return { status: 'failed', reason: 'Falha ao descriptografar token WhatsApp', type: 'abandonedCart' };
      }

      // --- SUBSTITUIR LÓGICA DE TEMPLATE PELA CHAMADA DA IA ---
      console.log(`[AbandonedCartWorker ${jobId}] Preparando para chamar IA para carrinho abandonado...`);
      let aiResponseText: string | null = null;
      const systemPromptInstruction = currentAbandonedCartRule.message_content; // Instrução da regra de carrinho
      const modelId = workspaceData.ai_model_preference || 'gpt-4o';
      const clientName = clientData.name || '';

      // Chamar IA
      try {
        aiResponseText = await generateChatCompletion({
          messages: [{ role: 'user', content: 'Oi' }],
          systemPrompt: `Voce e um proffisional de marketing e vendas. Sua missao e abordar o cliente para recuperar seu carrinho abandonado. Ultize o seguinte abordagem pontuada por nosso chefe: ${systemPromptInstruction}`,
          modelId: modelId,
          nameIa: workspaceData.ai_name || undefined,
          conversationId: conversation.id,
          workspaceId: workspaceData.id,
          clientName: clientName
        });
      } catch (aiError) {
        console.error(`[AbandonedCartWorker ${jobId}] Erro ao gerar conteúdo com IA (carrinho):`, aiError);
        // Decidir fallback: Usar instrução original ou falhar?
        // Usando instrução como fallback por enquanto:
        console.warn(`[AbandonedCartWorker ${jobId}] Usando instrução da regra como fallback devido a erro da IA.`);
        aiResponseText = systemPromptInstruction;
        if (clientName) {
          aiResponseText = aiResponseText.replace(/\[NomeCliente\]/gi, clientName);
        }
      }

      const messageToSend = aiResponseText; // <<< USA A RESPOSTA DA IA (ou fallback) >>>
      console.log(`[AbandonedCartWorker ${jobId}] Mensagem final (carrinho): "${messageToSend}"`);

      // 7. Enviar Mensagem via WhatsApp
      console.log(`[AbandonedCartWorker ${jobId}] Enviando mensagem de carrinho para WhatsApp (Número: ${clientPhoneNumber})...`);
      let sendSuccess = false;
      let errorMessage: string | null = null;
      let sentMessageIdFromWhatsapp: string | null = null;
      try {
        const sendResult = await sendWhatsappMessage(
          whatsappPhoneNumberId,
          clientPhoneNumber,
          decryptedAccessToken,
          messageToSend,
          workspaceData.ai_name || undefined // Usar nome da IA se configurado
        );
        if (sendResult.success && sendResult.wamid) {
          sendSuccess = true;
          sentMessageIdFromWhatsapp = sendResult.wamid;
        } else {
          errorMessage = JSON.stringify(sendResult.error || 'Erro desconhecido no envio WhatsApp');
        }
      } catch (sendError: any) {
        errorMessage = `Exceção durante envio WhatsApp: ${sendError.message}`;
        console.error(`[AbandonedCartWorker ${jobId}] Exceção ao enviar mensagem de carrinho via WhatsApp:`, sendError);
      }

      // 8. Lidar com Resultado, Salvar Mensagem, Agendar Próximo Passo
      let nextAbandonedCartRuleId: string | null = null;
      let nextDelayMs: number | null = null;

      if (sendSuccess) {
        console.log(`[AbandonedCartWorker ${jobId}] Mensagem de carrinho enviada com sucesso (WPP ID: ${sentMessageIdFromWhatsapp}).`);

        // Salvar mensagem na conversa
        try {
          const savedMessage = await prisma.message.create({
            data: {
              conversation_id: conversation.id,
              sender_type: MessageSenderType.AI, // Assumindo que sempre vem da IA agora
              content: messageToSend, // <<< USA A MENSAGEM DA IA/FALLBACK
              timestamp: new Date(),
              channel_message_id: sentMessageIdFromWhatsapp,
              metadata: {
                abandonedCartRuleId: abandonedCartRuleId,
                triggerEvent: 'abandoned_cart',
                originalPrompt: systemPromptInstruction // Guarda a instrução original
              }
            },
            select: { id: true }
          });
          console.log(`[AbandonedCartWorker ${jobId}] Mensagem de carrinho ${savedMessage.id} salva para Conv ${conversation.id}.`);

          // Publicar no Redis (adaptar payload se necessário)
          // ... Lógica de publicação no Redis para conversation e workspace updates ...

        } catch (saveError) {
          console.error(`[AbandonedCartWorker ${jobId}] ERRO ao salvar mensagem de carrinho para Conv ${conversation.id}:`, saveError);
          // Continuar mesmo se salvar falhar? Ou lançar erro?
        }

        // Encontrar a PRÓXIMA regra de CARRINHO na sequência
        // (Assumindo que a ordem é definida por 'sequenceOrder')
        const currentRuleOrder = currentAbandonedCartRule.sequenceOrder;
        const allCartRules = workspaceData.abandonedCartRules;
        // Encontrar a próxima regra com base na ordem (isso pode precisar de ajuste)
        const nextRule = allCartRules.find(rule => rule.sequenceOrder === currentRuleOrder + 1);
        // Alternativa: Ordenar por delay e pegar o próximo índice
        // const currentRuleIndex = allCartRules.findIndex(rule => rule.id === abandonedCartRuleId);
        // const nextRule = allCartRules[currentRuleIndex + 1];


        if (nextRule) {
          nextAbandonedCartRuleId = nextRule.id;
          nextDelayMs = Number(nextRule.delay_milliseconds); // Ou calcular o delay relativo ao passo anterior? Revisar lógica de delay.
          console.log(`[AbandonedCartWorker ${jobId}] Próxima regra de carrinho encontrada: ID=${nextAbandonedCartRuleId}, Delay=${nextDelayMs}ms`);
          if (isNaN(nextDelayMs) || nextDelayMs < 0) {
            console.warn(`[AbandonedCartWorker ${jobId}] Delay da próxima regra de carrinho (${nextAbandonedCartRuleId}) é inválido (${nextDelayMs}ms). Não será agendada.`);
            nextAbandonedCartRuleId = null;
            nextDelayMs = null;
          }
        } else {
          console.log(`[AbandonedCartWorker ${jobId}] Nenhuma regra de carrinho posterior encontrada. Sequência concluída.`);
        }

      } else {
        // O envio falhou
        console.error(`[AbandonedCartWorker ${jobId}] Envio da mensagem de carrinho falhou: ${errorMessage}`);
        // Lançar erro para BullMQ tentar novamente
        throw new Error(`Falha no envio WhatsApp para recuperação de carrinho: ${errorMessage}`);
      }

      // 9. Agendar próximo job de CARRINHO (se houver)
      if (nextAbandonedCartRuleId && nextDelayMs !== null) {
        const nextJobData: SequenceJobData = {
          conversationId: conversation.id, // Passar ID da conversa atual
          abandonedCartRuleId: nextAbandonedCartRuleId, // ID da próxima regra de carrinho
          workspaceId,
          jobType: 'abandonedCart' // Especificar tipo
        };
        const nextJobOptions = {
          delay: nextDelayMs, // Usar o delay da próxima regra
          jobId: `acart_${conversation.id}_rule_${nextAbandonedCartRuleId}`, // ID único para carrinho
          removeOnComplete: true,
          removeOnFail: 5000,
        };
        try {
          await sequenceStepQueue.add('processSequenceStep', nextJobData, nextJobOptions);
          console.log(`[AbandonedCartWorker ${jobId}] Próximo job de carrinho (regra ${nextAbandonedCartRuleId}) agendado com delay ${nextDelayMs}ms.`);
        } catch (scheduleError) {
          console.error(`[AbandonedCartWorker ${jobId}] ERRO ao agendar PRÓXIMO job de carrinho para Conv ${conversation.id}:`, scheduleError);
          throw new Error(`Falha ao agendar próximo passo da sequência de carrinho: ${scheduleError}`);
        }
        // Atualizar estado da conversa se necessário (ex: conversation.metadata.nextStepAt)
      } else {
        // Fim da sequência de carrinho
        console.log(`[AbandonedCartWorker ${jobId}] Fim da sequência de carrinho abandonado para Conv ${conversation.id}.`);
        // Marcar a conversa como concluída ou mudar status, se apropriado
        // await prisma.conversation.update({ where: { id: conversationId }, data: { status: ConversationStatus.CLOSED } }); // Exemplo
      }

      // --- FIM: LÓGICA DE CARRINHO ABANDONADO (Exemplo) ---

      console.log(`--- [AbandonedCartWorker ${jobId}] FIM (Sucesso Carrinho) ---`);
      return { status: 'completed', type: 'abandonedCart', nextStepScheduled: !!nextAbandonedCartRuleId };

    } catch (error: any) {
      console.error(`[AbandonedCartWorker ERROR ${jobId}] Erro processando abandoned cart rule ${abandonedCartRuleId} para Conversation ${conversationId}:`, error);
      // Marcar a Conversation como FAILED? Ou deixar BullMQ tentar de novo?
      // try {
      //   await prisma.conversation.update({ where: { id: conversationId }, data: { status: ConversationStatus.FAILED } }); // Exemplo
      // } catch (updateError) { ... }
      throw error; // Re-lança para BullMQ
    }

  } else { // jobType === 'inactivity' ou padrão
    // --- LÓGICA EXISTENTE PARA FOLLOW-UP POR INATIVIDADE ---
    console.log(`[SequenceWorker ${jobId}] Processando Step Rule ${stepRuleId} para FollowUp ${followUpId}`);
    if (!followUpId || !stepRuleId || !workspaceId) {
      console.error(`[SequenceWorker ${jobId}] ERRO: Dados insuficientes para job de inatividade. Need followUpId, stepRuleId, workspaceId.`);
      throw new Error('Dados insuficientes para job de inatividade.');
    }
    try {
      // 1. Buscar FollowUp e dados relacionados (Query CORRIGIDA - USA followUpId)
      console.log(`[SequenceWorker ${jobId}] Buscando FollowUp ${followUpId} com dados expandidos...`);
      // <<< O CÓDIGO RESTANTE DESTE BLOCO 'try' PERMANECE O MESMO >>>
      // <<< ELE USA followUpId e stepRuleId COMO ANTES >>>
      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: {
          workspace: {
            select: {
              id: true,
              whatsappAccessToken: true,
              whatsappPhoneNumberId: true,
              ai_model_preference: true,    // <<< Usar nome correto do schema
              ai_default_system_prompt: true, // <<< Usar nome correto do schema
              ai_name: true,                 // <<< Incluir ai_name
              ai_follow_up_rules: {      // Incluir as regras aqui dentro
                orderBy: { delay_milliseconds: 'asc' }, // <<< Ordenar por delay
                select: { id: true, delay_milliseconds: true, message_content: true },
              }
            },
          },
          client: {
            include: {
              conversations: {
                where: { channel: 'WHATSAPP', status: ConversationStatus.ACTIVE },
                orderBy: { last_message_at: 'desc' },
                take: 1,
                include: {
                  messages: {
                    orderBy: { timestamp: 'asc' },
                    take: 20, // Últimas 20 mensagens
                    select: { sender_type: true, content: true, timestamp: true }
                  }
                }
              }
            },
          },
        },
      });

      if (!followUp) {
        console.warn(`[SequenceWorker ${jobId}] FollowUp ${followUpId} não encontrado. Ignorando job.`);
        return { status: 'skipped', reason: 'FollowUp não encontrado', type: 'inactivity' };
      }
      console.log(`[SequenceWorker ${jobId}] FollowUp encontrado. Status: ${followUp.status}`);

      // 2. Verificar Status do FollowUp
      if (followUp.status !== FollowUpStatus.ACTIVE) { // Usar Enum
        console.log(`[SequenceWorker ${jobId}] FollowUp ${followUpId} não está ativo (Status: ${followUp.status}). Job ignorado.`);
        return { status: 'skipped', reason: `FollowUp não ativo (${followUp.status})`, type: 'inactivity' };
      }

      // 3. Verificar se o Workspace foi carregado
      if (!followUp.workspace) {
        console.error(`[SequenceWorker ${jobId}] ERRO INESPERADO: Workspace não incluído para FollowUp ${followUpId}.`);
        throw new Error(`Workspace não encontrado nos dados do FollowUp ${followUpId}.`);
      }

      const workspaceData = followUp.workspace;
      console.log(`[SequenceWorker ${jobId}] Dados do Workspace (ID: ${workspaceData.id}) carregados.`);

      // 4. Encontrar a regra ATUAL (WorkspaceAiFollowUpRule)
      const currentRule = workspaceData.ai_follow_up_rules.find((rule) => rule.id === stepRuleId);
      if (!currentRule) {
        console.error(`[SequenceWorker ${jobId}] Regra de passo de inatividade ${stepRuleId} não encontrada nas regras do workspace ${workspaceData.id}.`);
        throw new Error(`Regra de inatividade ${stepRuleId} não encontrada para o workspace.`);
      }
      console.log(`[SequenceWorker ${jobId}] Regra de inatividade atual encontrada: ID=${currentRule.id}`);

      // 5. Obter dados do Cliente e ID da Conversa (via FollowUp)
      const clientData = followUp.client;
      if (!clientData?.phone_number) {
        console.error(`[SequenceWorker ${jobId}] Cliente ou número de telefone não encontrado para FollowUp ${followUpId}.`);
        throw new Error(`Cliente ou telefone não encontrado nos dados do FollowUp ${followUpId}.`);
      }

      const clientPhoneNumber = clientData.phone_number;
      const activeConversation = clientData.conversations?.[0]; // Usa a conversa associada ao cliente do FollowUp
      if (!activeConversation) {
        console.warn(`[SequenceWorker ${jobId}] NENHUMA CONVERSA ATIVA encontrada para Cliente ${clientData.id} (via FollowUp ${followUpId}). Não é possível salvar a mensagem.`);
        // Considerar falhar o job se a conversa é essencial para a IA
        // throw new Error(`Conversa ativa não encontrada para FollowUp ${followUpId}`);
      } else {
        console.log(`[SequenceWorker ${jobId}] Conversa ativa encontrada via FollowUp: ID=${activeConversation.id}`);
      }
      console.log(`[SequenceWorker ${jobId}] Dados do Cliente (Nome: ${clientData.name || 'N/A'}, Telefone: ${clientPhoneNumber}) OK.`);

      // 6. Obter Credenciais WhatsApp e Descriptografar
      const { whatsappAccessToken, whatsappPhoneNumberId } = workspaceData;
      if (!whatsappAccessToken || !whatsappPhoneNumberId) {
        console.warn(`[SequenceWorker ${jobId}] Credenciais WhatsApp ausentes para workspace ${workspaceData.id}. Não é possível enviar.`);
        return { status: 'skipped', reason: 'Credenciais WhatsApp ausentes', type: 'inactivity' };
      }

      let decryptedAccessToken: string | null = null;
      try {
        decryptedAccessToken = decrypt(whatsappAccessToken);
        if (!decryptedAccessToken) throw new Error("Token de acesso WhatsApp descriptografado está vazio.");
      } catch (decryptError: any) {
        console.error(`[SequenceWorker ${jobId}] Falha ao descriptografar token WhatsApp para Workspace ${workspaceData.id}:`, decryptError.message);
        return { status: 'failed', reason: 'Falha ao descriptografar token WhatsApp', type: 'inactivity' };
      }

      // <<< PASSO 7: Preparar e Chamar IA (Lógica existente - REVISADA) >>>
      console.log(`[SequenceWorker ${jobId}] Preparando para chamar IA para inatividade...`);
      let aiResponseText: string | null = null;

      const systemPromptInstruction = currentRule.message_content;
      const baseSystemPrompt = workspaceData.ai_default_system_prompt || 'Você é um assistente prestativo.';
      const finalSystemPrompt = `${baseSystemPrompt}\n\nInstrução de Follow-up: ${systemPromptInstruction}`;
      const modelId = workspaceData.ai_model_preference || 'gpt-4o';
      const clientName = clientData.name || '';

      // <<< ADICIONAR LOGS DAS INSTRUÇÕES >>>
      console.log(`[SequenceWorker ${jobId} DEBUG] Instrução da Regra (currentRule.message_content):`, systemPromptInstruction);
      console.log(`[SequenceWorker ${jobId} DEBUG] Prompt Base do Workspace:`, baseSystemPrompt);
      console.log(`[SequenceWorker ${jobId} DEBUG] Prompt Final Enviado para IA:`, finalSystemPrompt);

      let messages: CoreMessage[] = [];
      if (!activeConversation || !activeConversation.messages || activeConversation.messages.length === 0) {
        console.warn(`[SequenceWorker ${jobId}] Não há conversa ativa ou histórico de mensagens para enviar à IA (inatividade). Usando a mensagem da regra como fallback.`);
        aiResponseText = systemPromptInstruction; // Usar a própria instrução como fallback simples
        if (clientName) {
          aiResponseText = aiResponseText.replace(/\[NomeCliente\]/gi, clientName);
        }
        // Se usarmos fallback, não precisamos chamar a IA, então pulamos para a validação
      } else {
        // Formatar histórico
        const aiMessages: CoreMessage[] = activeConversation.messages.map(msg => ({
          role: msg.sender_type === 'CLIENT' ? 'user' : 'assistant',
          content: msg.content || ''
        }));
        aiMessages.push({ role: 'user', content: '' }); // Adiciona trigger vazio
        messages = aiMessages; // Atribui ao messages que será usado
        console.log(`[SequenceWorker ${jobId}] Histórico formatado com ${messages.length} mensagens (incluindo trigger vazio).`)
        console.log(`[SequenceWorker ${jobId}] Histórico formatado:`, JSON.stringify(messages, null, 2));

        // Chama a IA somente se não usamos o fallback
        try {
          aiResponseText = await generateChatCompletion({
            messages: messages, // <<< Usa messages dinâmico >>>
            systemPrompt: systemPromptInstruction, // <<< Usa prompt dinâmico >>>
            modelId: modelId,
            nameIa: workspaceData.ai_name || undefined,
            conversationId: activeConversation.id, // Agora garantido que existe
            workspaceId: workspaceData.id,
            clientName: clientName
          });

        } catch (aiError) {
          console.error(`[SequenceWorker ${jobId}] Erro ao gerar conteúdo com IA (inatividade):`, aiError);
          throw new Error(`Falha ao gerar resposta da IA para follow-up de inatividade: ${aiError}`);
        }
      }

      // Validar se a IA retornou algo (ou se usamos o fallback)
      if (!aiResponseText || aiResponseText.trim() === '') {
        console.error(`[SequenceWorker ${jobId}] Resposta da IA para inatividade foi vazia ou nula.`);
        throw new Error('Resposta da IA para follow-up de inatividade foi vazia.');
      }

      const messageToSend = aiResponseText;
      console.log(`[SequenceWorker ${jobId}] Mensagem final (gerada pela IA para inatividade): "${messageToSend}"`);

      // 8. Enviar Mensagem via WhatsApp (Lógica existente)
      console.log(`[SequenceWorker ${jobId}] Enviando mensagem de inatividade para WhatsApp (Número: ${clientPhoneNumber})...`);
      let sendSuccess = false;
      let errorMessage: string | null = null;
      let sentMessageIdFromWhatsapp: string | null = null;
      try {
        const sendResult = await sendWhatsappMessage(
          whatsappPhoneNumberId,
          clientPhoneNumber,
          decryptedAccessToken,
          messageToSend,
          workspaceData.ai_name || undefined
        );
        if (sendResult.success && sendResult.wamid) {
          sendSuccess = true;
          sentMessageIdFromWhatsapp = sendResult.wamid;
        } else {
          errorMessage = JSON.stringify(sendResult.error || 'Erro desconhecido no envio WhatsApp');
        }
      } catch (sendError: any) {
        errorMessage = `Exceção durante envio WhatsApp: ${sendError.message}`;
        console.error(`[SequenceWorker ${jobId}] Exceção ao enviar mensagem de inatividade via WhatsApp para ${clientPhoneNumber}:`, sendError);
      }

      // 9. Lidar com Resultado do Envio, Salvar Mensagem, Publicar, Agendar Próximo Passo (Lógica existente)
      let nextRuleId: string | null = null;
      let nextDelayMs: number | null = null;

      if (sendSuccess) {
        console.log(`[SequenceWorker ${jobId}] Mensagem de inatividade enviada com sucesso (WPP ID: ${sentMessageIdFromWhatsapp}).`);

        if (activeConversation) { // Salvar apenas se houver conversa
          try {
            const savedMessage = await prisma.message.create({
              data: {
                conversation_id: activeConversation.id,
                sender_type: MessageSenderType.AI,
                content: messageToSend,
                timestamp: new Date(),
                channel_message_id: sentMessageIdFromWhatsapp,
                metadata: {
                  followUpId: followUpId,
                  stepRuleId: stepRuleId,
                  originalPrompt: systemPromptInstruction // <<< Usa a instrução original >>>
                }
              },
              select: { id: true }
            });
            console.log(`[SequenceWorker ${jobId}] Mensagem de follow-up ${savedMessage.id} salva para Conv ${activeConversation.id}.`);

            // <<< Publicar no Redis (lógica existente - verificar payloads) >>>
            // try {
            //   const conversationChannel = `chat-updates:${activeConversation.id}`;
            //   const conversationPayload = { /* ... payload ... */ };
            //   await redisConnection.publish(conversationChannel, JSON.stringify(conversationPayload));
            //   console.log(`[SequenceWorker ${jobId}] Mensagem ${savedMessage.id} publicada no canal Redis da CONVERSA: ${conversationChannel}`);
            // } catch (publishConvError) {
            //   console.error(`[SequenceWorker ${jobId}] Falha ao publicar mensagem ${savedMessage.id} no Redis (Canal Conversa):`, publishConvError);
            // }
            //
            // try {
            //    const workspaceChannel = `workspace-updates:${workspaceData.id}`;
            //    const workspacePayload = { /* ... payload enriquecido ... */ };
            //    await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
            //    console.log(`[SequenceWorker ${jobId}] Notificação ENRIQUECIDA (inatividade) publicada no canal Redis do WORKSPACE: ${workspaceChannel}`);
            // } catch (publishWsError) {
            //   console.error(`[SequenceWorker ${jobId}] Falha ao publicar notificação de inatividade no Redis (Canal Workspace):`, publishWsError);
            // }

          } catch (saveError) {
            console.error(`[SequenceWorker ${jobId}] ERRO ao salvar mensagem de follow-up de inatividade para Conv ${activeConversation?.id}:`, saveError);
          }
        } else {
          console.warn(`[SequenceWorker ${jobId}] Conversa ativa não encontrada via FollowUp. Mensagem enviada ("${messageToSend}") não será salva no histórico.`);
        }

        // Encontrar a PRÓXIMA regra de INATIVIDADE na sequência
        const currentRuleIndex = workspaceData.ai_follow_up_rules.findIndex((rule) => rule.id === stepRuleId);
        const nextRule = workspaceData.ai_follow_up_rules[currentRuleIndex + 1];

        if (nextRule) {
          nextRuleId = nextRule.id;
          nextDelayMs = Number(nextRule.delay_milliseconds); // Converter BigInt
          console.log(`[SequenceWorker ${jobId}] Próxima regra de inatividade encontrada: ID=${nextRuleId}, Delay=${nextDelayMs}ms`);
          if (isNaN(nextDelayMs) || nextDelayMs < 0) {
            console.warn(`[SequenceWorker ${jobId}] Delay da próxima regra de inatividade (${nextRuleId}) é inválido (${nextDelayMs}ms). Não será agendada.`);
            nextRuleId = null; // Anula agendamento
            nextDelayMs = null;
          }
        } else {
          console.log(`[SequenceWorker ${jobId}] Nenhuma regra de inatividade posterior encontrada. Sequência será concluída.`);
        }

      } else {
        // O envio falhou
        console.error(`[SequenceWorker ${jobId}] Envio da mensagem de inatividade falhou: ${errorMessage}`);
        throw new Error(`Falha no envio WhatsApp para follow-up de inatividade: ${errorMessage}`);
      }

      // 10. Atualizar o FollowUp no Banco (Lógica existente)
      const updateData: Prisma.FollowUpUpdateInput = {
        current_sequence_step_order: followUp.workspace.ai_follow_up_rules.findIndex((r) => r.id === stepRuleId) + 1,
        updated_at: new Date(),
      };

      if (nextRuleId && nextDelayMs !== null) {
        // Agenda próximo passo de INATIVIDADE
        updateData.next_sequence_message_at = new Date(Date.now() + nextDelayMs);
        updateData.status = FollowUpStatus.ACTIVE; // Manter ativo

        // Agendar job na fila
        const nextJobData: SequenceJobData = { // <<< Usar a interface atualizada >>>
          followUpId, // Passar o ID do FollowUp atual
          stepRuleId: nextRuleId, // Passar o ID da próxima regra de inatividade
          workspaceId: followUp.workspace.id,
          jobType: 'inactivity' // Especificar tipo
        };
        const nextJobOptions = {
          delay: nextDelayMs,
          jobId: `seq_${followUpId}_step_${nextRuleId}`, // ID único para inatividade
          removeOnComplete: true,
          removeOnFail: 5000,
        };
        try {
          await sequenceStepQueue.add('processSequenceStep', nextJobData, nextJobOptions);
          console.log(`[SequenceWorker ${jobId}] Próximo job de inatividade (regra ${nextRuleId}) agendado com delay ${nextDelayMs}ms.`);
        } catch (scheduleError) {
          console.error(`[SequenceWorker ${jobId}] ERRO ao agendar PRÓXIMO job de sequência de inatividade para FollowUp ${followUpId}:`, scheduleError);
          throw new Error(`Falha ao agendar próximo passo da sequência de inatividade: ${scheduleError}`);
        }

      } else {
        // Fim da sequência de INATIVIDADE
        console.log(`[SequenceWorker ${jobId}] Marcando FollowUp de inatividade ${followUpId} como COMPLETED.`);
        updateData.status = FollowUpStatus.COMPLETED;
        updateData.next_sequence_message_at = null;
        updateData.completed_at = new Date();
      }

      await prisma.followUp.update({
        where: { id: followUpId },
        data: updateData,
      });
      console.log(`[SequenceWorker ${jobId}] FollowUp de inatividade ${followUpId} atualizado no DB. Novo status: ${updateData.status}, NextMsgAt: ${updateData.next_sequence_message_at || 'N/A'}`);

      console.log(`--- [SequenceWorker ${jobId}] FIM (Sucesso Inatividade) ---`);
      return { status: 'completed', type: 'inactivity', nextStepScheduled: !!nextRuleId };

      // <<< O tratamento de erro 'catch' original permanece aqui para o bloco 'try' de inatividade >>>
    } catch (error: any) {
      console.error(`[SequenceWorker ERROR ${jobId}] Erro processando step de inatividade ${stepRuleId} para FollowUp ${followUpId}:`, error);
      // Tentar marcar o FollowUp de inatividade como FAILED
      if (followUpId) { // Só tenta atualizar se tivermos o ID
        try {
          await prisma.followUp.update({
            where: { id: followUpId },
            data: { status: FollowUpStatus.FAILED } // Usar Enum
          });
          console.log(`[SequenceWorker ${jobId}] FollowUp de inatividade ${followUpId} marcado como FAILED devido a erro.`);
        } catch (updateError) {
          console.error(`[SequenceWorker ${jobId}] Falha ao marcar FollowUp de inatividade ${followUpId} como FAILED:`, updateError);
        }
      }
      throw error; // Re-lança para BullMQ tratar retentativas
    }
  } // Fim do 'else' para jobType 'inactivity'
}

// --- Inicialização do Worker ---
console.log('[SequenceWorker] Tentando inicializar o worker...');
try {
  const sequenceWorker = new Worker<SequenceJobData>(QUEUE_NAME, processSequenceStepJob, {
    connection: redisConnection,
    concurrency: 5, // Ajustar conforme necessário
    // lockDuration: 60000 // Aumentar se o processamento + envio demorar mais que 30s
  });

  // --- Listeners de Eventos ---
  sequenceWorker.on('completed', (job: Job<SequenceJobData>, result: any) => {
    const type = result?.type || job.data?.jobType || 'unknown';
    const id = job.id || 'N/A';
    console.log(`[Worker(${type})] Job ${id} concluído. Status: ${result?.status || 'completed'}. Resultado:`, result);
  });

  sequenceWorker.on('failed', (job: Job<SequenceJobData> | undefined, err: Error) => {
    const type = job?.data?.jobType || (job?.data?.abandonedCartRuleId ? 'abandonedCart' : 'inactivity');
    const jobId = job?.id || 'N/A';
    const contextId = job?.data?.jobType === 'abandonedCart' ? `Conv: ${job?.data?.conversationId}` : `FollowUp: ${job?.data?.followUpId}`;
    const attempts = job?.attemptsMade || 0;
    console.error(`[Worker(${type})] Job ${jobId} (${contextId}) falhou após ${attempts} tentativas:`, err.message);
    // Evitar logar o erro completo se for muito verboso e já tratado no catch
    // console.error(err);
  });

  sequenceWorker.on('error', (err) => {
    // Erros gerais do worker, não relacionados a um job específico
    console.error('[Worker] Erro geral:', err);
  });

  sequenceWorker.on('stalled', (jobId: string) => {
    console.warn(`[Worker] Job ${jobId} estagnou (stalled). Verificando.`);
  });

  sequenceWorker.on('active', (job: Job<SequenceJobData>) => {
    const type = job.data?.jobType || (job.data?.abandonedCartRuleId ? 'abandonedCart' : 'inactivity');
    console.log(`[Worker EVENT] Job ATIVO (${type}): ${job.id || 'N/A'} Data:`, job.data);
  });

  console.log(`[Worker] Worker iniciado e escutando a fila "${QUEUE_NAME}"...`);

} catch (initError) {
  console.error('[Worker] Falha CRÍTICA ao inicializar o worker:', initError);
  process.exit(1);
}