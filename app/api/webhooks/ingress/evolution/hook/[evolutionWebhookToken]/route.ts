import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { addMessageProcessingJob } from '@/lib/queues/queueService';
import { Prisma, FollowUpStatus } from '@prisma/client';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue';
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils';
import { getOrCreateConversation } from '@/lib/services/conversationService';
import { saveMessageRecord } from '@/lib/services/persistenceService';
import { publishConversationUpdate, publishWorkspaceUpdate } from '@/lib/services/notifierService';
import pusher from '@/lib/pusher';
import { createDeal, getPipelineStages } from '@/lib/actions/pipelineActions';

// Interface para os parâmetros da rota
interface RouteParams {
    params: {
        evolutionWebhookToken: string;
    }
}

// Interface para o payload esperado da Evolution API (simplificada)
// Com base no log:
// "event": "messages.upsert",
// "instance": "33c6cb57-24f7-4586-9122-f91aac8a098c", (este é o workspaceId)
// "data": {
//   "key": { "remoteJid": "557391121575@s.whatsapp.net", "fromMe": false, "id": "MESSAGE_ID_FROM_EVOLUTION"},
//   "pushName": "Sender Name",
//   "message": { "conversation": "Oiii" }, (pode ter outros tipos como imageMessage, etc)
//   "messageTimestamp": 1747093353 (Unix timestamp em segundos)
// },
// "sender": "557399302760@s.whatsapp.net" (JID completo do remetente)

interface EvolutionMessageData {
    key: {
        remoteJid: string;
        fromMe: boolean;
        id: string;
        participant?: string;
    };
    pushName?: string;
    message?: { // O conteúdo da mensagem varia
        conversation?: string; // Para mensagens de texto
        imageMessage?: {
            caption?: string;
            url?: string;
            directPath?: string;
            mimetype?: string;
            fileLength?: string; // Adicionado com base nos logs
        };
        audioMessage?: {
            url?: string;
            directPath?: string;
            mimetype?: string;
            seconds?: number;
            ptt?: boolean;
            fileLength?: string; // Adicionado com base nos logs
        };
        videoMessage?: {
            caption?: string;
            url?: string;
            directPath?: string;
            mimetype?: string;
            seconds?: number;
            fileLength?: string; // Adicionado com base nos logs
        };
        documentMessage?: {
            caption?: string;
            fileName?: string;
            url?: string;
            directPath?: string;
            mimetype?: string;
            fileLength?: string;
        };
        stickerMessage?: {
            url?: string;
            directPath?: string;
            mimetype?: string;
            fileLength?: string;
        };
        // Adicionar outros tipos se necessário
    };
    messageTimestamp: string | number; // Vem como string ou número
    messageType?: string; // Adicionado com base nos logs, ex: "imageMessage", "audioMessage"
    // Adicionar outros campos de 'data' se necessário
}

interface EvolutionWebhookPayload {
    event: string;
    instance: string; // Workspace ID
    data: EvolutionMessageData;
    sender: string; // JID completo do remetente (ex: 55XXYYYYY@s.whatsapp.net)
    // Adicionar outros campos do payload se necessário
}


export async function POST(request: NextRequest, { params }: RouteParams) {
    const { evolutionWebhookToken } = await params;
    console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida requisição POST.`);

    // 1. Buscar Workspace pelo Token do Webhook da Evolution
    // O campo no DB é 'evolution_webhook_route_token'
    const workspace = await prisma.workspace.findUnique({
        where: { evolution_webhook_route_token: evolutionWebhookToken },
        select: { id: true, evolution_api_token: true /* Este é o token da *instância* Evolution, pode ser útil para API calls futuras */ }
    });

    if (!workspace) {
        console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Workspace não encontrado para este token. Rejeitando.`);
        return new NextResponse('Workspace not found or invalid token', { status: 404 });
    }
  
    // 3. Processar Payload
    try {
        const payload: EvolutionWebhookPayload = await request.json();
        console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Payload Recebido:`, JSON.stringify(payload, null, 2));

        // Verificar se é um evento de mensagem nova e se não é de nós mesmos (fromMe: false)
        if (payload.event === 'messages.upsert' && payload.data?.key && !payload.data.key.fromMe) {
            const messageData = payload.data;
            const workspaceId = workspace.id; // ID do nosso workspace

            // Extrair dados da mensagem
            let senderJidWithSuffix: string | undefined;
            if (messageData.key.remoteJid?.endsWith('@g.us')) {
                // Mensagem de Grupo: o remetente é o 'participant'
                senderJidWithSuffix = messageData.key.participant;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Mensagem de grupo detectada. Usando participant: ${senderJidWithSuffix}`);
            } else {
                // Mensagem Direta: o remetente é o 'remoteJid' dentro de 'data.key'
                senderJidWithSuffix = messageData.key.remoteJid; // CORRIGIDO: Usar o JID do cliente de data.key.remoteJid
                 console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Mensagem direta detectada. Usando messageData.key.remoteJid: ${senderJidWithSuffix}`);
            }

            if (!senderJidWithSuffix) {
                console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Não foi possível determinar o JID do remetente. Pulando mensagem ${messageData.key.id}.`);
                return new NextResponse('EVENT_RECEIVED_MISSING_SENDER_JID', { status: 200 });
            }
            
            const senderName = messageData.pushName || null; // Nome do contato
            const messageIdFromEvolution = messageData.key.id; // ID da mensagem na Evolution
            
            let messageContentOutput: string | null = null;
            let messageTypeOutput: string = 'unknown'; // Tipo da mensagem (text, image, etc.)
            let mediaUrlOutput: string | null = null;
            let mediaTypeOutput: string | null = null;
            let mediaDurationOutput: number | undefined = undefined;
            let isPttOutput: boolean | undefined = undefined;
            let requiresProcessing = false;
            let mediaData_base64: string | null = null; // <<< Adicionar variável para o base64

            const typeOfMessage = payload.data.messageType; // Usar o messageType do payload.data
            // <<< Tentar extrair o base64 do nível messageData.message, se existir >>>
            if (messageData.message && typeof (messageData.message as any).base64 === 'string') {
                mediaData_base64 = (messageData.message as any).base64;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Campo base64 encontrado em messageData.message.`);
            }

            if (typeOfMessage === 'conversation' || typeOfMessage === 'extendedTextMessage') { // Evolution usa 'conversation' para texto simples
                messageContentOutput = messageData.message?.conversation || (messageData.message as any)?.extendedTextMessage?.text || "";
                messageTypeOutput = 'text';
                requiresProcessing = true;
            } else if (typeOfMessage === 'imageMessage' && messageData.message?.imageMessage) {
                const imgMsg = messageData.message.imageMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida imageMessage.`);
                messageContentOutput = imgMsg.caption || "[Imagem Recebida]";
                messageTypeOutput = 'image';
                mediaUrlOutput = imgMsg.url || imgMsg.directPath || null;
                mediaTypeOutput = imgMsg.mimetype || null;
                // Não há campo base64 na interface imageMessage, remover a tentativa de extração daqui
                requiresProcessing = true;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Image Details: Content='${messageContentOutput}', MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', HasBase64='${!!mediaData_base64}'`);
            } else if (typeOfMessage === 'audioMessage' && messageData.message?.audioMessage) {
                const audioMsg = messageData.message.audioMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida audioMessage.`);
                messageContentOutput = "[Áudio Recebido]";
                messageTypeOutput = 'audio';
                mediaUrlOutput = audioMsg.url || audioMsg.directPath || null;
                mediaTypeOutput = audioMsg.mimetype || null;
                // Não há campo base64 na interface audioMessage, remover a tentativa de extração daqui
                mediaDurationOutput = audioMsg.seconds;
                isPttOutput = audioMsg.ptt;
                requiresProcessing = true; // Áudios podem precisar de processamento (ex: transcrição)
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Audio Details: MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', DurationS='${mediaDurationOutput}', PTT='${isPttOutput}', HasBase64='${!!mediaData_base64}'`);
            } else if (typeOfMessage === 'videoMessage' && messageData.message?.videoMessage) {
                const videoMsg = messageData.message.videoMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida videoMessage.`);
                messageContentOutput = videoMsg.caption || "[Vídeo Recebido]";
                messageTypeOutput = 'video';
                mediaUrlOutput = videoMsg.url || videoMsg.directPath || null;
                mediaTypeOutput = videoMsg.mimetype || null;
                // Não há campo base64 na interface videoMessage, remover a tentativa de extração daqui
                mediaDurationOutput = videoMsg.seconds;
                requiresProcessing = true; 
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Video Details: Content='${messageContentOutput}', MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', DurationS='${mediaDurationOutput}', HasBase64='${!!mediaData_base64}'`);
            } else if (typeOfMessage === 'documentMessage' && messageData.message?.documentMessage) {
                const docMsg = messageData.message.documentMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida documentMessage.`);
                messageContentOutput = docMsg.caption || docMsg.fileName || "[Documento Recebido]";
                messageTypeOutput = 'document';
                mediaUrlOutput = docMsg.url || docMsg.directPath || null;
                mediaTypeOutput = docMsg.mimetype || null;
                // Não há campo base64 na interface documentMessage, remover a tentativa de extração daqui
                requiresProcessing = true; 
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Document Details: Content='${messageContentOutput}', MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', HasBase64='${!!mediaData_base64}'`);
            } else if (typeOfMessage === 'stickerMessage' && messageData.message?.stickerMessage) {
                const stickerMsg = messageData.message.stickerMessage;
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida stickerMessage.`);
                messageContentOutput = "[Sticker Recebido]";
                messageTypeOutput = 'sticker';
                mediaUrlOutput = stickerMsg.url || stickerMsg.directPath || null;
                mediaTypeOutput = stickerMsg.mimetype || null;
                // Não há campo base64 na interface stickerMessage, remover a tentativa de extração daqui
                requiresProcessing = false; // Stickers geralmente não precisam de processamento complexo
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Sticker Details: MediaID='${mediaUrlOutput}', MimeType='${mediaTypeOutput}', HasBase64='${!!mediaData_base64}'`);
            } else {
                // Outros tipos de mensagem não tratados ou payload inesperado
                console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Tipo de mensagem '${typeOfMessage}' não suportado ou conteúdo ausente no payload da Evolution:`, messageData.message);
                return new NextResponse('EVENT_RECEIVED_UNSUPPORTED_MESSAGE_TYPE', { status: 200 });
            }
            
            // Timestamp da mensagem (converter para milissegundos se estiver em segundos)
            const receivedTimestamp = typeof messageData.messageTimestamp === 'string'
                ? parseInt(messageData.messageTimestamp, 10) * 1000
                : messageData.messageTimestamp * 1000;

            // Padronizar número do remetente (extrair apenas os dígitos do JID CORRETO)
            const senderPhoneNumberRaw = senderJidWithSuffix.split('@')[0]; // <<< Usa o JID correto
            const senderPhoneNumber = standardizeBrazilianPhoneNumber(senderPhoneNumberRaw);

            if (!senderPhoneNumber) {
                console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Número do remetente inválido ou não padronizável: ${senderPhoneNumberRaw}. Pulando mensagem ${messageIdFromEvolution}.`);
                return new NextResponse('EVENT_RECEIVED_INVALID_SENDER', { status: 200 });
            }
            console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Remetente padronizado de ${senderPhoneNumberRaw} para ${senderPhoneNumber}`);

            // Obter ou criar conversa e client
            const { conversation, client, clientWasCreated, conversationWasCreated } = await getOrCreateConversation(
                workspaceId,
                senderPhoneNumber,
                senderName,
                "WHATSAPP_EVOLUTION"
            );
            console.log(
                `[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Client ${client.id} ${clientWasCreated ? 'CRIADO' : 'existente'}. Conversation ${conversation.id} ${conversationWasCreated ? 'CRIADA' : 'existente'}. Channel: ${conversation.channel}`
            );

            // Criar Deal se novo cliente (lógica copiada do webhook WhatsApp)
            if (clientWasCreated) {
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Novo cliente ${client.id} criado. Tentando criar Deal no Kanban...`);
                try {
                    const stages = await getPipelineStages(workspaceId);
                    if (stages && stages.length > 0) {
                        const firstStage = stages[0];
                        const dealName = `Novo Lead - ${client.name || client.phone_number}`;
                        
                        await createDeal(workspaceId, {
                            name: dealName,
                            stageId: firstStage.id,
                            clientId: client.id,
                            value: null,
                        });
                        console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Deal "${dealName}" criado com sucesso para cliente ${client.id} no estágio "${firstStage.name}".`);
                    } else {
                        console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Nenhum estágio de pipeline encontrado para workspace ${workspaceId}. Deal não criado para novo cliente ${client.id}.`);
                    }
                } catch (dealError) {
                    console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Erro ao criar Deal para novo cliente ${client.id}:`, dealError);
                }
            }

            // Salvar registro da mensagem
            const savedMessage = await saveMessageRecord({
                conversation_id: conversation.id,
                sender_type: 'CLIENT',
                content: messageContentOutput!,
                timestamp: new Date(receivedTimestamp),
                metadata: { 
                    messageIdFromProvider: messageIdFromEvolution, 
                    provider: 'evolution',
                    ...(mediaUrlOutput && { mediaUrl: mediaUrlOutput }), 
                    ...(mediaTypeOutput && { mediaType: mediaTypeOutput }),
                    ...(mediaData_base64 && { mediaData_base64: mediaData_base64 }), // <<< ADICIONADO O CAMPO mediaData_base64
                    ...(mediaDurationOutput !== undefined && { mediaDuration: mediaDurationOutput }),
                    ...(isPttOutput !== undefined && { isPtt: isPttOutput }),
                    messageType: messageTypeOutput, 
                },
                channel_message_id: messageIdFromEvolution, 
                providerMessageId: messageIdFromEvolution 
            });
            console.log(
                `[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Mensagem ${savedMessage.id} salva para Conv ${conversation.id}.`
            );

            // Notificar front-end
            await publishConversationUpdate(
                `chat-updates:${conversation.id}`,
                { type: 'new_message', payload: { ...savedMessage, workspace_id: workspaceId } }
            );
            await publishWorkspaceUpdate(
                `workspace-updates:${workspaceId}`,
                { type: 'new_message', payload: savedMessage }
            );
            
            // Disparar evento Pusher
            try {
                const channelName = `private-workspace-${workspaceId}`;
                const eventPayloadPusher = { type: 'new_message', payload: savedMessage };
                await pusher.trigger(channelName, 'new_message', eventPayloadPusher);
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Pusher event 'new_message' triggered on channel ${channelName} for msg ${savedMessage.id}`);
            } catch (pusherError) {
                console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Failed to trigger Pusher event for msg ${savedMessage.id}:`, pusherError);
            }

            // Enfileirar Job para Processamento da Mensagem (IA, etc.)
            if (requiresProcessing) {
                try {
                    const jobData = {
                        conversationId: conversation.id,
                        clientId: client.id,
                        newMessageId: savedMessage.id,
                        workspaceId: workspaceId,
                        receivedTimestamp: receivedTimestamp,
                    };
                    await addMessageProcessingJob(jobData);
                    console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Job adicionado à fila message-processing para msg ${savedMessage.id}.`);
                } catch (queueError) {
                    console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Falha ao adicionar job à fila message-processing:`, queueError);
                }
            }

            // Lógica de Disparo do Follow-up
            const existingActiveFollowUp = await prisma.followUp.findFirst({
                where: {
                    client_id: client.id,
                    workspace_id: workspaceId,
                    status: FollowUpStatus.ACTIVE
                },
                select: { id: true }
            });

            if (!existingActiveFollowUp) {
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Nenhum follow-up ativo encontrado para cliente ${client.id}. Iniciando nova sequência...`);
                try {
                    const followUpRules = await prisma.workspaceAiFollowUpRule.findMany({
                        where: { workspace_id: workspaceId },
                        orderBy: { delay_milliseconds: 'asc' },
                    });
                    console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Encontradas ${followUpRules.length} regras de follow-up para Workspace ${workspaceId}.`);

                    if (followUpRules.length > 0) {
                        const firstRule = followUpRules[0];
                        const firstDelayMs = Number(firstRule.delay_milliseconds);

                        if (isNaN(firstDelayMs) || firstDelayMs < 0) {
                            console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Delay da primeira regra (${firstRule.id}) é inválido (${firstDelayMs}ms). Follow-up não será iniciado.`);
                        } else {
                            const newFollowUp = await prisma.followUp.create({
                                data: {
                                    workspace_id: workspaceId,
                                    client_id: client.id,
                                    conversationId: conversation.id,
                                    status: FollowUpStatus.ACTIVE,
                                    started_at: new Date(),
                                    current_sequence_step_order: 0,
                                    next_sequence_message_at: new Date(Date.now() + firstDelayMs),
                                },
                            });
                            console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Registro FollowUp ${newFollowUp.id} criado.`);

                            const jobData = {
                                followUpId: newFollowUp.id,
                                stepRuleId: firstRule.id,
                                workspaceId: workspaceId,
                            };
                            const jobOptions = {
                                delay: firstDelayMs,
                                jobId: `seq_${newFollowUp.id}_step_${firstRule.id}`,
                                removeOnComplete: true,
                                removeOnFail: 5000,
                            };
                            await sequenceStepQueue.add('processSequenceStep', jobData, jobOptions);
                            console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Primeiro job de sequência agendado para FollowUp ${newFollowUp.id} (Regra: ${firstRule.id}, Delay: ${firstDelayMs}ms).`);
                        }
                    } else {
                        console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Nenhuma regra de follow-up encontrada. Nenhum follow-up iniciado.`);
                    }
                } catch (followUpError) {
                    console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Erro ao iniciar sequência de follow-up para Conv ${conversation.id}:`, followUpError);
                }
            } else {
                console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Follow-up ativo ${existingActiveFollowUp.id} já existe para cliente ${client.id}. Nenhuma nova sequência iniciada.`);
            }

        } else {
            // Evento não é 'messages.upsert' ou é uma mensagem de 'fromMe: true'
            console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Evento não processado ou mensagem de saída: ${payload.event}, fromMe: ${payload.data?.key?.fromMe}`);
        }

    } catch (error: any) {
        console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Erro ao processar payload:`, error);
        // Responder OK mesmo em erro de processamento para não bloquear a API Evolution
    }

    // 4. Responder 200 OK para a Evolution API
    return new NextResponse('EVENT_RECEIVED', { status: 200 });
}

// (Opcional) Adicionar método GET se a Evolution precisar de verificação como a Meta
// Esta API da Evolution normalmente não usa GET para verificação de webhook como a Meta.
// O token na URL é a forma de autenticação do webhook.
// export async function GET(request: NextRequest, { params }: RouteParams) { ... } 