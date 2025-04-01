// lib/workers/messageProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../redis.js';
import { prisma } from '../db.js';
import { generateChatCompletion } from '../ai/chatService.js';
import { Conversation, Message, Prisma, Workspace } from '@prisma/client';
import { CoreMessage } from 'ai';
import { enviarTextoLivreLumibot } from '../channel/lumibotSender.js'; // <<< IMPORTAR a função

const QUEUE_NAME = 'message-processing';

interface JobData {
  conversationId: string;
  clientId: string;
  newMessageId: string;
  workspaceId: string;
  receivedTimestamp: number;
}

async function processJob(job: Job<JobData>) {
  const { conversationId, clientId, newMessageId, workspaceId, receivedTimestamp } = job.data;
  console.log(`[Worker] Iniciando processamento do job ${job.id} para conversa ${conversationId}`);

  try {
    // --- 1. Lógica de Buffer Simples ---
    const bufferTimeMs = 2000;
    const timeElapsed = Date.now() - receivedTimestamp;
    const timeToWait = bufferTimeMs - timeElapsed;

    if (timeToWait > 0) {
      console.log(`[Worker] Job ${job.id}: Aguardando ${timeToWait}ms (buffer)...`);
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }
    console.log(`[Worker] Job ${job.id}: Buffer concluído. Continuando processamento.`);

    // --- 2. Buscar Conversa e Verificar Status da IA ---
    // Incluir o channel_conversation_id na busca
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        is_ai_active: true,
        channel_conversation_id: true, // <<< INCLUIR ID DA CONVERSA DO CANAL
        workspace_id: true // Precisamos do workspace_id
        // Inclua outros campos se necessário
      }
    });

    if (!conversation) {
      throw new Error(`Conversa ${conversationId} não encontrada.`);
    }

    if (!conversation.is_ai_active) {
      console.log(`[Worker] IA inativa para conversa ${conversationId}. Job ${job.id} concluído sem processamento AI.`);
      return { status: 'skipped', reason: 'IA Inativa' };
    }
    console.log(`[Worker] Job ${job.id}: IA está ativa para a conversa ${conversationId}.`);


    // --- 3. Buscar Mensagens Recentes do Cliente ---
    const lastAiMessage = await prisma.message.findFirst({
      where: { conversation_id: conversationId, sender_type: 'AI' },
      orderBy: { timestamp: 'desc' },
    });
    const fetchMessagesSince = lastAiMessage ? lastAiMessage.timestamp : new Date(0);
    const recentClientMessages = await prisma.message.findMany({
      where: {
        conversation_id: conversationId,
        sender_type: 'CLIENT',
        timestamp: { gt: fetchMessagesSince },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (recentClientMessages.length === 0) {
       console.log(`[Worker] Job ${job.id}: Nenhuma mensagem nova do cliente encontrada desde ${fetchMessagesSince.toISOString()}. Pulando chamada da IA.`);
       return { status: 'skipped', reason: 'Nenhuma mensagem nova do cliente' };
    }
    console.log(`[Worker] Job ${job.id}: Encontradas ${recentClientMessages.length} novas mensagens do cliente.`);

    // --- 4. Buscar Histórico Completo (Contexto para IA) ---
    const historyLimit = 20;
    const historyMessages = await prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { timestamp: 'desc' },
      take: historyLimit,
    });
    historyMessages.reverse();
    console.log(`[Worker] Job ${job.id}: Buscado histórico de ${historyMessages.length} mensagens.`);

    // --- 5. Formatar Mensagens para a API da IA ---
    const aiMessages: CoreMessage[] = historyMessages.map(msg => ({
      role: msg.sender_type === 'CLIENT' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // --- 6. Buscar Prompt Padrão e Credenciais Lumibot do Workspace ---
    let systemPrompt: string | undefined;
    let lumibotAccountId: string | null = null;
    let lumibotApiToken: string | null = null;

    try {
      // Buscar prompt e credenciais juntos
      const workspace = await prisma.workspace.findUnique({
        where: { id: conversation.workspace_id }, // Usar workspace_id da conversa
        select: {
            ai_default_system_prompt: true,
            lumibot_account_id: true,       // <<< BUSCAR CREDENCIAIS
            lumibot_api_token: true         // <<< BUSCAR CREDENCIAIS
        }
      });
      if (workspace) {
        systemPrompt = workspace.ai_default_system_prompt ?? undefined;
        lumibotAccountId = workspace.lumibot_account_id;
        lumibotApiToken = workspace.lumibot_api_token;
        console.log(`[Worker] Job ${job.id}: Prompt e credenciais Lumibot carregados do workspace ${conversation.workspace_id}. Prompt definido: ${!!systemPrompt}, AccountId: ${!!lumibotAccountId}, Token: ${!!lumibotApiToken}`);
      } else {
         console.warn(`[Worker] Job ${job.id}: Workspace ${conversation.workspace_id} não encontrado ao buscar credenciais/prompt.`);
      }
    } catch (e) {
      console.warn(`[Worker] Job ${job.id}: Erro ao buscar dados do workspace ${conversation.workspace_id}. Usando padrões. Erro:`, e);
    }

    // --- 7. Chamar o Serviço de IA ---
    console.log(`[Worker] Job ${job.id}: Chamando generateChatCompletion...`);
    const aiResponseContent = await generateChatCompletion({
      messages: aiMessages,
      systemPrompt: systemPrompt
    });

    // --- 8. Salvar a Resposta da IA ---
    if (aiResponseContent && aiResponseContent.trim() !== '') {
      const newAiMessage = await prisma.message.create({
        data: {
          conversation_id: conversationId,
          sender_type: 'AI',
          content: aiResponseContent,
          timestamp: new Date(),
          // metadata: { modelUsed: 'gpt-4o' }
        }
      });
      console.log(`[Worker] Job ${job.id}: Resposta da IA salva com ID ${newAiMessage.id}.`);

      // --- 9. Atualizar 'last_message_at' na Conversa ---
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: newAiMessage.timestamp }
      });
      console.log(`[Worker] Job ${job.id}: Timestamp da conversa ${conversationId} atualizado para ${newAiMessage.timestamp.toISOString()}.`);

      // --- 10. ENVIAR A RESPOSTA PARA O CANAL (LUMIBOT) ---
      if (lumibotAccountId && lumibotApiToken && conversation.channel_conversation_id) {
        console.log(`[Worker] Job ${job.id}: Tentando enviar resposta via Lumibot...`);
        const sendResult = await enviarTextoLivreLumibot(
          lumibotAccountId,
          conversation.channel_conversation_id, // Usar o ID da conversa do canal
          lumibotApiToken,
          aiResponseContent
        );

        if (sendResult.success) {
          console.log(`[Worker] Job ${job.id}: Resposta enviada com sucesso para Lumibot. ID da mensagem criada: ${sendResult.responseData?.id}`);
          // Opcional: Atualizar metadados da mensagem da IA salva no DB
          // await prisma.message.update({ where: { id: newAiMessage.id }, data: { metadata: { ...(newAiMessage.metadata as any), lumibotSent: true, lumibotMessageId: sendResult.responseData?.id } } });
        } else {
          console.error(`[Worker] Job ${job.id}: Falha ao enviar resposta para Lumibot. Resposta API:`, sendResult.responseData);
          // Opcional: Tratar falha no envio (marcar mensagem, tentar novamente?)
          // Por ora, apenas logamos o erro. O job BullMQ ainda será considerado 'completed'.
          // Se a falha no envio for crítica, você pode lançar um erro aqui para que o BullMQ tente novamente:
          // throw new Error(`Falha ao enviar mensagem para Lumibot: ${JSON.stringify(sendResult.responseData)}`);
        }
      } else {
         console.error(`[Worker] Job ${job.id}: Não foi possível enviar resposta para Lumibot. Dados ausentes:`, {
             hasAccountId: !!lumibotAccountId,
             hasToken: !!lumibotApiToken,
             hasChannelConvId: !!conversation.channel_conversation_id
         });
         // Lançar erro se o envio for obrigatório?
         // throw new Error("Dados necessários para envio via Lumibot ausentes.");
      }

    } else {
      console.log(`[Worker] Job ${job.id}: IA não retornou conteúdo ou conteúdo vazio. Nenhuma mensagem salva ou enviada.`);
    }

    console.log(`[Worker] Job ${job.id} processado com sucesso.`);
    return { status: 'completed' };

  } catch (error) {
    console.error(`[Worker] Erro ao processar job ${job.id} para conversa ${conversationId}:`, error);
    throw error; // Re-lança para BullMQ tratar como falha
  }
}

// --- Inicialização do Worker (sem alterações) ---
const worker = new Worker<JobData>(QUEUE_NAME, processJob, {
  connection: redisConnection,
  concurrency: 5,
});

worker.on('completed', (job: Job<JobData>, result: any) => {
  console.log(`[Worker] Job ${job.id} (conversa ${job.data.conversationId}) concluído com status: ${result?.status || 'completed'}.`);
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