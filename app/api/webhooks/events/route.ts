// /api/webhooks/events/route.ts


import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { FollowUpStatus, Prisma, ConversationStatus } from '@prisma/client';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue'; // Para agendar jobs
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils'; // <<< IMPORTAR AQUI

// Esquema de validação para o corpo da requisição do evento
const eventWebhookSchema = z.object({
  eventName: z.string().min(1, "Nome do evento é obrigatório"),
  customerPhoneNumber: z.string().min(10, "Número de telefone inválido"), // Validação básica
  workspaceId: z.string().min(1, "ID do workspace é obrigatório"),
  customerName: z.string().min(1, "Nome do cliente é obrigatório"),
  eventData: z.record(z.unknown()).optional().default({}), // Objeto para dados extras
 
});


export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key'); // <<< Ler x-api-key
  console.log("API POST /api/webhooks/events: Request received.");

  let parsedBody: any;
  let workspaceId: string; // <<< Declarar workspaceId aqui
  try {
    const body = await req.json();
    parsedBody = eventWebhookSchema.parse(body);
    workspaceId = parsedBody.workspaceId; // <<< Extrair workspaceId do corpo parseado
    console.log(`API POST /api/webhooks/events: Parsed body for workspace ${workspaceId}:`, parsedBody);
  } catch (error) {
    console.warn(`API POST /api/webhooks/events: Invalid request body for workspace ${workspaceId}:`, error);
    return NextResponse.json({ success: false, error: 'Dados inválidos na requisição', details: (error as z.ZodError).errors }, { status: 400 });
  }

  // --- Validação do API Key (APÓS pegar workspaceId do corpo) ---
  console.log(`API POST /api/webhooks/events: Attempting auth via x-api-key for workspace ${workspaceId}.`);
  if (!apiKey) {
      console.warn(`API POST /api/webhooks/events: Authentication failed. Missing x-api-key header.`);
      return NextResponse.json({ success: false, error: 'Não autorizado. Cabeçalho x-api-key ausente.' }, { status: 401 });
  }

  try {
      const tokenRecord = await prisma.workspaceApiToken.findFirst({
          where: {
              token: apiKey,
              workspace_id: workspaceId, // Validar contra o workspace da requisição
              revoked: false,
              OR: [
                  { expires_at: null },
                  { expires_at: { gt: new Date() } }
              ]
          },
          select: { id: true } // Apenas confirmar existência
      });

      if (!tokenRecord) {
          console.warn(`API POST /api/webhooks/events: Authentication failed. Invalid or expired API key provided for workspace ${workspaceId}.`);
          return NextResponse.json({ success: false, error: 'Não autorizado. API key inválida ou expirada para este workspace.' }, { status: 401 });
      }

      console.log(`API POST /api/webhooks/events: Authentication successful via API key for workspace ${workspaceId}. Token ID: ${tokenRecord.id}`);
      // Atualizar last_used_at (sem bloquear)
      prisma.workspaceApiToken.update({
          where: { id: tokenRecord.id },
          data: { last_used_at: new Date() }
      }).catch(err => {
          console.error(`API POST /api/webhooks/events: Failed to update last_used_at for token ${tokenRecord.id}`, err);
      });

  } catch (error) {
      console.error('API POST /api/webhooks/events: Error validating API key:', error);
      return NextResponse.json({ success: false, error: 'Erro interno ao validar API key.' }, { status: 500 });
  }
  // --- Fim da Validação do API Key ---

  const { eventName, customerPhoneNumber: customerPhoneNumberRaw, eventData, customerName } = parsedBody;

  // +++ PADRONIZAR NÚMERO DO CLIENTE +++
  const customerPhoneNumber = standardizeBrazilianPhoneNumber(customerPhoneNumberRaw);

  if (!customerPhoneNumber) {
      console.warn(`API POST /api/webhooks/events: Número de telefone inválido ou não padronizável fornecido: ${customerPhoneNumberRaw} para workspace ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'Número de telefone inválido ou não pode ser padronizado.' }, { status: 400 });
  }
  console.log(`API POST /api/webhooks/events: Telefone padronizado de ${customerPhoneNumberRaw} para ${customerPhoneNumber}`);
  // --- Fim Padronização ---

  try {
    // 3. Encontrar ou Criar Cliente (usando telefone PADRONIZADO) - Refatorado
    const targetChannel = 'WHATSAPP'; // Canal desejado para esta interação
    console.log(`API POST /api/webhooks/events: Finding or creating client for standardized phone ${customerPhoneNumber} and channel ${targetChannel} in workspace ${workspaceId}`);

    let client: Prisma.ClientGetPayload<{ select: { id: true, name: true, channel: true } }>; // Definir tipo para o cliente final
    let wasCreated = false;

    // Tentar encontrar cliente existente pelo telefone no workspace
    // Busca primeiro com o canal correto para otimizar o caso comum
    let existingClient = await prisma.client.findUnique({
        where: {
            workspace_id_phone_number_channel: {
                workspace_id: workspaceId,
                phone_number: customerPhoneNumber,
                channel: targetChannel,
            }
        },
        select: { id: true, name: true, channel: true },
    });

    // Se não encontrou com o canal certo, buscar SÓ pelo telefone para ver se existe com outro canal
    if (!existingClient) {
        existingClient = await prisma.client.findFirst({
            where: {
                workspace_id: workspaceId,
                phone_number: customerPhoneNumber,
                // NÃO filtra por canal aqui
            },
             select: { id: true, name: true, channel: true },
        });
    }


    if (existingClient) {
        // Cliente encontrado, verificar/atualizar canal e nome
        console.log(`API POST /api/webhooks/events: Found existing client ${existingClient.id}. Current channel: ${existingClient.channel}`);
        const dataToUpdate: Prisma.ClientUpdateInput = { updated_at: new Date() };
        let needsUpdate = false;

        // Precisa atualizar o canal?
        if (existingClient.channel !== targetChannel) {
            dataToUpdate.channel = targetChannel;
            needsUpdate = true;
            console.log(`API POST /api/webhooks/events: Updating channel for client ${existingClient.id} to ${targetChannel}.`);
        }

        // Precisa corrigir o nome? (Se o nome atual for igual ao número antigo raw ou nulo)
        if ((existingClient.name === customerPhoneNumberRaw && customerPhoneNumberRaw !== customerPhoneNumber) || existingClient.name === null) {
            dataToUpdate.name = customerPhoneNumber; // Atualiza/define para número padronizado
            needsUpdate = true;
            console.log(`API POST /api/webhooks/events: Updating/Setting name for client ${existingClient.id} to ${customerPhoneNumber}.`);
        }

        if (needsUpdate) {
            client = await prisma.client.update({
                where: { id: existingClient.id },
                data: dataToUpdate,
                select: { id: true, name: true, channel: true }, // Selecionar os mesmos campos
            });
            console.log(`API POST /api/webhooks/events: Client ${client.id} updated.`);
        } else {
            client = existingClient; // Nenhuma atualização necessária nos campos verificados
            console.log(`API POST /api/webhooks/events: Client ${existingClient.id} already up-to-date.`);
        }

    } else {
        // Cliente não encontrado, criar novo
        console.log(`API POST /api/webhooks/events: Client not found. Creating new client...`);
        client = await prisma.client.create({
            data: {
                workspace_id: workspaceId,
                phone_number: customerPhoneNumber,
                channel: targetChannel,
                name: customerName, // Nome padrão inicial
                // metadata: eventData || Prisma.DbNull, // Adicionar se necessário
            },
            select: { id: true, name: true, channel: true }, // Selecionar os mesmos campos
        });
        wasCreated = true; // Marcar que foi criado para lógicas futuras (como iniciar follow-up)
        console.log(`API POST /api/webhooks/events: Client ${client.id} created with channel ${client.channel}.`);
    }

    console.log(`API POST /api/webhooks/events: Client ${client.id} (Name: ${client.name}) ready for workspace ${workspaceId}`);
    // --- Fim da Lógica Refatorada ---

    // --- PASSO 3: Verificar Conversa ATIVA OU Follow-up ATIVO/PAUSADO --- (Agora usa a variável 'client' correta)
    console.log(`API POST /api/webhooks/events: Checking for existing ACTIVE Conversation or ACTIVE/PAUSED FollowUp for client ${client.id}`);

    const existingActiveConversation = await prisma.conversation.findFirst({
        where: {
            client_id: client.id,
            workspace_id: workspaceId,

            status: ConversationStatus.ACTIVE,
        },
        select: { id: true, status: true }
    });

    // 4. Verificar Follow-up Existente (Ativo/Pausado)
    // console.log(`API POST /api/webhooks/events: Checking for existing ACTIVE/PAUSED follow-up for client ${client.id}`);
    const existingActiveFollowUp = await prisma.followUp.findFirst({
      where: {
        client_id: client.id,
        workspace_id: workspaceId,
        status: {
          in: [FollowUpStatus.ACTIVE, FollowUpStatus.PAUSED],
        }
      },
      select: { id: true, status: true }
    });

    // --- PASSO 4/5: Decidir se inicia ---
    if (existingActiveConversation || existingActiveFollowUp) {
        let reason = "";
        if (existingActiveConversation) reason += `Conversation ${existingActiveConversation.id} is ACTIVE. `;
        if (existingActiveFollowUp) reason += `FollowUp ${existingActiveFollowUp.id} is ${existingActiveFollowUp.status}.`;
        console.log(`API POST /api/webhooks/events: Client ${client.id} already has an active interaction. ${reason} Skipping new conversation/follow-up initiation for event '${eventName}'.`);
        // TODO: Implementar lógica alternativa se necessário (pausar antigo, adicionar nota, etc.)
        return NextResponse.json({ success: true, message: `Interação ativa existente (${reason.trim()}). Nenhum novo follow-up iniciado.` });
    } else {
       console.log(`API POST /api/webhooks/events: No active conversation or follow-up found for client ${client.id}. Proceeding based on event type '${eventName}'.`);
       // Continuar para a lógica específica do evento abaixo...
    }

    // --- NOVA LÓGICA: Tratar 'abandoned_cart' separadamente ---
    const now = new Date(); // Definir 'now' aqui para usar em ambos os blocos

    if (eventName === 'abandoned_cart') {
        console.log(`API POST /api/webhooks/events: [Abandoned Cart] Processing event for workspace ${workspaceId}, client ${client.id}`);

        // 1. Buscar Regras de Carrinho Abandonado para o Workspace
        const abandonedCartRules = await prisma.abandonedCartRule.findMany({
            where: {
                workspace_id: workspaceId,
                // Adicionar filtro para regras ativas se existir um campo 'isActive' no futuro
            },
            orderBy: {
                sequenceOrder: 'asc', // Ou outra ordenação se relevante
            },
            select: {
                id: true,
                delay_milliseconds: true,
                message_content: true,
                sequenceOrder: true,
            }
        });

        if (!abandonedCartRules || abandonedCartRules.length === 0) {
            console.log(`API POST /api/webhooks/events: [Abandoned Cart] No active abandoned cart rules found for workspace ${workspaceId}. No action taken.`);
            return NextResponse.json({ success: true, message: "Evento 'abandoned_cart' recebido, mas nenhuma regra de recuperação ativa configurada." });
        }

        console.log(`API POST /api/webhooks/events: [Abandoned Cart] Found ${abandonedCartRules.length} rule(s) for workspace ${workspaceId}.`);

        // 2. Criar FollowUp ANTES da conversa
        console.log(`API POST /api/webhooks/events: [Abandoned Cart] Creating new FollowUp record for client ${client.id}`);
        const newAbandonedCartFollowUp = await prisma.followUp.create({
            data: {
                workspace_id: workspaceId,
                client_id: client.id,
                status: FollowUpStatus.ACTIVE,
                started_at: now,
                current_sequence_step_order: 0,
            },
            select: { id: true }
        });
        console.log(`API POST /api/webhooks/events: [Abandoned Cart] FollowUp record ${newAbandonedCartFollowUp.id} created.`);

        // 2. Criar Conversa (e associar FollowUp)
        console.log(`API POST /api/webhooks/events: [Abandoned Cart] Creating new Conversation record for client ${client.id}`);
        const conversationChannelType = 'ABANDONED_CART';
        const newConversation = await prisma.conversation.create({
            data: {
                workspace_id: workspaceId,
                client_id: client.id,
                channel: conversationChannelType,
                status: ConversationStatus.ACTIVE, 
                is_ai_active: true,
                last_message_at: now, 
                metadata: { initiatedByEvent: eventName, eventData: eventData },
                followUp: { 
                    connect: { id: newAbandonedCartFollowUp.id } 
                }
            },
            select: { id: true }
        });
        console.log(`API POST /api/webhooks/events: [Abandoned Cart] Conversation record ${newConversation.id} created and linked to FollowUp ${newAbandonedCartFollowUp.id}.`);

        // 4. Agendar um Job para CADA Regra de Carrinho
        let scheduledJobsCount = 0;
        for (const rule of abandonedCartRules) {
            const ruleDelayMs = Number(rule.delay_milliseconds);

            // Validar Delay da Regra Específica
            if (isNaN(ruleDelayMs) || ruleDelayMs < 0) {
                console.warn(`API POST /api/webhooks/events: [Abandoned Cart] Delay da regra ${rule.id} é inválido (${ruleDelayMs}ms). Skipping this rule.`);
                continue; // Pular para a próxima regra
            }

            // Preparar dados do Job
            const jobData = {
                jobType: 'abandonedCart',
                abandonedCartRuleId: rule.id,
                workspaceId: workspaceId,
                clientId: client.id,
                conversationId: newConversation.id,
                messageContent: rule.message_content,
                eventData: eventData,
            };
            const jobOptions = {
                delay: ruleDelayMs,
                jobId: `acart_${newConversation.id}_rule_${rule.id}`,
                removeOnComplete: true,
                removeOnFail: 5000,
            };

            // Agendar Job
            await sequenceStepQueue.add('processAbandonedCartStep', jobData, jobOptions);
            console.log(`API POST /api/webhooks/events: [Abandoned Cart] Job scheduled for rule ${rule.id} (Delay: ${ruleDelayMs}ms) in Conversation ${newConversation.id}.`);
            scheduledJobsCount++;
        }

        // Retornar sucesso específico para carrinho abandonado
        return NextResponse.json({
            success: true,
            message: `Evento '${eventName}' recebido. Conversa ${newConversation.id} criada. ${scheduledJobsCount} mensagens de recuperação agendadas.`
        });

    } else {
        // --- LÓGICA ORIGINAL PARA OUTROS EVENTOS (USANDO MAPEAMENTO E CAMPANHAS) ---
        console.log(`API POST /api/webhooks/events: [Generic Event] Processing event '${eventName}' using campaign mapping for workspace ${workspaceId}.`);

        // --- PASSO 6: Identificar Campanha via Mapeamento de Evento ---
        console.log(`API POST /api/webhooks/events: Buscando mapeamento para evento '${eventName}' no workspace ${workspaceId}`);
        const eventMapping = await prisma.eventFollowUpMapping.findUnique({
            where: {
                workspaceId_eventName: {
                    workspaceId: workspaceId,
                    eventName: eventName,
                },
                isActive: true,
            },
            select: {
                followUpCampaignId: true,
                followUpCampaign: {
                    select: { name: true }
                }
            }
        });

        if (!eventMapping) {
            console.log(`API POST /api/webhooks/events: Nenhum mapeamento ativo encontrado para o evento '${eventName}'. Follow-up não será iniciado.`);
            return NextResponse.json({ success: true, message: `Nenhum mapeamento de follow-up ativo encontrado para o evento '${eventName}'.` });
        }

        const followUpCampaignId = eventMapping.followUpCampaignId;
        // Adicionado tratamento para caso followUpCampaign seja null/undefined (embora não devesse ser pelo select)
        const campaignName = eventMapping.followUpCampaign?.name ?? 'Nome Desconhecido';
        console.log(`API POST /api/webhooks/events: Mapeamento encontrado. Evento '${eventName}' iniciará a campanha '${campaignName}' (ID: ${followUpCampaignId}).`);

        // --- PASSO 6.1: Buscar Primeira Regra da Campanha Mapeada ---
        const firstRule = await prisma.workspaceAiFollowUpRule.findFirst({
            where: {
                followUpCampaignId: followUpCampaignId,
            },
            orderBy: {
                sequenceOrder: 'asc',
            },
            select: {
                id: true,
                delay_milliseconds: true,
                sequenceOrder: true,
            }
        });

        if (!firstRule) {
            console.warn(`API POST /api/webhooks/events: Campanha '${campaignName}' (ID: ${followUpCampaignId}) mapeada para o evento '${eventName}', mas não contém nenhuma regra de follow-up. Follow-up não será iniciado.`);
            return NextResponse.json({ success: true, message: `Campanha '${campaignName}' mapeada, mas sem regras de follow-up configuradas.` });
        }

        console.log(`API POST /api/webhooks/events: Primeira regra da campanha encontrada (ID: ${firstRule.id}, Order: ${firstRule.sequenceOrder}).`);
        const firstDelayMs = Number(firstRule.delay_milliseconds);

        // --- PASSO 6.2: Validar Delay ---
        if (isNaN(firstDelayMs) || firstDelayMs < 0) {
            console.warn(`API POST /api/webhooks/events: Delay da regra (${firstRule.id}) é inválido (${firstDelayMs}ms). Follow-up não será iniciado.`);
            return NextResponse.json({ success: false, error: "Configuração de delay da regra de follow-up inválida." }, { status: 500 });
        }

        // --- PASSO 8: Criar Registro FollowUp PRIMEIRO (para ter o ID) ---
        console.log(`API POST /api/webhooks/events: Creating new FollowUp record for client ${client.id} (Campaign ${followUpCampaignId})`);
        const newFollowUp = await prisma.followUp.create({
            data: {
                workspace_id: workspaceId,
                client_id: client.id,
                campaign_id: followUpCampaignId,
                status: FollowUpStatus.ACTIVE,
                started_at: now,
                current_sequence_step_order: 0,
                next_sequence_message_at: new Date(now.getTime() + firstDelayMs),
            },
            select: { id: true }
        });
        console.log(`API POST /api/webhooks/events: FollowUp record ${newFollowUp.id} created.`);

        // --- PASSO 7: Criar Nova Conversa (e associar FollowUp) ---
        console.log(`API POST /api/webhooks/events: Creating new Conversation record for client ${client.id}`);
        const conversationChannelType = 'SYSTEM';
        const newConversation = await prisma.conversation.create({
            data: {
                workspace_id: workspaceId,
                client_id: client.id,
                channel: conversationChannelType,
                status: ConversationStatus.ACTIVE,
                is_ai_active: true, 
                last_message_at: now,
                metadata: { initiatedByEvent: eventName, eventData: eventData },
                followUp: { 
                    connect: { id: newFollowUp.id } 
                }
            },
            select: { id: true }
        });
        console.log(`API POST /api/webhooks/events: Conversation record ${newConversation.id} created and linked to FollowUp ${newFollowUp.id}.`);
        
        // --- PASSO 9: Agendar Primeiro Passo...
        const jobData = {
            followUpId: newFollowUp.id,
            stepRuleId: firstRule.id,
            workspaceId: workspaceId,
            conversationId: newConversation.id,
        };
        const jobOptions = {
            delay: firstDelayMs,
            jobId: `seq_${newFollowUp.id}_step_${firstRule.id}`,
            removeOnComplete: true,
            removeOnFail: 5000,
        };
        await sequenceStepQueue.add('processSequenceStep', jobData, jobOptions);
        console.log(`API POST /api/webhooks/events: First sequence job scheduled for FollowUp ${newFollowUp.id} (Rule: ${firstRule.id}, Delay: ${firstDelayMs}ms).`);

        // Retornar sucesso incluindo ID da conversa e do follow-up
        return NextResponse.json({
            success: true,
            message: `Evento '${eventName}' recebido. Conversa ${newConversation.id} e Follow-up ${newFollowUp.id} (Campanha: ${campaignName}) iniciados.`
        });
    }
    // --- FIM DA NOVA LÓGICA ---

  } catch (error) {
    console.error(`API POST /api/webhooks/events: Internal error processing event for workspace ${workspaceId}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle known Prisma errors
        console.error(`API POST /api/webhooks/events: Prisma Error Code - ${error.code}`, error.message);
        return NextResponse.json({ success: false, error: 'Erro no banco de dados ao processar evento.' }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'Erro interno ao processar evento' }, { status: 500 });
  }
}

