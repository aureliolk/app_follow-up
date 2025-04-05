// lib/workers/messageProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@meuprojeto/shared-lib/redis';
import { prisma } from '@meuprojeto/shared-lib/db';
import { generateChatCompletion } from '@meuprojeto/shared-lib/ai/chatService';
import { enviarTextoLivreLumibot } from '@meuprojeto/shared-lib/channel/lumibotSender';
import { MessageSenderType } from '@prisma/client'; // Importar tipos e Enums
import { CoreMessage } from 'ai'; // Tipo para Vercel AI SDK

const QUEUE_NAME = 'message-processing';
const BUFFER_TIME_MS = 3000; // 3 segundos de buffer (ajuste se necessário)
const HISTORY_LIMIT = 20;   // Número máximo de mensagens no histórico para IA

interface JobData {
  conversationId: string;
  clientId: string;
  newMessageId: string;    // ID da mensagem do cliente que disparou ESTE job
  workspaceId: string;
  receivedTimestamp: number; // Timestamp de quando o webhook recebeu a mensagem
}

// Define o tipo esperado para as mensagens do histórico
type HistoryMessage = {
  sender_type: MessageSenderType;
  content: string | null; // Content pode ser null
  timestamp: Date;
};

async function processJob(job: Job<JobData>) {
  const { conversationId, clientId, newMessageId, workspaceId, receivedTimestamp } = job.data;
  const jobId = job.id || 'unknown'; // Pegar ID do job para logs
  console.log(`\n--- [MsgProcessor ${jobId}] INÍCIO ---`);
  console.log(`[MsgProcessor ${jobId}] Processando msg ${newMessageId} para Conv ${conversationId}, Cliente ${clientId}, Wks ${workspaceId}`);

  try {
    // --- 1. Buffer Inicial Simples ---
    console.log(`[MsgProcessor ${jobId}] Aguardando ${BUFFER_TIME_MS}ms (buffer)...`);
    await new Promise(resolve => setTimeout(resolve, BUFFER_TIME_MS));
    console.log(`[MsgProcessor ${jobId}] Buffer inicial concluído.`);

    // --- 2. Buscar Conversa e Verificar Status da IA ---
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        is_ai_active: true,
        channel_conversation_id: true,
        workspace_id: true,
        // Selecionar também dados do workspace necessários aqui
        workspace: {
            select: {
                id: true,
                ai_default_system_prompt: true,
                lumibot_account_id: true,
                lumibot_api_token: true,
                // Incluir regras para agendamento posterior
                 ai_follow_up_rules: {
                    orderBy: { delay_milliseconds: 'asc' },
                    select: { id: true, delay_milliseconds: true },
                    take: 1 // Só precisamos da primeira (menor delay)
                }
            }
        }
      }
    });

    if (!conversation) {
      console.error(`[MsgProcessor ${jobId}] Erro: Conversa ${conversationId} não encontrada.`);
      // Lançar erro pode fazer o job tentar novamente, o que pode ser útil
      // ou retornar um status de falha controlada.
      throw new Error(`Conversa ${conversationId} não encontrada.`);
    }
    if (!conversation.workspace) {
         console.error(`[MsgProcessor ${jobId}] Erro: Workspace associado à conversa ${conversationId} não encontrado.`);
         throw new Error(`Workspace para a conversa ${conversationId} não encontrado.`);
    }

    if (!conversation.is_ai_active) {
      console.log(`[MsgProcessor ${jobId}] IA inativa para conversa ${conversationId}. Pulando.`);
      return { status: 'skipped', reason: 'IA Inativa' };
    }
    console.log(`[MsgProcessor ${jobId}] IA está ativa para a conversa.`);

    // --- 3. Identificar Mensagens Recentes do Cliente (Lógica Debounce) ---
    // Buscar a última mensagem enviada pela IA como ponto de referência
    const lastAiMessage = await prisma.message.findFirst({
      where: { conversation_id: conversationId, sender_type: MessageSenderType.AI },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    });
    const fetchMessagesSince = lastAiMessage?.timestamp || new Date(0); // Se não houver msg da IA, pega desde o início
    console.log(`[MsgProcessor ${jobId}] Buscando mensagens do cliente desde: ${fetchMessagesSince.toISOString()}`);

    // Buscar IDs e timestamps de TODAS as mensagens do CLIENTE desde a última da IA
    const newClientMessages = await prisma.message.findMany({
      where: {
        conversation_id: conversationId,
        sender_type: MessageSenderType.CLIENT, // Apenas do cliente
        timestamp: { gt: fetchMessagesSince },   // Apenas as que chegaram DEPOIS da última IA
      },
      orderBy: { timestamp: 'asc' }, // Ordena da mais antiga para a mais recente
      select: { id: true, timestamp: true }
    });

    if (newClientMessages.length === 0) {
       console.log(`[MsgProcessor ${jobId}] Nenhuma mensagem NOVA do cliente encontrada desde a última da IA. Pulando processamento de IA.`);
       // Poderia haver uma mensagem antiga que reativou, mas sem conteúdo novo para a IA processar.
       return { status: 'skipped', reason: 'Nenhuma mensagem nova do cliente para IA' };
    }
    console.log(`[MsgProcessor ${jobId}] Encontradas ${newClientMessages.length} novas mensagens do cliente desde a última IA.`);

    // Identificar a mensagem MAIS RECENTE dentro deste lote
    const latestClientMessageInBatch = newClientMessages[newClientMessages.length - 1];
    console.log(`[MsgProcessor ${jobId}] Mensagem mais recente no lote: ID=${latestClientMessageInBatch.id}, Timestamp=${latestClientMessageInBatch.timestamp.toISOString()}`);

    // Verificar se ESTE job corresponde à mensagem MAIS RECENTE do lote
    if (newMessageId !== latestClientMessageInBatch.id) {
       console.log(`[MsgProcessor ${jobId}] Este job (msg ${newMessageId}) NÃO é o mais recente. Outro job (para msg ${latestClientMessageInBatch.id}) processará o lote. Pulando.`);
       // Marcar como concluído (sem erro), pois outro job tratará.
       // Não precisa retornar erro aqui.
       return { status: 'skipped', reason: `Lote será tratado pelo job da msg ${latestClientMessageInBatch.id}` };
    }

    // Se chegou aqui, ESTE job é o responsável por processar o lote completo.
    console.log(`[MsgProcessor ${jobId}] ESTE JOB (msg ${newMessageId}) É O RESPONSÁVEL PELO LOTE.`);

    // --- 4. Buscar Histórico Completo (Contexto para IA) ---
    console.log(`[MsgProcessor ${jobId}] Buscando histórico completo (limite ${HISTORY_LIMIT}) para IA...`);
    const historyMessages = await prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { timestamp: 'desc' }, // Mais recentes primeiro
      take: HISTORY_LIMIT,
      select: { sender_type: true, content: true, timestamp: true } // Selecionar campos necessários
    });
    historyMessages.reverse(); // Reordenar para cronológico (mais antigo primeiro)
    console.log(`[MsgProcessor ${jobId}] Histórico obtido com ${historyMessages.length} mensagens.`);

    // --- 5. Formatar Mensagens para a API da IA ---
    const aiMessages: CoreMessage[] = historyMessages.map((msg: HistoryMessage) => ({
      role: msg.sender_type === MessageSenderType.CLIENT ? 'user' : 'assistant', // CLIENT -> user, AI/SYSTEM -> assistant
      content: msg.content ?? '', // Usa '' se content for null
    }));

    // --- 6. Obter Prompt e Credenciais do Workspace (já buscado) ---
    const systemPrompt = conversation.workspace.ai_default_system_prompt ?? undefined;
    const { lumibot_account_id, lumibot_api_token } = conversation.workspace;
    console.log(`[MsgProcessor ${jobId}] Usando prompt: ${!!systemPrompt}, Creds Lumibot: ${!!lumibot_account_id}/${!!lumibot_api_token}`);

    // --- 7. Chamar o Serviço de IA ---
    console.log(`[MsgProcessor ${jobId}] Chamando generateChatCompletion...`);
    const aiResponseContent = await generateChatCompletion({ messages: aiMessages, systemPrompt });

    // --- 8. Salvar e Enviar Resposta da IA ---
    if (aiResponseContent && aiResponseContent.trim() !== '') {
      console.log(`[MsgProcessor ${jobId}] IA retornou conteúdo: "${aiResponseContent.substring(0, 100)}..."`);
      const newAiMessageTimestamp = new Date(); // Timestamp consistente para salvar e agendar

      // Salvar a resposta da IA no banco
      const newAiMessage = await prisma.message.create({
        data: {
          conversation_id: conversationId,
          sender_type: MessageSenderType.AI, // Marcar como AI
          content: aiResponseContent,
          timestamp: newAiMessageTimestamp, // Usar timestamp consistente
        },
        select: { id: true } // Selecionar apenas o ID
      });
      console.log(`[MsgProcessor ${jobId}] Resposta da IA salva no DB (ID: ${newAiMessage.id}).`);

      // Atualizar last_message_at da conversa para refletir a ação da IA
      // Fazemos isso ANTES de tentar enviar para garantir que o estado reflita a intenção
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: newAiMessageTimestamp }
      });
      console.log(`[MsgProcessor ${jobId}] Timestamp da conversa atualizado para: ${newAiMessageTimestamp.toISOString()}.`);

      // Enviar para Lumibot
      let sendSuccess = false; // Flag para controlar o agendamento
      if (lumibot_account_id && lumibot_api_token && conversation.channel_conversation_id) {
        console.log(`[MsgProcessor ${jobId}] Tentando enviar resposta via Lumibot para channel_conv_id ${conversation.channel_conversation_id}...`);
        const sendResult = await enviarTextoLivreLumibot(
          lumibot_account_id,
          conversation.channel_conversation_id,
          lumibot_api_token,
          aiResponseContent
        );

        if (sendResult.success) {
          sendSuccess = true;
          console.log(`[MsgProcessor ${jobId}] Resposta enviada com sucesso para Lumibot.`);
        } else {
          console.error(`[MsgProcessor ${jobId}] Falha ao enviar resposta para Lumibot. Detalhes:`, JSON.stringify(sendResult.responseData));
          // DECISÃO: Não lançar erro aqui para não impedir o agendamento se desejado, mas logar criticamente.
          // Se o envio for MANDATÓRIO para continuar, descomente a linha abaixo:
          // throw new Error(`Falha ao enviar mensagem para Lumibot: ${JSON.stringify(sendResult.responseData)}`);
        }
      } else {
         // Logar erro se dados estiverem faltando, mas não falhar o job necessariamente
         console.error(`[MsgProcessor ${jobId}] Dados ausentes para envio via Lumibot (AccountID: ${!!lumibot_account_id}, Token: ${!!lumibot_api_token}, ChannelConvID: ${!!conversation.channel_conversation_id}).`);
         // Poderia lançar erro aqui se o envio for obrigatório:
         // throw new Error("Dados necessários para envio via Lumibot ausentes.");
      }

    } else {
      console.log(`[MsgProcessor ${jobId}] IA não retornou conteúdo. Nenhuma mensagem salva ou enviada. Nenhum job de inatividade agendado.`);
    }

    console.log(`--- [MsgProcessor ${jobId}] FIM (Processou Lote) ---`);
    return { status: 'completed', handledBatch: true };

  } catch (error) {
    console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO no processamento para Conv ${conversationId}:`, error);
     if (error instanceof Error) {
        console.error(error.stack); // Logar stack trace
    }
    console.log(`--- [MsgProcessor ${jobId}] FIM (Erro Crítico) ---`);
    throw error; // Re-lança para BullMQ tratar como falha
  }
}

// --- Inicialização do Worker ---
console.log(`[MsgProcessor] Tentando inicializar o worker para a fila "${QUEUE_NAME}"...`);
try {
    const worker = new Worker<JobData>(QUEUE_NAME, processJob, {
      connection: redisConnection,
      concurrency: 5, // Ajuste a concorrência conforme necessário
    });

    // --- Listeners de Eventos ---
    worker.on('completed', (job: Job<JobData>, result: any) => {
      console.log(`[MsgProcessor] Job ${job.id} (Conv: ${job.data?.conversationId}) concluído. Status: ${result?.status || 'N/A'}. Razão: ${result?.reason || (result?.handledBatch ? 'Processou Lote' : 'N/A')}`);
    });

    worker.on('failed', (job: Job<JobData> | undefined, err: Error) => {
      const jobId = job?.id || 'N/A';
      const convId = job?.data?.conversationId || 'N/A';
      const attempts = job?.attemptsMade || 0;
      console.error(`[MsgProcessor] Job ${jobId} (Conv: ${convId}) falhou após ${attempts} tentativas:`, err.message);
      console.error(err); // Log completo do erro
    });

    worker.on('error', (err) => {
      console.error('[MsgProcessor] Erro geral do worker:', err);
    });

    worker.on('stalled', (jobId: string) => {
        console.warn(`[MsgProcessor] Job ${jobId} estagnou (stalled). Verifique a conexão e o processamento.`);
    });


    console.log(`[MsgProcessor] Worker iniciado e escutando a fila "${QUEUE_NAME}"...`);

} catch (initError) {
     console.error('[MsgProcessor] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1); // Sai se não conseguir inicializar
}