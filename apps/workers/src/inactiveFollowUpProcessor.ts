// lib/workers/inactiveFollowUpProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '@/packages/shared-lib/src/redis'; // <---  no final
import { prisma } from '@/packages/shared-lib/src/db';             // <---  no final
import { enviarTextoLivreLumibot } from '@/packages/shared-lib/src/channel/lumibotSender'; // <--- .js no final
// Importar Enums e Tipos do Prisma Client
import { ConversationStatus, MessageSenderType } from '@prisma/client';

const INACTIVE_QUEUE_NAME = 'inactive-follow-up';

interface InactiveJobData {
  conversationId: string;
  // Removido ruleId, pois vamos buscar a regra com menor delay dinamicamente
  // ruleId: string;
  aiMessageTimestamp: string; // Timestamp ISO da mensagem da IA que agendou este job
  workspaceId: string;
}

async function processInactiveJob(job: Job<InactiveJobData>) {
  // Garantir que temos um ID, mesmo que seja o nome/ID fixo usado no agendamento
  const jobId = job.id || job.name || 'unknown-inactive-job';
  const { conversationId, aiMessageTimestamp, workspaceId } = job.data;

  console.log(`\n--- [InactiveWorker ${jobId}] INÍCIO ---`);
  console.log(`[InactiveWorker ${jobId}] Verificando inatividade para Conv: ${conversationId}, Timestamp Base IA: ${aiMessageTimestamp}, Workspace: ${workspaceId}`);

  try {
    // 1. Buscar a conversa ATUALIZADA do banco de dados
    console.log(`[InactiveWorker ${jobId}] Buscando dados da conversa ${conversationId}...`);
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        status: true,
        last_message_at: true,
        channel_conversation_id: true,
        workspace_id: true,
        client: { select: { name: true } },
        // Incluir as regras associadas ao workspace da conversa para pegar a correta
        workspace: {
            select: {
                lumibot_account_id: true,
                lumibot_api_token: true,
                ai_follow_up_rules: {
                    orderBy: { delay_milliseconds: 'asc' }, // Ordena para pegar a de menor delay
                    select: { id: true, message_content: true, delay_milliseconds: true } // Seleciona dados da regra
                }
            }
        }
      },
    });

    if (!conversation) {
      console.warn(`[InactiveWorker ${jobId}] Conversa ${conversationId} não encontrada no DB. Ignorando job.`);
      return { status: 'skipped', reason: 'Conversa não encontrada' };
    }
    console.log(`[InactiveWorker ${jobId}] Conversa encontrada: Status=${conversation.status}, LastMsgAt=${conversation.last_message_at?.toISOString()}`);

    // 2. Verificar se a conversa ainda está ATIVA
    if (conversation.status !== ConversationStatus.ACTIVE) { // Usar Enum importado
      console.log(`[InactiveWorker ${jobId}] Conversa ${conversationId} não está mais ativa (Status: ${conversation.status}). Follow-up de inatividade cancelado.`);
      return { status: 'skipped', reason: `Conversa não ativa (${conversation.status})` };
    }
    console.log(`[InactiveWorker ${jobId}] Conversa está ATIVA.`);

    // --- 3. Verificar se o cliente respondeu DEPOIS da mensagem da IA ---
    const aiTimestamp = new Date(aiMessageTimestamp); // Converter string ISO para Date

    // <<< LOG DETALHADO DA COMPARAÇÃO DE DATAS >>>
    console.log(`[InactiveWorker ${jobId}] Comparando Timestamps:`);
    console.log(`  -> AI Msg Timestamp (Date): ${aiTimestamp.toISOString()}, Tipo: ${typeof aiTimestamp}`);
    console.log(`  -> Conv Last Msg At (Date): ${conversation.last_message_at?.toISOString() || 'N/A'}, Tipo: ${typeof conversation.last_message_at}`);
    // <<< FIM DO LOG DETALHADO >>>

    const clientResponded = !!conversation.last_message_at && conversation.last_message_at > aiTimestamp;

    console.log(`[InactiveWorker ${jobId}] Verificando resposta do cliente: Cliente respondeu após ${aiTimestamp.toISOString()}? ${clientResponded}`);

    if (clientResponded) {
      console.log(`[InactiveWorker ${jobId}] Cliente respondeu (LastMsg: ${conversation.last_message_at?.toISOString()}). Follow-up de inatividade cancelado.`);
      return { status: 'skipped', reason: 'Cliente respondeu' };
    }
    console.log(`[InactiveWorker ${jobId}] Cliente NÃO respondeu. Prosseguindo para enviar follow-up.`);

    // 4. Obter a regra e as credenciais (já buscadas na query da conversa)
    const workspaceData = conversation.workspace;
    if (!workspaceData) {
        // Improvável, mas checa por segurança
         console.error(`[InactiveWorker ${jobId}] Dados do Workspace para a conversa ${conversationId} não encontrados. Impossível enviar.`);
         throw new Error(`Workspace para a conversa ${conversationId} não encontrado.`);
    }

    // Pega a regra com o menor delay (já ordenada na query)
    const ruleToSend = workspaceData.ai_follow_up_rules?.[0];

    if (!ruleToSend) {
        console.warn(`[InactiveWorker ${jobId}] Nenhuma regra de AI Follow-Up encontrada para o workspace ${workspaceId}. Não é possível enviar follow-up.`);
        return { status: 'skipped', reason: `Nenhuma regra de AI Follow-Up encontrada` };
    }
    console.log(`[InactiveWorker ${jobId}] Usando regra ID: ${ruleToSend.id} (Delay: ${ruleToSend.delay_milliseconds}ms)`);

    const { lumibot_account_id, lumibot_api_token } = workspaceData;

    if (!lumibot_account_id || !lumibot_api_token) {
         console.warn(`[InactiveWorker ${jobId}] Credenciais Lumibot ausentes para workspace ${workspaceId}. Não é possível enviar.`);
         return { status: 'skipped', reason: 'Credenciais Lumibot ausentes' };
    }
    if (!conversation.channel_conversation_id) {
         console.warn(`[InactiveWorker ${jobId}] channel_conversation_id ausente para conversa ${conversationId}. Não é possível enviar.`);
         return { status: 'skipped', reason: 'channel_conversation_id ausente' };
    }
    console.log(`[InactiveWorker ${jobId}] Credenciais Lumibot e ID da conversa do canal OK.`);

    // --- 5. Substituição de Placeholders ---
    let messageToSend = ruleToSend.message_content;
    console.log(`[InactiveWorker ${jobId}] Mensagem original da regra: "${messageToSend}"`);
    if (conversation.client?.name) {
        messageToSend = messageToSend.replace(/\[NomeCliente\]/gi, conversation.client.name);
        console.log(`[InactiveWorker ${jobId}] Placeholder [NomeCliente] substituído.`);
    }
    // Adicionar mais placeholders se necessário
    console.log(`[InactiveWorker ${jobId}] Mensagem final a ser enviada: "${messageToSend}"`);
    // ---------------------------------------------

    // 6. Enviar a mensagem de acompanhamento via Lumibot
    console.log(`[InactiveWorker ${jobId}] Chamando enviarTextoLivreLumibot...`);
    const sendResult = await enviarTextoLivreLumibot(
      lumibot_account_id,
      conversation.channel_conversation_id,
      lumibot_api_token,
      messageToSend
    );
    console.log(`[InactiveWorker ${jobId}] Resultado do envio Lumibot:`, JSON.stringify(sendResult)); // Log completo do resultado

    if (!sendResult.success) {
      // Lança erro para BullMQ tentar novamente se configurado
      console.error(`[InactiveWorker ${jobId}] Falha detalhada ao enviar follow-up:`, sendResult.responseData);
      throw new Error(`Falha ao enviar follow-up de inatividade para Lumibot: ${JSON.stringify(sendResult.responseData)}`);
    }

    console.log(`[InactiveWorker ${jobId}] Follow-up de inatividade enviado com sucesso para Lumibot.`);

    // 7. Opcional: Salvar um registro dessa mensagem no histórico
    try {
        const logTimestamp = new Date();
        await prisma.message.create({
            data: {
                conversation_id: conversationId,
                sender_type: MessageSenderType.SYSTEM, // Ou AI, dependendo da sua definição
                content: `[Follow-up Inatividade Enviado | Regra: ${ruleToSend.id}] ${messageToSend}`, // Conteúdo para registro interno
                timestamp: logTimestamp,
                metadata: { ruleId: ruleToSend.id, type: 'inactive_followup_sent' }
            }
        });
        // ATUALIZA o last_message_at da conversa para refletir essa mensagem do sistema
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { last_message_at: logTimestamp }
        });
        console.log(`[InactiveWorker ${jobId}] Mensagem de log do follow-up salva e timestamp da conversa atualizado.`);
    } catch(logError) {
        console.warn(`[InactiveWorker ${jobId}] Falha ao salvar log ou atualizar timestamp pós-envio:`, logError);
        // Não falhar o job principal por causa disso
    }

    console.log(`--- [InactiveWorker ${jobId}] FIM (Sucesso) ---`);
    return { status: 'completed' };

  } catch (error) {
    console.error(`[InactiveWorker ${jobId}] Erro CRÍTICO ao processar job de inatividade para conversa ${conversationId}:`, error);
    // Loga o erro completo para diagnóstico
    if (error instanceof Error) {
        console.error(error.stack);
    }
    console.log(`--- [InactiveWorker ${jobId}] FIM (Erro Crítico) ---`);
    throw error; // Re-lança para BullMQ tratar como falha
  }
}

// --- Inicialização do Worker ---
console.log('[InactiveWorker] Tentando inicializar o worker...');
try {
    const inactiveWorker = new Worker<InactiveJobData>(INACTIVE_QUEUE_NAME, processInactiveJob, {
      connection: redisConnection,
      concurrency: 5, // Ajuste conforme necessário (5 é um bom começo)
      // Aumentar lock duration pode ajudar se o processamento for longo, mas cuidado com jobs presos
      // lockDuration: 60000 // 60 segundos (padrão é 30s)
    });

    // --- Listeners de Eventos ---
    inactiveWorker.on('completed', (job: Job<InactiveJobData>, result: any) => {
      console.log(`[InactiveWorker] Job ${job.id || 'N/A'} (Conv: ${job.data?.conversationId}) concluído. Status: ${result?.status || 'completed'}. Razão: ${result?.reason || 'N/A'}`);
    });

    inactiveWorker.on('failed', (job: Job<InactiveJobData> | undefined, err: Error) => {
      const jobId = job?.id || 'N/A';
      const convId = job?.data?.conversationId || 'N/A';
      const attempts = job?.attemptsMade || 0;
      console.error(`[InactiveWorker] Job ${jobId} (Conv: ${convId}) falhou após ${attempts} tentativas:`, err.message);
       // Log completo do erro para mais detalhes
       console.error(err);
    });

    inactiveWorker.on('error', (err) => {
      console.error('[InactiveWorker] Erro geral:', err);
    });

    inactiveWorker.on('stalled', (jobId: string) => {
        console.warn(`[InactiveWorker] Job ${jobId} estagnou (stalled). Verifique a conexão e o processamento.`);
    });

    console.log(`[InactiveWorker] Worker iniciado e escutando a fila "${INACTIVE_QUEUE_NAME}"...`);

} catch (initError) {
    console.error('[InactiveWorker] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1); // Sai se não conseguir inicializar
}