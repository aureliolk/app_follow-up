import { prisma } from '@/lib/db';
import { FollowUpStatus, MessageSenderType, ConversationStatus } from '@prisma/client';
import { decrypt } from '@/lib/encryption';
import { sendWhatsAppMessage, sendEvolutionMessage } from "@/lib/services/channelService";
import { Prisma } from '@prisma/client';

// Context shapes for services
import type { Conversation, Client, Workspace, AbandonedCartRule, FollowUp as FollowUpModel, WorkspaceAiFollowUpRule, FollowUp } from '@prisma/client';
import { createDeal, getPipelineStages } from '../actions/pipelineActions';

/**
 * Contexto completo para processamento de carrinho abandonado.
 */
export interface AbandonedCartContext {
  conversation: Conversation;
  client: Client;
  workspace: Workspace & { abandonedCartRules: AbandonedCartRule[] };
  followUp: FollowUp | null;
}

/**
 * Contexto completo para processamento de follow-up por inatividade.
 */
export interface FollowUpContext {
  followUp: FollowUpModel;
  client: Client;
  workspace: Workspace & { ai_follow_up_rules: WorkspaceAiFollowUpRule[] };
  conversation: Conversation;
}

/**
 * Carrega dados de conversa, cliente, workspace (com regras de carrinho)
 * e o FollowUp associado (se existir).
 */
export async function loadAbandonedCartContext(
  conversationId: string,
  workspaceId: string
): Promise<AbandonedCartContext> {
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, workspace_id: workspaceId },
    include: {
      client: true,
      workspace: {
        include: {
          abandonedCartRules: {
            orderBy: { sequenceOrder: 'asc' },
          }
        }
      },
      followUp: true
    }
  });
  return { conversation, client: conversation.client, workspace: conversation.workspace, followUp: conversation.followUp };
}

/**
 * Carrega dados de followUp, cliente e regras para fluxo de inatividade.
 */
export async function loadFollowUpContext(
  followUpId: string,
  workspaceId: string
): Promise<FollowUpContext> {
  try {
    // Usar findUnique em vez de findUniqueOrThrow para evitar exceção
    const followUp = await prisma.followUp.findUnique({
    where: { id: followUpId },
    include: {
      client: true,
      workspace: {
        include: {
          ai_follow_up_rules: {
            orderBy: { delay_milliseconds: 'asc' },
          }
        }
      }
    }
  });

    // Se não encontrou o followUp, throw com mensagem clara
    if (!followUp) {
      throw new Error(`FollowUp ${followUpId} não encontrado. Provavelmente já foi convertido ou cancelado.`);
    }

  if (followUp.workspace_id !== workspaceId) {
    throw new Error(`FollowUp ${followUpId} não pertence ao workspace ${workspaceId}`);
  }

    // Verificar se o followUp está em um estado terminal
    if (followUp.status === FollowUpStatus.CONVERTED || 
        followUp.status === FollowUpStatus.CANCELLED || 
        followUp.status === FollowUpStatus.COMPLETED) {
      throw new Error(`FollowUp ${followUpId} está com status ${followUp.status}. Não deve ser processado.`);
    }

  // Buscar conversa ativa para este cliente no workspace
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: {
      workspace_id: workspaceId,
      client_id: followUp.client_id,
      status: ConversationStatus.ACTIVE
    },
    orderBy: { last_message_at: 'desc' }
  });
  return { followUp, client: followUp.client, workspace: followUp.workspace, conversation };
  } catch (error) {
    // Repassar o erro com contexto detalhado para que o worker possa tratá-lo corretamente
    throw error;
  }
}

/**
 * Obtém ou cria o cliente e conversa para um número no canal WhatsApp.
 * Retorna o cliente, a conversa e flag se foi criada agora.
 */
export async function getOrCreateConversation(
  workspaceId: string,
  phoneNumber: string,
  clientName?: string | null,
  channelIdentifier?: string | null
): Promise<{ client: Client; conversation: Conversation; conversationWasCreated: boolean; clientWasCreated: boolean }> {
  
  // Determinar o canal a ser usado. Se nenhum identificador for passado, pode-se usar um padrão ou lançar erro.
  // Por agora, vamos assumir que um canal válido sempre será passado ou que o comportamento legado (WHATSAPP genérico) é aceitável se channelIdentifier for nulo.
  // Idealmente, os chamadores (webhooks) SEMPRE passarão o channelIdentifier correto.
  const targetChannel = channelIdentifier || 'UNKNOWN_CHANNEL'; // Usar um placeholder ou tratar erro se não fornecido
  if (targetChannel === 'UNKNOWN_CHANNEL') {
    console.warn(`[getOrCreateConversation] Chamada sem channelIdentifier específico para workspace ${workspaceId}, phoneNumber ${phoneNumber}. Isso pode levar a problemas de roteamento.`);
    // Poderia lançar um erro aqui se for mandatório: throw new Error('Channel identifier is required');
  }

  // 1) Cliente
  let client = await prisma.client.findFirst({
    where: { 
      workspace_id: workspaceId, 
      phone_number: phoneNumber, 
      // Opcional: considerar o canal na busca do cliente se um mesmo número puder existir em canais diferentes
      // channel: targetChannel 
    }
  });
  let clientWasCreated = false;
  if (!client) {
    client = await prisma.client.create({
      data: {
        workspace_id: workspaceId,
        phone_number: phoneNumber,
        name: clientName ?? null,
        channel: targetChannel, // <<< Salvar o canal específico no Cliente também
        metadata: {}
      }
    });
    clientWasCreated = true;
  } else {
    // Cliente existe. Atualizar nome se necessário e canal se estiver diferente ou nulo.
    const dataToUpdate: Prisma.ClientUpdateInput = {};
    if (!client.name && clientName) {
      dataToUpdate.name = clientName;
    }
    if (client.channel !== targetChannel) { // Atualiza o canal do cliente se mudou ou era genérico
        dataToUpdate.channel = targetChannel;
    }
    if (Object.keys(dataToUpdate).length > 0) {
        client = await prisma.client.update({
            where: { id: client.id },
            data: dataToUpdate
        });
    }
  }

  // 2) Conversa
  let conversation: Conversation;
  let conversationWasCreated = false;
  try {
    conversation = await prisma.conversation.create({
      data: {
        workspace_id: workspaceId,
        client_id: client.id,
        channel: targetChannel, // <<< Usar o targetChannel aqui
        status: ConversationStatus.ACTIVE,
        is_ai_active: true,
        last_message_at: new Date()
      }
    });
    conversationWasCreated = true;
  } catch (e: any) {
    // Se já existir pela chave única workspace_id+client_id+channel, atualiza
    if (e.code === 'P2002' && e.meta?.target?.includes('workspace_id') && e.meta?.target?.includes('client_id') && e.meta?.target?.includes('channel')) {
      conversation = await prisma.conversation.update({
        where: {
          workspace_id_client_id_channel: {
            workspace_id: workspaceId,
            client_id: client.id,
            channel: targetChannel // <<< Usar o targetChannel aqui também
          }
        },
        data: {
          last_message_at: new Date(),
          status: ConversationStatus.ACTIVE // Reativar se estava fechada, por exemplo
        }
      });
    } else {
      // Se o erro P2002 for em outra constraint única, ou outro erro, relançar
      console.error("[getOrCreateConversation] Erro ao criar/atualizar conversa:", e);
      throw e;
    }
  }


  return { client, conversation, conversationWasCreated, clientWasCreated };
}

// Tipo para a mensagem pendente retornada
const pendingMessageSelect = {
  id: true,
  conversation_id: true,
  sender_type: true,
  content: true,
  timestamp: true,
  status: true,
  metadata: true,
  providerMessageId: true,
  conversation: {
    select: { workspace_id: true }
  }
};
type PendingMessageType = Prisma.MessageGetPayload<{ select: typeof pendingMessageSelect }>;

interface SendOperatorMessageResult {
  success: boolean;
  message?: PendingMessageType; // Retorna a mensagem criada (agora com workspace_id)
  error?: string;
  statusCode?: number;
}

/**
 * Envia uma mensagem manual de um operador para uma conversa.
 * Cria a mensagem no banco como PENDING e depois tenta enviar pelo canal apropriado.
 * Atualiza para FAILED se o envio falhar.
 */
export async function sendOperatorMessage(
  conversationId: string,
  operatorId: string,
  operatorName: string | null | undefined,
  content: string
): Promise<SendOperatorMessageResult> {
  const senderDisplayName = operatorName || 'Operador';
  // O prefixo com nome do operador será adicionado pela função de envio específica do canal,
  // pois a formatação pode variar (ex: Markdown para WhatsApp, texto puro para outros).
  // No entanto, sendWhatsAppMessage já faz isso, então vamos manter o `prefixedContent` por enquanto,
  // e sendEvolutionMessage pode precisar fazer o mesmo ou receber o nome do operador.
  // Por ora, a função sendEvolutionMessage não aceita displayName, então vamos enviar o conteúdo direto.
  // A sendWhatsAppMessage já adiciona o display name.

  let pendingMessage: PendingMessageType | null = null;

  try {
    // 1. Buscar Conversa + Client + Workspace (com credenciais)
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        client: true,
        workspace: { // Incluir todos os campos de credenciais necessários
          select: {
            id: true,
            whatsappPhoneNumberId: true,
            whatsappAccessToken: true,
            evolution_api_instance_name: true,
            evolution_api_token: true, // Para fallback
          }
        }
      }
    });

    if (!conversation.client) {
      throw new Error('Cliente não encontrado para a conversa.');
    }
    if (!conversation.workspace) {
      throw new Error('Workspace não encontrado para a conversa.');
    }

    const clientPhoneNumber = conversation.client.phone_number;
    const workspace = conversation.workspace;
    const channel = conversation.channel; // Obter o canal da conversa

    // 2. Criar mensagem PENDING
    pendingMessage = await prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_type: MessageSenderType.AGENT,
        content: content, // Salvar conteúdo original sem prefixo do operador por enquanto
        timestamp: new Date(),
        status: 'PENDING',
        metadata: { operatorId, operatorName: senderDisplayName }
      },
      select: pendingMessageSelect
    });
    
    console.log(`[Svc SendOperatorMsg] Saved PENDING message ${pendingMessage.id} for conv ${conversationId} on channel ${channel}`);

    // 3. Tentar enviar pelo canal apropriado
    let sendResult: any;

    if (channel === 'WHATSAPP') {
      console.log(`[Svc SendOperatorMsg] Attempting send via WhatsApp Cloud API for conv ${conversationId}`);
      if (!workspace.whatsappPhoneNumberId || !workspace.whatsappAccessToken || !clientPhoneNumber) {
        console.error(`[Svc SendOperatorMsg] WhatsApp Cloud API config incomplete for workspace ${workspace.id}. Details - PhoneID: ${!!workspace.whatsappPhoneNumberId}, Token: ${!!workspace.whatsappAccessToken}, ClientPhone: ${!!clientPhoneNumber}`);
        throw new Error('Configuração do WhatsApp Cloud API incompleta.');
      }
      sendResult = await sendWhatsAppMessage(
        workspace.whatsappPhoneNumberId,
        clientPhoneNumber,
        workspace.whatsappAccessToken, // Já é o encriptado, a função descriptografa
        content, // Conteúdo original, sendWhatsAppMessage adiciona o senderDisplayName
        senderDisplayName // Passar o nome do operador explicitamente
      );

      if (sendResult.success && sendResult.wamid) {
        console.log(`[Svc SendOperatorMsg] WhatsApp Cloud API send successful (Wamid: ${sendResult.wamid}) for msg ${pendingMessage.id}`);
        await prisma.message.update({
          where: { id: pendingMessage.id },
          data: {
            status: 'SENT',
            channel_message_id: sendResult.wamid,
            providerMessageId: sendResult.wamid
          }
        });
      } else {
        console.error(`[Svc SendOperatorMsg] WhatsApp Cloud API send FAILED for msg ${pendingMessage.id}. Error:`, sendResult.error);
        throw new Error(typeof sendResult.error === 'string' ? sendResult.error : (sendResult.error as any)?.message || 'Falha no envio via WhatsApp Cloud API');
      }

    } else if (channel === 'WHATSAPP_EVOLUTION') {
      console.log(`[Svc SendOperatorMsg] Attempting send via Evolution API for conv ${conversationId}`);
      const apiKeyToUse = workspace.evolution_api_token;
      if ( !apiKeyToUse || !workspace.evolution_api_instance_name || !clientPhoneNumber) {
        console.error(`[Svc SendOperatorMsg] Evolution API config incomplete for workspace ${workspace.id}. Endpoint: ${process.env.apiUrlEvolution}, Key: ${!!apiKeyToUse}, Instance: ${!!workspace.evolution_api_instance_name}, ClientPhone: ${!!clientPhoneNumber}`);
        throw new Error('Configuração da Evolution API incompleta.');
      }
      // A função sendEvolutionMessage já lida com o prefixo do senderName.
      sendResult = await sendEvolutionMessage({
        endpoint: process.env.apiUrlEvolution,
        apiKey: apiKeyToUse,
        instanceName: workspace.evolution_api_instance_name,
        toPhoneNumber: clientPhoneNumber,
        messageContent: content, // Passar o conteúdo original
        senderName: senderDisplayName // Passar o nome do operador para a função de envio
      });

      if (sendResult.success && sendResult.messageId) {
        console.log(`[Svc SendOperatorMsg] Evolution API send successful (MsgID: ${sendResult.messageId}) for msg ${pendingMessage.id}`);
        await prisma.message.update({
          where: { id: pendingMessage.id },
          data: {
            status: 'SENT',
            channel_message_id: sendResult.messageId,
            providerMessageId: sendResult.messageId
          }
        });
      } else {
        console.error(`[Svc SendOperatorMsg] Evolution API send FAILED for msg ${pendingMessage.id}. Error:`, sendResult.error);
        throw new Error(sendResult.error || 'Falha no envio via Evolution API');
      }
    } else {
      console.error(`[Svc SendOperatorMsg] Unsupported channel "${channel}" for sending operator message in conv ${conversationId}.`);
      throw new Error(`Canal "${channel}" não suportado para envio de mensagens manuais.`);
    }

    // 4. Atualizar last_message_at da conversa (apenas em sucesso)
    // A mensagem PENDING já atualizou, mas o status SENT confirma
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: pendingMessage.timestamp }
    });
    console.log(`[Svc SendOperatorMsg] Updated conversation ${conversationId} last_message_at after SUCCESSFUL send of msg ${pendingMessage.id}.`);
    
    // Recarregar a mensagem com o status atualizado para retorno
    pendingMessage = await prisma.message.findUnique({ where: { id: pendingMessage.id }, select: pendingMessageSelect });

    return { success: true, message: pendingMessage! };

  } catch (error: any) {
    console.error(`[Svc SendOperatorMsg] Error sending message for conv ${conversationId}:`, error);
    if (pendingMessage) {
      try {
        await prisma.message.update({
          where: { id: pendingMessage.id },
          data: { status: 'FAILED', errorMessage: error.message }
        });
        console.log(`[Svc SendOperatorMsg] Updated message ${pendingMessage.id} to FAILED.`);
        
        // Atualiza last_message_at da conversa mesmo em falha, pois a mensagem foi criada
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { last_message_at: pendingMessage.timestamp } 
        });
        console.log(`[Svc SendOperatorMsg] Updated conversation ${conversationId} last_message_at after FAILED message ${pendingMessage.id}.`);

      } catch (dbError) {
        console.error(`[Svc SendOperatorMsg] CRITICAL: Failed to update message ${pendingMessage.id} to FAILED status:`, dbError);
      }
    }
    return { success: false, error: error.message, statusCode: error.message.includes('incompleta') || error.message.includes('não suportado') ? 400 : 500 };
  }
}