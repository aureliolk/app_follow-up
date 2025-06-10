import { prisma } from '@/lib/db';
import { FollowUpStatus, MessageSenderType, ConversationStatus } from '@prisma/client';
import { sendWhatsAppMessage, sendEvolutionMessage } from "@/lib/services/channelService";
import { Prisma } from '@prisma/client';
import { triggerWorkspacePusherEvent } from '@/lib/pusherEvents';

// Context shapes for services
import type { Conversation, Client, Workspace, AbandonedCartRule, FollowUp as FollowUpModel, WorkspaceAiFollowUpRule, FollowUp } from '@prisma/client';

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
 * Cria a mensagem no banco como PENDING (ou SENT se privada) e depois tenta enviar
 * pelo canal apropriado (apenas se não for privada).
 * Atualiza para FAILED se o envio falhar.
 */
export async function sendOperatorMessage(
  conversationId: string,
  operatorId: string,
  operatorName: string | null | undefined,
  content: string,
  isPrivateNote: boolean = false
): Promise<SendOperatorMessageResult> {
  const senderDisplayName = operatorName || 'Operador';
 

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

    // 2. Criar mensagem PENDING (ou SENT se for nota privada)
    pendingMessage = await prisma.message.create({
      data: {
        conversation_id: conversationId,
        sender_type: MessageSenderType.AGENT,
        content: content,
        timestamp: new Date(),
        status: isPrivateNote ? 'SENT' : 'PENDING',
        privates_notes: isPrivateNote,
        operator_name: operatorName, // Add operator_name here
        metadata: { operatorId, operatorName: senderDisplayName },
      },
      select: {
        id: true,
        conversation_id: true,
        sender_type: true,
        content: true,
        timestamp: true,
        status: true,
        metadata: true,
        providerMessageId: true,
        errorMessage: true,
        privates_notes: true,
        conversation: {
          select: { workspace_id: true }
        },
        operator_name: true // Incluir o nome do operador na seleção
      }
    });
    
    console.log(`[Svc SendOperatorMsg] Saved ${isPrivateNote ? 'PRIVATE note' : 'PENDING message'} ${pendingMessage.id} for conv ${conversationId} on channel ${channel}`);

    // 3. Tentar enviar pelo canal apropriado (APENAS SE NÃO FOR NOTA PRIVADA)
    let sendResult: any;

    if (!isPrivateNote) {

      if (channel === 'WHATSAPP_CLOUDAPI') {
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
    }

    // 4. Atualizar last_message_at da conversa (apenas em sucesso de envio OU se for nota privada)
    // A mensagem PENDING/SENT já atualizou, mas confirmamos
    if (!isPrivateNote && sendResult?.success) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { last_message_at: pendingMessage.timestamp }
        });
        console.log(`[Svc SendOperatorMsg] Updated conversation ${conversationId} last_message_at after SUCCESSFUL send of msg ${pendingMessage.id}.`);
    } else if (isPrivateNote) {
         await prisma.conversation.update({
            where: { id: conversationId },
            data: { last_message_at: pendingMessage.timestamp }
        });
        console.log(`[Svc SendOperatorMsg] Updated conversation ${conversationId} last_message_at after saving PRIVATE note ${pendingMessage.id}.`);
    }

    return { success: true, message: pendingMessage! };

  } catch (error: any) {
    console.error(`[Svc SendOperatorMsg] Error sending message for conv ${conversationId}:`, error);
    if (pendingMessage) {
      try {
        // Marcar como FAILED apenas se não for nota privada e falhou no envio
        if (!isPrivateNote) {
             await prisma.message.update({
               where: { id: pendingMessage.id },
               data: { status: 'FAILED', errorMessage: error.message }
            });
             console.log(`[Svc SendOperatorMsg] Updated message ${pendingMessage.id} to FAILED.`);
        }
        
        // Atualiza last_message_at da conversa mesmo em falha (se a mensagem foi criada)
        // A atualização do last_message_at deve ocorrer se a mensagem foi criada no DB, independentemente do sucesso do envio externo
        if (pendingMessage) { // Check if pendingMessage was successfully created
           await prisma.conversation.update({
               where: { id: pendingMessage.conversation_id },
               data: { last_message_at: pendingMessage.timestamp }
           });
            console.log(`[Svc SendOperatorMsg] Updated conversation ${pendingMessage.conversation_id} last_message_at after processing message ${pendingMessage.id} (status: ${pendingMessage.status}).`);
        }

      } catch (dbError) {
        console.error(`[Svc SendOperatorMsg] CRITICAL: Failed to update message ${pendingMessage.id} to FAILED status:`, dbError);
      }
    }
    // Retornar erro apenas se não for nota privada que falhou no envio externo.
    // Se for nota privada, o erro seria na criação no DB, então o retorno é o mesmo.
    return { success: false, error: error.message, statusCode: error.message.includes('incompleta') || error.message.includes('não suportado') ? 400 : 500 };
  }
}
