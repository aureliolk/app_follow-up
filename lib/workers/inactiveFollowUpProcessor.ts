// lib/workers/inactiveFollowUpProcessor.ts
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../redis.js'; // Usando caminho relativo
import { prisma } from '../db.js';             // Usando caminho relativo
import { enviarTextoLivreLumibot } from '../channel/lumibotSender.js'; // Usando caminho relativo
import { Conversation, WorkspaceAiFollowUpRule, Workspace, MessageSenderType, ConversationStatus } from '@prisma/client'; // Importar tipos

const INACTIVE_QUEUE_NAME = 'inactive-follow-up';

interface InactiveJobData {
  conversationId: string;
  ruleId: string;
  aiMessageTimestamp: string; // Vem como string ISO do job anterior
  workspaceId: string;
}

async function processInactiveJob(job: Job<InactiveJobData>) {
  const { conversationId, ruleId, aiMessageTimestamp, workspaceId } = job.data;
  const jobId = job.id || 'unknown'; // Usamos o ID fixo 'inactive_...' para pegar o job

  console.log(`\n--- [InactiveWorker ${jobId}] INÍCIO ---`);
  console.log(`[InactiveWorker ${jobId}] Verificando inatividade para Conv: ${conversationId}, Regra: ${ruleId}, Timestamp Base IA: ${aiMessageTimestamp}`);

  try {
    // 1. Buscar a conversa ATUALIZADA do banco de dados
    console.log(`[InactiveWorker ${jobId}] Buscando dados da conversa ${conversationId}...`);
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        status: true, // Precisamos do status atual
        last_message_at: true, // Timestamp da ÚLTIMA mensagem (qualquer tipo)
        channel_conversation_id: true, // ID para enviar via Lumibot
        workspace_id: true, // Confirmar workspace
        client: { // Para pegar o nome do cliente para placeholders
            select: { name: true }
        }
      },
    });

    if (!conversation) {
      console.warn(`[InactiveWorker ${jobId}] Conversa ${conversationId} não encontrada no DB. Ignorando job.`);
      // Não é um erro fatal, a conversa pode ter sido deletada.
      return { status: 'skipped', reason: 'Conversa não encontrada' };
    }
     console.log(`[InactiveWorker ${jobId}] Conversa encontrada: Status=${conversation.status}, LastMsgAt=${conversation.last_message_at?.toISOString()}`);

    // 2. Verificar se a conversa ainda está ATIVA
    if (conversation.status !== ConversationStatus.ACTIVE) { // Usar o Enum importado
      console.log(`[InactiveWorker ${jobId}] Conversa ${conversationId} não está mais ativa (Status: ${conversation.status}). Follow-up de inatividade cancelado.`);
      return { status: 'skipped', reason: `Conversa não ativa (${conversation.status})` };
    }
    console.log(`[InactiveWorker ${jobId}] Conversa está ATIVA.`);

    // 3. Verificar se o cliente respondeu DEPOIS da mensagem da IA que agendou este job
    const aiTimestamp = new Date(aiMessageTimestamp); // Converter string ISO para Date
    // Se last_message_at existe E é mais recente que o timestamp da mensagem da IA
    const clientResponded = !!conversation.last_message_at && conversation.last_message_at > aiTimestamp;

    console.log(`[InactiveWorker ${jobId}] Verificando resposta do cliente: Cliente respondeu após ${aiTimestamp.toISOString()}? ${clientResponded}`);

    if (clientResponded) {
      console.log(`[InactiveWorker ${jobId}] Cliente respondeu (LastMsg: ${conversation.last_message_at?.toISOString()}). Follow-up de inatividade cancelado.`);
      // O job de cancelamento no webhook pode ter falhado, mas a verificação aqui garante que não enviamos.
      return { status: 'skipped', reason: 'Cliente respondeu' };
    }
    console.log(`[InactiveWorker ${jobId}] Cliente NÃO respondeu. Prosseguindo para enviar follow-up.`);

    // 4. Buscar detalhes da regra e credenciais do workspace
    console.log(`[InactiveWorker ${jobId}] Buscando Regra ${ruleId} e credenciais do Workspace ${workspaceId}...`);

    // Buscar a regra específica
    const rule = await prisma.workspaceAiFollowUpRule.findUnique({
        where: { id: ruleId },
        select: { message_content: true } // Só precisamos da mensagem
    });

    // Buscar as credenciais do workspace
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }, // Usar o ID que veio no job data
        select: { lumibot_account_id: true, lumibot_api_token: true }
    });

    if (!rule) {
        // Se a regra foi deletada enquanto o job estava na fila
        console.warn(`[InactiveWorker ${jobId}] Regra ${ruleId} não encontrada. Não é possível enviar follow-up.`);
        return { status: 'skipped', reason: `Regra ${ruleId} não encontrada` };
        // throw new Error(`Regra ${ruleId} não encontrada.`); // Ou falhar o job
    }
    if (!workspace) {
         // Improvável se a conversa existe, mas por segurança
         console.error(`[InactiveWorker ${jobId}] Workspace ${workspaceId} não encontrado. Impossível enviar.`);
         throw new Error(`Workspace ${workspaceId} não encontrado.`);
    }
    if (!workspace.lumibot_account_id || !workspace.lumibot_api_token) {
         console.warn(`[InactiveWorker ${jobId}] Credenciais Lumibot ausentes para workspace ${workspaceId}. Não é possível enviar.`);
         return { status: 'skipped', reason: 'Credenciais Lumibot ausentes' };
    }
    if (!conversation.channel_conversation_id) {
         console.warn(`[InactiveWorker ${jobId}] channel_conversation_id ausente para conversa ${conversationId}. Não é possível enviar.`);
         return { status: 'skipped', reason: 'channel_conversation_id ausente' };
    }
    console.log(`[InactiveWorker ${jobId}] Regra e credenciais OK.`);

    // --- Substituição de Placeholders (Exemplo) ---
    let messageToSend = rule.message_content;
    if (conversation.client?.name) {
        messageToSend = messageToSend.replace(/\[NomeCliente\]/gi, conversation.client.name);
        console.log(`[InactiveWorker ${jobId}] Placeholder [NomeCliente] substituído.`);
    }
    // Adicionar mais placeholders se necessário (ex: [NomeProduto], [NomeAgente])
    // ---------------------------------------------

    console.log(`[InactiveWorker ${jobId}] Mensagem final a ser enviada: "${messageToSend.substring(0, 70)}..."`);

    // 5. Enviar a mensagem de acompanhamento via Lumibot
    console.log(`[InactiveWorker ${jobId}] Chamando enviarTextoLivreLumibot...`);
    const sendResult = await enviarTextoLivreLumibot(
      workspace.lumibot_account_id,
      conversation.channel_conversation_id,
      workspace.lumibot_api_token,
      messageToSend // Usa a mensagem com placeholders substituídos
    );
    console.log(`[InactiveWorker ${jobId}] Resultado do envio Lumibot:`, sendResult);

    if (!sendResult.success) {
      // Lança erro para BullMQ tentar novamente se configurado
      throw new Error(`Falha ao enviar follow-up de inatividade para Lumibot: ${JSON.stringify(sendResult.responseData)}`);
    }

    console.log(`[InactiveWorker ${jobId}] Follow-up de inatividade enviado com sucesso para Lumibot.`);

    // 6. Opcional: Salvar um registro dessa mensagem de sistema/follow-up no histórico
    try {
        await prisma.message.create({
            data: {
                conversation_id: conversationId,
                sender_type: MessageSenderType.SYSTEM, // Marcar como sistema ou AI
                content: `[Follow-up Inatividade Agendado] ${messageToSend}`, // Conteúdo para registro interno
                timestamp: new Date(),
                metadata: { ruleId: ruleId, type: 'inactive_followup' }
            }
        });
        console.log(`[InactiveWorker ${jobId}] Mensagem de log do follow-up salva no histórico.`);
    } catch(logError) {
        console.warn(`[InactiveWorker ${jobId}] Falha ao salvar log da mensagem de follow-up:`, logError);
        // Não falhar o job principal por causa disso
    }

     // 7. Agendar o PRÓXIMO follow-up de inatividade, se houver mais regras?
     //    (Lógica mais complexa, vamos deixar fora por enquanto)
     //    - Buscaria a PRÓXIMA regra (order > regraAtual.order OU delay > regraAtual.delay)
     //    - Agendaria um novo job com o delay da próxima regra.

    console.log(`--- [InactiveWorker ${jobId}] FIM (Sucesso) ---`);
    return { status: 'completed' };

  } catch (error) {
    console.error(`[InactiveWorker ${jobId}] Erro CRÍTICO ao processar job de inatividade para conversa ${conversationId}:`, error);
    console.log(`--- [InactiveWorker ${jobId}] FIM (Erro Crítico) ---`);
    throw error; // Re-lança para BullMQ tratar como falha
  }
}

// --- Inicialização do Worker ---
const inactiveWorker = new Worker<InactiveJobData>(INACTIVE_QUEUE_NAME, processInactiveJob, {
  connection: redisConnection,
  concurrency: 10, // Ajuste conforme necessário
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
});

inactiveWorker.on('error', (err) => {
  console.error('[InactiveWorker] Erro geral:', err);
});

inactiveWorker.on('stalled', (jobId: string) => {
    console.warn(`[InactiveWorker] Job ${jobId} estagnou (stalled).`);
});


console.log(`[InactiveWorker] Inactive follow-up worker iniciado e escutando a fila "${INACTIVE_QUEUE_NAME}"...`);