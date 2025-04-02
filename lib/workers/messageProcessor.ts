// lib/workers/messageProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../redis.js';
import { prisma } from '../db.js';
import { generateChatCompletion } from '../ai/chatService.js';
import { Conversation, Message, Prisma, Workspace } from '@prisma/client';
import { CoreMessage } from 'ai';
import { enviarTextoLivreLumibot } from '../channel/lumibotSender.js';

const QUEUE_NAME = 'message-processing';
const BUFFER_TIME_MS = 10000; // Aumentar ligeiramente o buffer para 3 segundos

interface JobData {
  conversationId: string;
  clientId: string;
  newMessageId: string;    // ID da mensagem que disparou ESTE job
  workspaceId: string;
  receivedTimestamp: number; // Timestamp de quando o webhook recebeu a mensagem
}

async function processJob(job: Job<JobData>) {
  const { conversationId, clientId, newMessageId, workspaceId, receivedTimestamp } = job.data;
  const jobId = job.id || 'unknown'; // Pegar ID do job para logs
  console.log(`[Worker] Job ${jobId}: Iniciando processamento para conversa ${conversationId} (msg ${newMessageId})`);

  try {
    // --- 1. Lógica de Buffer Simples (Delay Inicial) ---
    // Espera um tempo fixo para permitir que mensagens rápidas cheguem
    console.log(`[Worker] Job ${jobId}: Aguardando ${BUFFER_TIME_MS}ms (buffer)...`);
    await new Promise(resolve => setTimeout(resolve, BUFFER_TIME_MS));
    console.log(`[Worker] Job ${jobId}: Buffer inicial concluído.`);

    // --- 2. Buscar Conversa e Verificar Status da IA ---
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        is_ai_active: true,
        channel_conversation_id: true,
        workspace_id: true,
        last_message_at: true // <<< Buscar o last_message_at atual da conversa
      }
    });

    if (!conversation) {
      throw new Error(`Conversa ${conversationId} não encontrada.`);
    }

    if (!conversation.is_ai_active) {
      console.log(`[Worker] Job ${jobId}: IA inativa para conversa ${conversationId}. Pulando.`);
      return { status: 'skipped', reason: 'IA Inativa' };
    }
    console.log(`[Worker] Job ${jobId}: IA está ativa.`);

    // --- 3. Buscar a Última Mensagem da IA (Ponto de Referência) ---
    const lastAiMessage = await prisma.message.findFirst({
      where: { conversation_id: conversationId, sender_type: 'AI' },
      orderBy: { timestamp: 'desc' },
    });
    const fetchMessagesSince = lastAiMessage ? lastAiMessage.timestamp : new Date(0);
    console.log(`[Worker] Job ${jobId}: Buscando mensagens do cliente desde ${fetchMessagesSince.toISOString()}`);

    // --- 4. Buscar TODAS as Mensagens Novas do Cliente desde a Última da IA ---
    const newClientMessages = await prisma.message.findMany({
      where: {
        conversation_id: conversationId,
        sender_type: 'CLIENT',
        timestamp: { gt: fetchMessagesSince },
      },
      orderBy: { timestamp: 'asc' }, // Mais antigas primeiro
      select: { id: true, timestamp: true } // Selecionar apenas ID e timestamp para a lógica de debounce
    });

    if (newClientMessages.length === 0) {
       console.log(`[Worker] Job ${jobId}: Nenhuma mensagem nova do cliente encontrada. Pulando.`);
       return { status: 'skipped', reason: 'Nenhuma mensagem nova do cliente' };
    }
    console.log(`[Worker] Job ${jobId}: Encontradas ${newClientMessages.length} novas mensagens do cliente desde a última IA.`);

    // --- 5. Lógica de Debounce/Agrupamento ---
    // Encontrar a mensagem MAIS RECENTE entre as novas mensagens do cliente
    const latestClientMessageInBatch = newClientMessages[newClientMessages.length - 1];

    // VERIFICAR se a mensagem que disparou ESTE job (newMessageId) é a MAIS RECENTE do lote.
    // Se NÃO for, outro job (o que foi disparado pela mensagem mais recente) vai cuidar do lote.
    if (newMessageId !== latestClientMessageInBatch.id) {
       console.log(`[Worker] Job ${jobId}: Este job (msg ${newMessageId}) não é o mais recente no lote (última msg: ${latestClientMessageInBatch.id}). Deixando para o job posterior processar. Pulando.`);
       // Marcar como concluído (sem erro), pois outro job tratará
       return { status: 'skipped', reason: `Handled by job for message ${latestClientMessageInBatch.id}` };
    }

    // Se chegou aqui, ESTE job é o responsável por processar o lote completo de newClientMessages.
    console.log(`[Worker] Job ${jobId}: Este job é o responsável pelo lote de ${newClientMessages.length} mensagens.`);

    // --- 6. Buscar Histórico Completo (Contexto para IA) ---
    const historyLimit = 20;
    // Inclui as mensagens que acabamos de identificar como novas + o histórico anterior
    const historyMessages = await prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { timestamp: 'desc' },
      take: historyLimit, // Pega as mais recentes, incluindo as que acabaram de chegar
    });
    historyMessages.reverse(); // Ordena cronologicamente
    console.log(`[Worker] Job ${jobId}: Contexto para IA com ${historyMessages.length} mensagens.`);

    // --- 7. Formatar Mensagens para a API da IA ---
    const aiMessages: CoreMessage[] = historyMessages.map(msg => ({
      role: msg.sender_type === 'CLIENT' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // --- 8. Buscar Prompt e Credenciais ---
    let systemPrompt: string | undefined;
    let lumibotAccountId: string | null = null;
    let lumibotApiToken: string | null = null;
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: conversation.workspace_id },
        select: { ai_default_system_prompt: true, lumibot_account_id: true, lumibot_api_token: true }
      });
      if (workspace) {
        systemPrompt = workspace.ai_default_system_prompt ?? undefined;
        lumibotAccountId = workspace.lumibot_account_id;
        lumibotApiToken = workspace.lumibot_api_token;
        console.log(`[Worker] Job ${jobId}: Prompt (${!!systemPrompt}) e credenciais Lumibot (${!!lumibotAccountId}/${!!lumibotApiToken}) carregados.`);
      } else {
         console.warn(`[Worker] Job ${jobId}: Workspace ${conversation.workspace_id} não encontrado.`);
      }
    } catch (e) {
      console.warn(`[Worker] Job ${jobId}: Erro ao buscar dados do workspace. Usando padrões. Erro:`, e);
    }

    // --- 9. Chamar o Serviço de IA ---
    console.log(`[Worker] Job ${jobId}: Chamando generateChatCompletion...`);
    const aiResponseContent = await generateChatCompletion({ messages: aiMessages, systemPrompt });

    // --- 10. Salvar e Enviar Resposta da IA ---
    if (aiResponseContent && aiResponseContent.trim() !== '') {
      const newAiMessageTimestamp = new Date(); // <<< Usar timestamp consistente
      const newAiMessage = await prisma.message.create({
        data: {
          conversation_id: conversationId,
          sender_type: 'AI',
          content: aiResponseContent,
          timestamp: newAiMessageTimestamp,
        }
      });
      console.log(`[Worker] Job ${jobId}: Resposta da IA salva (ID ${newAiMessage.id}).`);

      // Atualiza last_message_at ANTES de tentar enviar, para refletir a ação da IA
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: newAiMessageTimestamp }
      });
      console.log(`[Worker] Job ${jobId}: Timestamp da conversa atualizado para ${newAiMessageTimestamp.toISOString()}.`);

      // Enviar para Lumibot
      if (lumibotAccountId && lumibotApiToken && conversation.channel_conversation_id) {
        console.log(`[Worker] Job ${jobId}: Tentando enviar resposta via Lumibot...`);
        const sendResult = await enviarTextoLivreLumibot(
          lumibotAccountId,
          conversation.channel_conversation_id,
          lumibotApiToken,
          aiResponseContent
        );
        if (sendResult.success) {
          console.log(`[Worker] Job ${jobId}: Resposta enviada com sucesso para Lumibot.`);
        } else {
          console.error(`[Worker] Job ${jobId}: Falha ao enviar resposta para Lumibot.`, sendResult.responseData);
          // Considerar lançar erro se o envio for crucial
          // throw new Error(`Falha ao enviar mensagem para Lumibot: ${JSON.stringify(sendResult.responseData)}`);
        }
      } else {
         console.error(`[Worker] Job ${jobId}: Dados ausentes para envio via Lumibot.`);
         // Considerar lançar erro
         // throw new Error("Dados necessários para envio via Lumibot ausentes.");
      }
    } else {
      console.log(`[Worker] Job ${jobId}: IA não retornou conteúdo. Nenhuma mensagem salva ou enviada.`);
    }

    console.log(`[Worker] Job ${jobId} processado com sucesso (como responsável pelo lote).`);
    return { status: 'completed', handledBatch: true };

  } catch (error) {
    console.error(`[Worker] Erro CRÍTICO ao processar job ${jobId} para conversa ${conversationId}:`, error);
    throw error; // Re-lança para BullMQ tratar como falha
  }
}

// --- Inicialização do Worker (manter como está) ---
const worker = new Worker<JobData>(QUEUE_NAME, processJob, {
  connection: redisConnection,
  concurrency: 5, // Manter concorrência, a lógica de debounce cuida do agrupamento
});

// --- Listeners de Eventos (manter como está) ---
worker.on('completed', (job: Job<JobData>, result: any) => {
  console.log(`[Worker] Job ${job.id} (conversa ${job.data.conversationId}) concluído com status: ${result?.status || 'completed'}. Razão: ${result?.reason || (result?.handledBatch ? 'Processou o lote' : 'N/A')}`);
});

worker.on('failed', (job: Job<JobData> | undefined, err: Error) => {
  if (job) {
    console.error(`[Worker] Job ${job.id} (conversa ${job.data.conversationId}) falhou após ${job.attemptsMade} tentativas:`, err);
  } else {
    console.error('[Worker] Um job falhou (ID não disponível):', err);
  }
});

worker.on('error', (err) => {
  console.error('[Worker] Erro geral do worker:', err);
});

console.log(`[Worker] Message processor worker iniciado e escutando a fila "${QUEUE_NAME}"...`);