import { Client, Conversation, ConversationStatus, Prisma, FollowUpStatus, WorkspaceAiFollowUpRule } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPipelineStages, createDeal } from '@/lib/actions/pipelineActions';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue';

export async function getOrCreateConversation(
    workspaceId: string,
    phoneNumber: string,
    clientName?: string | null,
    channelIdentifier?: string | null
): Promise<{ client: Client; conversation: Conversation; conversationWasCreated: boolean; clientWasCreated: boolean }> {
    const targetChannel = channelIdentifier || 'UNKNOWN_CHANNEL';
    if (targetChannel === 'UNKNOWN_CHANNEL') {
        console.warn(`[getOrCreateConversation] Chamada sem channelIdentifier específico para workspace ${workspaceId}, phoneNumber ${phoneNumber}. Isso pode levar a problemas de roteamento.`);
    }

    let client = await prisma.client.findFirst({
        where: {
            workspace_id: workspaceId,
            phone_number: phoneNumber,
            // Não se busca cliente pelo canal, um mesmo número pode estar em vários canais
            // mas o canal do cliente é atualizado para o mais recente usado.
        }
    });

    let clientWasCreated = false;
    if (!client) {
        client = await prisma.client.create({
            data: {
                workspace_id: workspaceId,
                phone_number: phoneNumber,
                name: clientName ?? null,
                channel: targetChannel, // Salva o canal da interação atual
                metadata: {}
            }
        });
        clientWasCreated = true;
    } else {
        const dataToUpdate: Prisma.ClientUpdateInput = {};
        // Atualiza nome apenas se um nome foi fornecido E o cliente não tinha nome
        if (clientName && !client.name) {
            dataToUpdate.name = clientName;
        }
        // Atualiza o canal do cliente para o canal desta interação, se diferente
        if (client.channel !== targetChannel) {
            dataToUpdate.channel = targetChannel;
        }

        if (Object.keys(dataToUpdate).length > 0) {
            client = await prisma.client.update({
                where: { id: client.id },
                data: dataToUpdate
            });
        }
    }

    let conversation: Conversation;
    let conversationWasCreated = false;

    // Tenta encontrar uma conversa existente para este cliente neste canal e workspace
    const existingConversation = await prisma.conversation.findUnique({
        where: {
            workspace_id_client_id_channel: {
                workspace_id: workspaceId,
                client_id: client.id,
                channel: targetChannel,
            }
        }
    });

    if (!existingConversation) {
        conversation = await prisma.conversation.create({
            data: {
                workspace_id: workspaceId,
                client_id: client.id,
                channel: targetChannel,
                status: ConversationStatus.ACTIVE,
                is_ai_active: true, // Por padrão, IA ativa em novas conversas
                last_message_at: new Date(),
            }
        });
        conversationWasCreated = true;
    } else {
        conversation = await prisma.conversation.update({
            where: {
                workspace_id_client_id_channel: {
                    workspace_id: workspaceId,
                    client_id: client.id,
                    channel: targetChannel,
                }
            },
            data: {
                last_message_at: new Date(),
                status: ConversationStatus.ACTIVE, // Reativa se estava fechada
                // Mantém valor atual de is_ai_active, não o sobrescreve
            }
        });
        // conversationWasCreated permanece false, pois a conversa já existia
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
                value: null, // Conforme original
            });
            console.log(`[Deal Creation Logic] Deal "${dealName}" criado para cliente ${client.id} no estágio "${firstStage.name}".`);
        } else {
            console.warn(`[Deal Creation Logic] Nenhum estágio de pipeline para workspace ${workspaceId}. Deal não criado para cliente ${client.id}.`);
        }
    } catch (dealError) {
        console.error(`[Deal Creation Logic] Erro ao criar Deal para cliente ${client.id} em workspace ${workspaceId}:`, dealError);
    }
}

export async function initiateFollowUpSequence(
    client: Client,
    conversation: Conversation,
    workspaceId: string,
) {
    if (!client || !client.id || !conversation || !conversation.id) {
        console.error("[Follow-Up Logic] Cliente ou conversa inválidos.");
        return;
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
                }
            } else {
                console.log(`[Follow-Up Logic] Nenhuma regra de follow-up para Workspace ${workspaceId}. Follow-up não iniciado.`);
            }
        } catch (followUpError) {
            console.error(`[Follow-Up Logic] Erro ao iniciar follow-up para Conv ${conversation.id} (Workspace ${workspaceId}):`, followUpError);
        }
    } else {
        console.log(`[Follow-Up Logic] Follow-up ativo ${existingActiveFollowUp.id} já existe para cliente ${client.id}. Nenhuma nova sequência iniciada.`);
    }
}

