// apps/next-app/app/api/webhooks/ingress/lumibot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Conversation, FollowUp, FollowUpStatus as PrismaFollowUpStatus, ConversationStatus } from '@prisma/client'; // Removido Prisma daqui
// Remover imports diretos das filas
// import { messageProcessingQueue } from '../../../../../../../apps/workers/src/queues/messageProcessingQueue';
// import { sequenceStepQueue } from '../../../../../../../apps/workers/src/queues/sequenceStepQueue'; // Importar fila da sequência
// Importar funções do serviço de filas da shared-lib (do ponto de entrada principal)
import { addMessageProcessingJob, addSequenceStepJob } from '@/lib/queues/queueService';
import crypto from "crypto";
import { redisConnection } from '@/lib/redis';

// --- Função Auxiliar para Iniciar Follow-up (Evita Repetição) ---
async function startNewFollowUpSequence(clientId: string, workspaceId: string, conversationId: string) {
    console.log(`[Webhook Ingress] Attempting to start NEW automatic sequence for Client ${clientId} in Workspace ${workspaceId}`);
    try {
        // 1. Buscar a primeira regra
        const firstRule = await prisma.workspaceAiFollowUpRule.findFirst({
            where: { workspace_id: workspaceId },
            orderBy: { created_at: 'asc' },
            select: { id: true, delay_milliseconds: true }
        });

        if (!firstRule) {
            console.warn(`[Webhook Ingress] No sequence rules found for Workspace ${workspaceId}. Cannot start automatic sequence.`);
            return null; // Retorna null se não há regras
        }

        const delayMs = Number(firstRule.delay_milliseconds);
        const nextMessageTime = delayMs > 0 ? new Date(Date.now() + delayMs) : null; // Só agenda se delay > 0

        // 2. Criar o registro FollowUp
        const newFollowUp = await prisma.followUp.create({
            data: {
                client: { connect: { id: clientId } },
                workspace: { connect: { id: workspaceId } },
                status: PrismaFollowUpStatus.ACTIVE, // Usa Enum
                // Associa à conversa que disparou (opcional, mas útil para rastreio)
                // Se não tiver campo conversation_id em FollowUp, ignore esta linha
                // conversation: { connect: { id: conversationId } },
                next_sequence_message_at: nextMessageTime,
                current_sequence_step_order: 0, // Inicia em 0, será 1 após o primeiro envio
            },
            select: { id: true }
        });
        console.log(`[Webhook Ingress] New FollowUp record created: ID=${newFollowUp.id} for Conv ${conversationId}`);

        // 3. Agendar o primeiro job SE houver delay válido
        if (nextMessageTime) {
            const jobData = { followUpId: newFollowUp.id, stepRuleId: firstRule.id, workspaceId };
            const jobOptions = { delay: delayMs, jobId: `seq_${newFollowUp.id}_step_${firstRule.id}`, removeOnComplete: true, removeOnFail: 5000 };
            // Substituir chamada direta pela função da shared-lib
            // await sequenceStepQueue.add('processSequenceStep', jobData, jobOptions);
            await addSequenceStepJob(jobData, jobOptions);
            console.log(`[Webhook Ingress] First sequence job scheduled via QueueService for FollowUp ${newFollowUp.id}, Rule ${firstRule.id} with delay ${delayMs}ms`);
        } else {
             console.log(`[Webhook Ingress] First rule ${firstRule.id} has no valid delay. No job scheduled, sequence starts immediately if rules allow.`);
             // Poderia agendar com delay 0 se quisesse processamento imediato do primeiro passo
        }

        return newFollowUp; // Retorna o follow-up criado

    } catch (error) {
        console.error(`[Webhook Ingress] CRITICAL ERROR starting automatic sequence for Client ${clientId}:`, error);
        // Logar, mas não necessariamente falhar o processamento da mensagem
        return null; // Indica falha ao iniciar
    }
}
// --- Fim Função Auxiliar ---

export async function POST(req: NextRequest) {
  console.log('Webhook Lumibot/Chatwoot Recebido');

  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) { /* ... (tratamento de erro workspaceId) ... */ }

    const body = await req.json();
    console.log('Webhook Ingress: Corpo:', JSON.stringify(body, null, 2));

    const eventType = body.event;
    const messageType = body.message_type; // 'incoming', 'outgoing', etc.
    const firstMessage = body.conversation?.messages?.[0];
    const messageSenderType = firstMessage?.sender_type; // 'Contact', 'User', 'Agent'

    // IGNORAR eventos não relevantes (mensagens do BOT/AGENTE ou eventos diferentes de criação)
    // MANTEMOS A LÓGICA ORIGINAL DE SÓ PROCESSAR MENSAGENS DO CLIENTE
    if (eventType !== 'message_created' || messageType !== 'incoming' || messageSenderType !== 'Contact') {
      console.log(`[Webhook Ingress] Ignorando evento/tipo/remetente não relevante: Evt=${eventType}, Type=${messageType}, Sender=${messageSenderType}`);
      return NextResponse.json({ success: true, message: 'Evento não relevante ignorado' }, { status: 200 });
    }
    console.log(`[Webhook Ingress] Evento relevante recebido de Contato.`);

    // Extração de dados (mantida)
    const messageContent = firstMessage?.content;
    const messageTimestamp = firstMessage?.created_at ? new Date(firstMessage.created_at * 1000) : new Date();
    const channelMessageId = firstMessage?.source_id || firstMessage?.id?.toString();
    const clientExternalId = body.sender?.id?.toString() || firstMessage?.sender?.id?.toString();
    const clientName = body.sender?.name || firstMessage?.sender?.name;
    const clientPhone = body.sender?.phone_number || firstMessage?.sender?.phone_number;
    const clientMetadata = body.sender || firstMessage?.sender || null;
    const channel = body.conversation?.channel;
    const normalizedChannel = channel?.split('::')[1]?.toUpperCase() || 'UNKNOWN';
    const channelConversationId = body.conversation?.id?.toString();
    const conversationMetadata = body.conversation?.meta || null;
    const messageMetadata = { /* ... (mantido) ... */ };

    if (!clientPhone || !channelConversationId || !messageContent) { /* ... (validação mantida) ... */ }
    console.log(`[Webhook Ingress] Dados Extraídos: ClientPhone=${clientPhone}, ChannelConvID=${channelConversationId}, Channel=${normalizedChannel}`);

    // --- Lógica de Upsert Cliente (Mantida) ---
    const client = await prisma.client.upsert({
      where: {
        workspace_id_phone_number_channel: { // Usando o índice único
          workspace_id: workspaceId,
          phone_number: clientPhone,
          channel: normalizedChannel,
        }
      },
      update: { // O que atualizar se o cliente já existe
        name: clientName,
        external_id: clientExternalId,
        metadata: clientMetadata,
        updated_at: new Date(),
      },
      create: { // O que criar se for novo
        workspace_id: workspaceId,
        external_id: clientExternalId,
        phone_number: clientPhone,
        name: clientName,
        channel: normalizedChannel,
        metadata: clientMetadata,
      },
     });
    console.log(`[Webhook Ingress] Cliente ${client.id} Upserted.`);

    // --- NOVA LÓGICA REVISADA (IDEIA 1): CONVERSA E FOLLOW-UP ---
    let conversation: Conversation;
    let shouldStartNewFollowUp = false;

    // 1. Encontrar ou Criar a Conversa (sempre garante que temos uma)
    const existingConversation = await prisma.conversation.findFirst({
        where: {
            workspace_id: workspaceId,
            channel_conversation_id: channelConversationId,
            // Não filtra mais por status aqui, encontra qualquer uma existente
        }
    });

    if (existingConversation) {
        // Conversa já existe, atualiza-a (e garante que está ativa)
        console.log(`[Webhook Ingress] Conversa ${existingConversation.id} encontrada.`);
        conversation = await prisma.conversation.update({
            where: { id: existingConversation.id },
            data: {
                last_message_at: messageTimestamp,
                updated_at: new Date(),
                status: ConversationStatus.ACTIVE, // Garante que a conversa está ativa ao receber msg
            }
        });
        console.log(`[Webhook Ingress] Conversa ${conversation.id} atualizada e marcada como ATIVA.`);
    } else {
        // Conversa não existe, cria uma nova
        console.log(`[Webhook Ingress] Nenhuma conversa encontrada para ChannelConvID ${channelConversationId}. Criando NOVA conversa...`);
        conversation = await prisma.conversation.create({
            data: {
                workspace_id: workspaceId,
                client_id: client.id,
                channel: normalizedChannel,
                channel_conversation_id: channelConversationId,
                status: ConversationStatus.ACTIVE, // Sempre começa ativa
                is_ai_active: true, // Começa com IA ativa por padrão
                last_message_at: messageTimestamp,
                metadata: conversationMetadata,
            }
        });
        console.log(`[Webhook Ingress] Nova conversa ${conversation.id} criada.`);
    }

    // 2. Verificar Follow-ups Anteriores do CLIENTE para decidir se inicia sequência
    // A decisão agora é INDEPENDENTE da existência ou status da conversa encontrada/criada acima.
    const lastFollowUpForClient = await prisma.followUp.findFirst({
        where: {
            client_id: client.id,
            workspace_id: workspaceId
        },
        orderBy: { started_at: 'desc' } // Pega o mais recente
    });

    if (!lastFollowUpForClient) {
        // Não há follow-up anterior -> Primeira vez!
        console.log(`[Webhook Ingress] Nenhum FollowUp anterior encontrado para Cliente ${client.id}. Iniciando PRIMEIRO ciclo.`);
        shouldStartNewFollowUp = true;
    } else if (lastFollowUpForClient.status !== PrismaFollowUpStatus.ACTIVE && lastFollowUpForClient.status !== PrismaFollowUpStatus.PAUSED) {
        // Existe um follow-up anterior que NÃO está ativo/pausado (COMPLETED, CANCELLED, FAILED, CONVERTED) -> Reativação!
        console.log(`[Webhook Ingress] FollowUp anterior (${lastFollowUpForClient.id}, Status: ${lastFollowUpForClient.status}) encontrado para Cliente ${client.id}. Iniciando NOVO ciclo.`);
        shouldStartNewFollowUp = true; // Sinaliza para iniciar novo follow-up
    } else {
        // Existe um follow-up ATIVO ou PAUSADO. Não inicia novo ciclo.
        console.log(`[Webhook Ingress] FollowUp anterior (${lastFollowUpForClient.id}, Status: ${lastFollowUpForClient.status}) encontrado e está ATIVO ou PAUSADO. Nenhum novo ciclo de follow-up será iniciado.`);
        shouldStartNewFollowUp = false;
    }
    // --- FIM LÓGICA REVISADA CONVERSA/FOLLOW-UP ---

    // --- Salvar Mensagem Recebida (Mantido) ---
    const newMessage = await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        sender_type: 'CLIENT',
        content: messageContent,
        timestamp: messageTimestamp,
        channel_message_id: channelMessageId,
        metadata: messageMetadata,
      },
      // Incluir o tipo de remetente nos dados retornados (opcional, mas útil)
      // select: { id: true, sender_type: true, content: true, timestamp: true } // Exemplo
    });
    console.log(`[Webhook Ingress] Mensagem ${newMessage.id} salva para Conv ${conversation.id}.`);

    // <<< ADICIONAR PUBLICAÇÃO NO REDIS AQUI >>>
    try {
      const channel = `chat-updates:${conversation.id}`;
      const payload = JSON.stringify(newMessage); // Envia o objeto da mensagem como string JSON
      await redisConnection.publish(channel, payload);
      console.log(`[Webhook Ingress] Mensagem ${newMessage.id} publicada no canal Redis: ${channel}`);
    } catch (publishError) {
      console.error(`[Webhook Ingress] Falha ao publicar mensagem ${newMessage.id} no Redis:`, publishError);
      // Não lançar erro aqui para não parar o fluxo principal
    }

    // --- Disparar Follow-up Automático SE NECESSÁRIO ---
    if (shouldStartNewFollowUp) {
        await startNewFollowUpSequence(client.id, workspaceId, conversation.id);
    }

    // --- Adicionar Job à Fila de Processamento de Mensagem (Usando shared-lib) ---
    try {
      const jobData = { conversationId: conversation.id, clientId: client.id, newMessageId: newMessage.id, workspaceId, receivedTimestamp: Date.now() };
      // Substituir chamada direta pela função da shared-lib
      // await messageProcessingQueue.add('processIncomingMessage', jobData);
      await addMessageProcessingJob(jobData);
      console.log(`[Webhook Ingress] Job adicionado à fila messageProcessingQueue via QueueService para msg ${newMessage.id}`);
    } catch (queueError) {
      console.error(`[Webhook Ingress] Falha ao adicionar job à fila messageProcessingQueue via QueueService:`, queueError);
    }

    return NextResponse.json({ success: true, message: 'Mensagem recebida e processada' }, { status: 200 });

  } catch (error) {
    console.error('[Webhook Ingress] Erro inesperado no processamento:', error);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor ao processar webhook' }, { status: 500 });
  }
}