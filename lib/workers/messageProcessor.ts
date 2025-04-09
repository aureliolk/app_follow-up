// lib/workers/messageProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { generateChatCompletion } from '@/lib/ai/chatService';
import { enviarTextoLivreLumibot } from '@/lib/channel/lumibotSender';
// Importar a função de envio do WhatsApp (deve existir em lib/channel/whatsappSender.ts)
import { sendWhatsappMessage } from '@/lib/channel/whatsappSender';
import { MessageSenderType, ConversationStatus } from '@prisma/client'; // Adicionar ConversationStatus
import { CoreMessage } from 'ai'; // Tipo para Vercel AI SDK
// Importar função de descriptografia
import { decrypt } from '@/lib/encryption';

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

    // --- 2. Buscar Conversa, Canal, Credenciais e Verificar Status da IA ---
    console.log(`[MsgProcessor ${jobId}] Buscando dados da conversa ${conversationId} e workspace...`);
    const conversationData = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        is_ai_active: true,
        channel_conversation_id: true, // Usado por Lumibot
        channel: true,                 // ** NOVO: Precisamos do canal **
        client: {                      // ** NOVO: Precisamos do telefone do cliente para WhatsApp **
            select: { phone_number: true }
        },
        workspace_id: true,
        workspace: {
            select: {
                id: true,
                ai_default_system_prompt: true,
                ai_model_preference: true,
                // Lumibot creds
                lumibot_account_id: true,
                lumibot_api_token: true,
                // WhatsApp creds (precisam ser descriptografados)
                whatsappAccessToken: true,
                whatsappPhoneNumberId: true,
                // Regras de Follow-up
                 ai_follow_up_rules: {
                    orderBy: { delay_milliseconds: 'asc' },
                    select: { id: true, delay_milliseconds: true },
                    take: 1 // Só precisamos da primeira (menor delay)
                }
            }
        }
      }
    });

    if (!conversationData) {
      console.error(`[MsgProcessor ${jobId}] Erro: Conversa ${conversationId} não encontrada.`);
      throw new Error(`Conversa ${conversationId} não encontrada.`);
    }
    if (!conversationData.workspace) {
         console.error(`[MsgProcessor ${jobId}] Erro: Workspace associado à conversa ${conversationId} não encontrado.`);
         throw new Error(`Workspace para a conversa ${conversationId} não encontrado.`);
    }
    if (!conversationData.client || !conversationData.client.phone_number) {
         console.error(`[MsgProcessor ${jobId}] Erro: Cliente ou telefone do cliente não encontrado para Conv ${conversationId}.`);
         throw new Error(`Cliente ou telefone não encontrado para a conversa ${conversationId}.`);
    }

    // Destruturar dados para facilitar acesso
    const { channel, client, workspace } = conversationData;
    const clientPhoneNumber = client.phone_number; // Telefone do destinatário para WhatsApp

    // <<< NOVO LOG APÓS LEITURA >>>
    console.log(`[MsgProcessor ${jobId}] Dados lidos do DB para Conv ${conversationId}. Canal LIDO: ${channel}`);

    if (!conversationData.is_ai_active) {
      console.log(`[MsgProcessor ${jobId}] IA inativa para conversa ${conversationId}. Pulando.`);
      return { status: 'skipped', reason: 'IA Inativa' };
    }
    console.log(`[MsgProcessor ${jobId}] IA está ativa para a conversa (Canal: ${channel}).`);

    // --- 3. Identificar Mensagens Recentes do Cliente (Lógica Debounce) ---
    const lastAiMessage = await prisma.message.findFirst({
      where: { conversation_id: conversationId, sender_type: MessageSenderType.AI },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    });
    const fetchMessagesSince = lastAiMessage?.timestamp || new Date(0);
    console.log(`[MsgProcessor ${jobId}] Buscando mensagens do cliente desde: ${fetchMessagesSince.toISOString()}`);

    const newClientMessages = await prisma.message.findMany({
      where: {
        conversation_id: conversationId,
        sender_type: MessageSenderType.CLIENT,
        timestamp: { gt: fetchMessagesSince },
      },
      orderBy: { timestamp: 'asc' },
      select: { id: true, timestamp: true }
    });

    if (newClientMessages.length === 0) {
       console.log(`[MsgProcessor ${jobId}] Nenhuma mensagem NOVA do cliente encontrada desde a última da IA. Pulando processamento de IA.`);
       return { status: 'skipped', reason: 'Nenhuma mensagem nova do cliente para IA' };
    }
    console.log(`[MsgProcessor ${jobId}] Encontradas ${newClientMessages.length} novas mensagens do cliente desde a última IA.`);

    const latestClientMessageInBatch = newClientMessages[newClientMessages.length - 1];
    console.log(`[MsgProcessor ${jobId}] Mensagem mais recente no lote: ID=${latestClientMessageInBatch.id}, Timestamp=${latestClientMessageInBatch.timestamp.toISOString()}`);

    if (newMessageId !== latestClientMessageInBatch.id) {
       console.log(`[MsgProcessor ${jobId}] Este job (msg ${newMessageId}) NÃO é o mais recente. Outro job (para msg ${latestClientMessageInBatch.id}) processará o lote. Pulando.`);
       return { status: 'skipped', reason: `Lote será tratado pelo job da msg ${latestClientMessageInBatch.id}` };
    }

    console.log(`[MsgProcessor ${jobId}] ESTE JOB (msg ${newMessageId}) É O RESPONSÁVEL PELO LOTE.`);

    // --- 4. Buscar Histórico Completo (Contexto para IA) ---
    console.log(`[MsgProcessor ${jobId}] Buscando histórico completo (limite ${HISTORY_LIMIT}) para IA...`);
    const historyMessages = await prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { timestamp: 'desc' },
      take: HISTORY_LIMIT,
      select: { sender_type: true, content: true, timestamp: true }
    });
    historyMessages.reverse();
    console.log(`[MsgProcessor ${jobId}] Histórico obtido com ${historyMessages.length} mensagens.`);

    // --- 5. Formatar Mensagens para a API da IA ---
    const aiMessages: CoreMessage[] = historyMessages.map((msg: HistoryMessage) => ({
      role: msg.sender_type === MessageSenderType.CLIENT ? 'user' : 'assistant',
      content: msg.content ?? '',
    }));

    // --- 6. Obter Prompt e Modelo (já feito na busca) ---
    const modelId = conversationData.workspace.ai_model_preference || 'gpt-4o'; // Ajuste o padrão se necessário
    const systemPrompt = conversationData.workspace.ai_default_system_prompt ?? undefined;
    console.log(`[MsgProcessor ${jobId}] Usando Modelo: ${modelId}, Prompt: ${!!systemPrompt}`);

    // --- 7. Chamar o Serviço de IA ---
    console.log(`[MsgProcessor ${jobId}] Chamando generateChatCompletion...`);
    const aiResponseContent = await generateChatCompletion({ messages: aiMessages, systemPrompt, modelId });

    // --- 8. Salvar e Enviar Resposta da IA (LÓGICA CONDICIONAL) ---
    if (aiResponseContent && aiResponseContent.trim() !== '') {
      console.log(`[MsgProcessor ${jobId}] IA retornou conteúdo: "${aiResponseContent.substring(0, 100)}..."`);
      const newAiMessageTimestamp = new Date();

      // Salvar a resposta da IA no banco
      const newAiMessage = await prisma.message.create({
        data: {
          conversation_id: conversationId,
          sender_type: MessageSenderType.AI,
          content: aiResponseContent,
          timestamp: newAiMessageTimestamp,
        },
      });
      console.log(`[MsgProcessor ${jobId}] Resposta da IA salva no DB (ID: ${newAiMessage.id}).`);

      // Publicar a nova mensagem no canal Redis da CONVERSA
      try {
        const conversationChannel = `chat-updates:${conversationId}`;
        // Certifique-se de que newAiMessage tenha os dados necessários ou faça nova busca
        const conversationPayload = JSON.stringify(newAiMessage);
        await redisConnection.publish(conversationChannel, conversationPayload);
        console.log(`[MsgProcessor ${jobId}] Mensagem da IA ${newAiMessage.id} publicada no canal Redis da CONVERSA: ${conversationChannel}`);
      } catch (publishError) {
        console.error(`[MsgProcessor ${jobId}] Falha ao publicar mensagem da IA ${newAiMessage.id} no Redis (Canal Conversa):`, publishError);
      }

      // <<< NOVO: PUBLICAR NOTIFICAÇÃO NO CANAL REDIS DO WORKSPACE >>>
       try {
          // Precisamos do workspaceId aqui, que já temos de job.data
          const workspaceChannel = `workspace-updates:${workspaceId}`;
          const workspacePayload = {
              type: 'new_message', // Mesmo tipo de evento
              conversationId: conversationId,
              clientId: clientId, // Já temos de job.data
              lastMessageTimestamp: newAiMessage.timestamp.toISOString(), // Timestamp da msg da IA
          };
          await redisConnection.publish(workspaceChannel, JSON.stringify(workspacePayload));
          console.log(`[MsgProcessor ${jobId}] Notificação de msg IA publicada no canal Redis do WORKSPACE: ${workspaceChannel}`);
       } catch (publishError) {
          console.error(`[MsgProcessor ${jobId}] Falha ao publicar notificação de msg IA no Redis (Canal Workspace):`, publishError);
          // Não parar o fluxo por isso
       }

      // Atualizar last_message_at da conversa
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: newAiMessageTimestamp }
      });
      console.log(`[MsgProcessor ${jobId}] Timestamp da conversa atualizado.`);

      // <<< INÍCIO ENVIO CONDICIONAL >>>
      let sendSuccess = false;
      // <<< LOG EXISTENTE (GARANTIR CLAREZA) >>>
      console.log(`[MsgProcessor ${jobId}] VERIFICANDO CANAL PARA ENVIO. Canal a ser usado na decisão: ${channel}`);

      if (channel === 'LUMIBOT') { // Ajuste o valor exato se necessário
            const { lumibot_account_id, lumibot_api_token } = workspace;
            const channelConversationId = conversationData.channel_conversation_id;

            if (lumibot_account_id && lumibot_api_token && channelConversationId) {
                console.log(`[MsgProcessor ${jobId}] Tentando enviar resposta via Lumibot para channel_conv_id ${channelConversationId}...`);
                const sendResult = await enviarTextoLivreLumibot(
                    lumibot_account_id,
                    channelConversationId,
                    lumibot_api_token,
                    aiResponseContent
                );
                if (sendResult.success) {
                    sendSuccess = true;
                    console.log(`[MsgProcessor ${jobId}] Resposta enviada com sucesso para Lumibot.`);
                } else {
                    console.error(`[MsgProcessor ${jobId}] Falha ao enviar resposta para Lumibot:`, JSON.stringify(sendResult.responseData));
                }
            } else {
                console.error(`[MsgProcessor ${jobId}] Dados ausentes para envio via Lumibot (AccountID: ${!!lumibot_account_id}, Token: ${!!lumibot_api_token}, ChannelConvID: ${!!channelConversationId}).`);
            }

      } else if (channel === 'WHATSAPP') {
            console.log(`[MsgProcessor ${jobId}] Bloco de envio WhatsApp alcançado. Verificando credenciais...`); // Log de depuração
            const { whatsappAccessToken, whatsappPhoneNumberId } = workspace;

            // Verifica se as credenciais e telefone do cliente existem
            if (whatsappAccessToken && whatsappPhoneNumberId && clientPhoneNumber) {
                let decryptedAccessToken: string | null = null;
                try {
                    // Descriptografar o Access Token ANTES de usar
                    console.log(`[MsgProcessor ${jobId}] Tentando descriptografar Access Token...`);
                    decryptedAccessToken = decrypt(whatsappAccessToken);
                    if (!decryptedAccessToken) throw new Error("Token de acesso descriptografado está vazio.");
                    console.log(`[MsgProcessor ${jobId}] Access Token descriptografado com sucesso.`);

                    console.log(`[MsgProcessor ${jobId}] Tentando enviar resposta via WhatsApp para ${clientPhoneNumber} usando número ${whatsappPhoneNumberId}...`);

                    // Chamar a função de envio do WhatsApp
                    const sendResult = await sendWhatsappMessage(
                        whatsappPhoneNumberId, // ID do número que está enviando
                        clientPhoneNumber,     // Telefone do destinatário
                        decryptedAccessToken,  // Token descriptografado
                        aiResponseContent      // Conteúdo da mensagem
                    );

                    if (sendResult.success) {
                        sendSuccess = true;
                        console.log(`[MsgProcessor ${jobId}] Resposta enviada com sucesso para WhatsApp. Message ID: ${sendResult.messageId}`);
                    } else {
                        console.error(`[MsgProcessor ${jobId}] Falha ao enviar resposta para WhatsApp:`, JSON.stringify(sendResult.error || 'Erro desconhecido'));
                    }

                } catch (decryptOrSendError: any) {
                     console.error(`[MsgProcessor ${jobId}] Erro ao descriptografar token ou enviar via WhatsApp:`, decryptOrSendError.message);
                }
            } else {
                 console.error(`[MsgProcessor ${jobId}] Dados ausentes para envio via WhatsApp (AccessToken: ${!!whatsappAccessToken}, PhoneID: ${!!whatsappPhoneNumberId}, ClientPhone: ${!!clientPhoneNumber}).`);
            }

      } else {
          console.warn(`[MsgProcessor ${jobId}] Canal desconhecido ou não suportado para envio: ${channel}. Nenhuma mensagem enviada.`);
      }
      // <<< FIM ENVIO CONDICIONAL >>>

      // TODO: Lógica de agendamento de follow-up (pode depender de sendSuccess)
      // Exemplo: if (sendSuccess && workspace.ai_follow_up_rules?.length > 0) { /* ... agendar ... */ }

    } else {
      console.log(`[MsgProcessor ${jobId}] IA não retornou conteúdo. Nenhuma mensagem salva ou enviada.`);
    }

    console.log(`--- [MsgProcessor ${jobId}] FIM (Processou Lote) ---`);
    return { status: 'completed', handledBatch: true };

  } catch (error) {
    console.error(`[MsgProcessor ${jobId}] Erro CRÍTICO no processamento para Conv ${conversationId}:`, error);
     if (error instanceof Error) {
        console.error(error.stack);
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
      // console.error(err); // Log completo do erro (pode ser verboso)
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