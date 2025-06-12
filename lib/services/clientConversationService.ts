import { Client, Conversation, ConversationStatus, Prisma, FollowUpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPipelineStages, createDeal } from '@/lib/actions/pipelineActions';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue';
import { triggerWorkspacePusherEvent } from '@/lib/pusherEvents';

export async function getOrCreateConversation(
    workspaceId: string,
    phoneNumber: string,
    clientName: string,
    channelIdentifier: string
): Promise<{ client: Client; conversation: Conversation; conversationWasCreated: boolean; clientWasCreated: boolean }> {


    let client = await prisma.client.findFirst({
        where: {
            workspace_id: workspaceId,
            phone_number: phoneNumber,
        }
    });

    let clientWasCreated = false;
    if (!client) {
        client = await prisma.client.create({
            data: {
                workspace_id: workspaceId,
                phone_number: phoneNumber,
                name: clientName, // Use provided name directly
                channel: channelIdentifier, // Salva o canal da interação atual
                metadata: {}
            }
        });
        clientWasCreated = true;
    } 

    let conversation: Conversation;
    let conversationWasCreated = false;

    const existingConversation = await prisma.conversation.findUnique({
        where: {
            workspace_id_client_id_channel: {
                workspace_id: workspaceId,
                client_id: client.id,
                channel: channelIdentifier,
            }
        }
    });

    if (!existingConversation) {
        conversation = await prisma.conversation.create({
            data: {
                workspace_id: workspaceId,
                client_id: client.id,
                channel: channelIdentifier,
                status: ConversationStatus.ACTIVE,
                is_ai_active: true,
                last_message_at: new Date(),
            },
            // Como inclui o relaionameto com workspace?

        });
        conversationWasCreated = true;
    } else {
        conversation = await prisma.conversation.update({
            where: {
                workspace_id_client_id_channel: {
                    workspace_id: workspaceId,
                    client_id: client.id,
                    channel: channelIdentifier,
                }
            },
            data: {
                last_message_at: new Date(),
                status: ConversationStatus.ACTIVE,
            }
        });
    }

    return { client, conversation, conversationWasCreated, clientWasCreated };
}

export async function handleDealCreationForNewClient(
    client: Client,
    workspaceId: string,
) {
    if (!client || !client.id) {
        console.error("[Deal Creation Logic] Cliente inválido fornecido.");
        return;
    }
    console.log(`[Deal Creation Logic] Novo cliente ${client.id}. Tentando criar Deal para workspace ${workspaceId}...`);
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
            console.log(`[Deal Creation Logic] Deal "${dealName}" criado para cliente ${client.id} no estágio "${firstStage.name}".`);
        } else {
            console.warn(`[Deal Creation Logic] Nenhum estágio de pipeline para workspace ${workspaceId}. Deal não criado para cliente ${client.id}.`);
        }
    } catch (dealError) {
        console.error(`[Deal Creation Logic] Erro ao criar Deal para cliente ${client.id} em workspace ${workspaceId}:`, dealError);
    }
}

import { FollowUp } from "@prisma/client"; // Importar FollowUp

export async function initiateFollowUpSequence(
    client: Client,
    conversation: Conversation,
    workspaceId: string,
): Promise<FollowUp | undefined> { // Adicionar tipo de retorno
    if (!client || !client.id || !conversation || !conversation.id) {
        console.error("[Follow-Up Logic] Cliente ou conversa inválidos.");
        return undefined; // Retornar undefined em caso de erro
    }

    const existingActiveFollowUp = await prisma.followUp.findFirst({
        where: {
            client_id: client.id,
            workspace_id: workspaceId,
            status: FollowUpStatus.ACTIVE
        },
        select: { id: true }
    });

    if (!existingActiveFollowUp) {
        console.log(`[Follow-Up Logic] Nenhum follow-up ativo para cliente ${client.id} (workspace ${workspaceId}). Iniciando sequência...`);
        try {
            const followUpRules = await prisma.workspaceAiFollowUpRule.findMany({
                where: { workspace_id: workspaceId },
                orderBy: { delay_milliseconds: 'asc' },
            });
            console.log(`[Follow-Up Logic] ${followUpRules.length} regras de follow-up para Workspace ${workspaceId}.`);

            if (followUpRules.length > 0) {
                const firstRule = followUpRules[0];
                const firstDelayMs = Number(firstRule.delay_milliseconds);

                if (isNaN(firstDelayMs) || firstDelayMs < 0) {
                    console.warn(`[Follow-Up Logic] Delay da regra ${firstRule.id} inválido (${firstDelayMs}ms). Follow-up não iniciado.`);
                    return undefined; // Retornar undefined
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
                    console.log(`[Follow-Up Logic] FollowUp ${newFollowUp.id} criado para conversa ${conversation.id}.`);

                    // Atualizar a conversa para conectar com o follow-up
                    await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: {
                            followUp: {
                                connect: { id: newFollowUp.id }
                            }
                        }
                    });
                    console.log(`[Follow-Up Logic] Conversa ${conversation.id} atualizada com link para FollowUp ${newFollowUp.id}.`);

                    // REMOVIDO: setTimeout e triggerWorkspacePusherEvent aqui
                    // O evento Pusher será disparado por processClientAndConversation

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
                    console.log(`[Follow-Up Logic] Job agendado para FollowUp ${newFollowUp.id} (Regra: ${firstRule.id}, Delay: ${firstDelayMs}ms).`);
                    return newFollowUp; // Retornar o novo follow-up
                }
            } else {
                console.log(`[Follow-Up Logic] Nenhuma regra de follow-up para Workspace ${workspaceId}. Follow-up não iniciado.`);
                return undefined; // Retornar undefined
            }
        } catch (followUpError) {
            console.error(`[Follow-Up Logic] Erro ao iniciar follow-up para Conv ${conversation.id} (Workspace ${workspaceId}):`, followUpError);
            return undefined; // Retornar undefined em caso de erro
        }
    } else {
        console.log(`[Follow-Up Logic] Follow-up ativo ${existingActiveFollowUp.id} já existe para cliente ${client.id}. Nenhuma nova sequência iniciada.`);
        return undefined; // Retornar undefined
    }
}

/**
 * Orquestra a criação/recuperação de cliente e conversa,
 * e inicia a criação de deal e sequência de follow-up.
 *
 * @param workspaceId ID do workspace.
 * @param phoneNumber Número de telefone do cliente.
 * @param clientName Nome do cliente (opcional).
 * @param channelIdentifier Identificador do canal (ex: 'WHATSAPP_CLOUDAPI', 'WHATSAPP_EVOLUTION', 'campaign').
 * @returns O cliente e a conversa processados.
 */
export async function processClientAndConversation(
    workspaceId: string,
    phoneNumber: string,
    clientName: string,
    channelIdentifier: string
) {
    const { client, conversation, conversationWasCreated, clientWasCreated } = await getOrCreateConversation(
        workspaceId,
        phoneNumber,
        clientName,
        channelIdentifier
    );

    if (clientWasCreated) {
        console.log(`[processClientAndConversation] Novo cliente detectado. Enviando evento Pusher 'client_created'...`);
        await triggerWorkspacePusherEvent(
            workspaceId,
            'client_created',
            {
                id: client.id,
                name: client.name,
                phone_number: client.phone_number,
                metadata: client.metadata
            }
        );
        console.log(`[processClientAndConversation] Evento Pusher 'client_created' enviado para workspace ${workspaceId} para cliente ${client.id}.`);
    }

    if (conversationWasCreated) {
        console.log(`[processClientAndConversation] Nova conversa detectada. Iniciando criação de deal e sequência de follow-up...`);
        await handleDealCreationForNewClient(client, workspaceId);
        const newFollowUp = await initiateFollowUpSequence(client, conversation, workspaceId);
        console.log(`[processClientAndConversation] Criação de deal e sequência de follow-up concluídas para conversa ${conversation.id}`);

        // Trigger Pusher event for new conversation
        await triggerWorkspacePusherEvent(
            workspaceId,
            'conversation_updated',
            {
                id: conversation.id,
                client: {
                    id: client.id,
                    name: client.name,
                    phone_number: client.phone_number,
                },
                conversation: {
                    id: conversation.id,
                    status: conversation.status,
                    channel: conversation.channel,
                    last_message_at: conversation.last_message_at,
                    is_ai_active: conversation.is_ai_active, // Adicionado is_ai_active
                },
                activeFollowUp: newFollowUp ? { // Incluir followUp se criado
                    id: newFollowUp.id,
                    status: newFollowUp.status,
                    next_sequence_message_at: newFollowUp.next_sequence_message_at,
                } : undefined,
            }
        );
        console.log(`[processClientAndConversation] Evento Pusher 'conversation_updated' enviado para workspace ${workspaceId} para nova conversa ${conversation.id}.`);

    } else {
        console.log(`[processClientAndConversation] Conversa existente ${conversation.id}. Nenhuma nova sequência de follow-up necessária.`);
    }

    return { client, conversation };
}
