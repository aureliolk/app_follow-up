import { prisma } from '@/lib/db';
import { FollowUpStatus, MessageSenderType, ConversationStatus } from '@prisma/client';
import { decrypt } from '@/lib/encryption';
import { sendWhatsappMessage } from "@/lib/channel/whatsappSender";
import { Prisma } from '@prisma/client';

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
 * Carrega dados necessários para processar follow-up por inatividade.
 */
/**
 * Carrega dados de followUp, cliente e regras para fluxo de inatividade.
 */
export async function loadFollowUpContext(
  followUpId: string,
  workspaceId: string
): Promise<FollowUpContext> {
  const followUp = await prisma.followUp.findUniqueOrThrow({
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
  if (followUp.workspace_id !== workspaceId) {
    throw new Error(`FollowUp ${followUpId} não pertence ao workspace ${workspaceId}`);
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
}

/**
 * Obtém ou cria o cliente e conversa para um número no canal WhatsApp.
 * Retorna o cliente, a conversa e flag se foi criada agora.
 */
export async function getOrCreateConversation(
  workspaceId: string,
  phoneNumber: string,
  clientName?: string | null
): Promise<{ client: Client; conversation: Conversation; wasCreated: boolean }> {
  // 1) Cliente
  let client = await prisma.client.findFirst({
    where: { workspace_id: workspaceId, phone_number: phoneNumber }
  });
  let clientCreated = false;
  if (!client) {
    client = await prisma.client.create({
      data: { 
        workspace_id: workspaceId, 
        phone_number: phoneNumber, 
        name: clientName ?? null,
        metadata: {} 
      }
    });
    clientCreated = true;
  } else if (!client.name && clientName) {
    // Cliente existe, mas sem nome -> Atualiza com o nome recebido
    client = await prisma.client.update({
      where: { id: client.id },
      data: { name: clientName }
    });
  }

  // 2) Conversa
  let conversation: Conversation;
  let wasCreated = false;
  try {
    conversation = await prisma.conversation.create({
      data: {
        workspace_id: workspaceId,
        client_id: client.id,
        channel: 'WHATSAPP',
        status: ConversationStatus.ACTIVE,
        is_ai_active: true,
        last_message_at: new Date()
      }
    });
    wasCreated = true;
  } catch (e: any) {
    // Se já existir pela chave única workspace_id+client_id+channel, atualiza
    if (e.code === 'P2002') {
      conversation = await prisma.conversation.update({
        where: {
          workspace_id_client_id_channel: {
            workspace_id: workspaceId,
            client_id: client.id,
            channel: 'WHATSAPP'
          }
        },
        data: {
          last_message_at: new Date(),
          status: ConversationStatus.ACTIVE
        }
      });
    } else {
      throw e;
    }
  }
  return { client, conversation, wasCreated };
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
};
type PendingMessageType = Prisma.MessageGetPayload<{ select: typeof pendingMessageSelect }>;

interface SendOperatorMessageResult {
    success: boolean;
    message?: PendingMessageType; // Retorna a mensagem criada
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
    const prefixedContent = `*${senderDisplayName}*\n ${content}`; // Prefixo aqui no serviço
    let pendingMessage: PendingMessageType | null = null;

    try {
        // 1. Buscar Conversa + Client + Workspace (com credenciais)
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                id: true, channel: true, client_id: true, workspace_id: true,
                client: { select: { phone_number: true } },
                workspace: { select: { id: true, whatsappPhoneNumberId: true, whatsappAccessToken: true } }
            }
        });

        if (!conversation || !conversation.client || !conversation.workspace) {
             console.error(`[Svc SendOperatorMsg] Conversation, client, or workspace not found for conv ${conversationId}`);
            return { success: false, error: 'Dados da conversa, cliente ou workspace não encontrados.', statusCode: 404 };
        }

        const { channel, client, workspace } = conversation;

        // 2. Criar Mensagem PENDING
        pendingMessage = await prisma.message.create({
            data: {
                conversation_id: conversationId,
                sender_type: MessageSenderType.AGENT, // Usar AGENT
                content: prefixedContent,
                timestamp: new Date(),
                status: 'PENDING',
                metadata: { manual_sender_id: operatorId },
            },
            select: pendingMessageSelect
        });
        console.log(`[Svc SendOperatorMsg] Saved PENDING message ${pendingMessage.id} for conv ${conversationId}`);


        const { whatsappPhoneNumberId, whatsappAccessToken } = workspace;
        const clientPhoneNumber = client.phone_number;

        if (!whatsappPhoneNumberId || !whatsappAccessToken || !clientPhoneNumber) {
             console.error(`[Svc SendOperatorMsg] WhatsApp config incomplete for workspace ${workspace.id}`);
            throw new Error('Configuração do WhatsApp incompleta.'); // Erro será pego abaixo
        }

        const decryptedToken = decrypt(whatsappAccessToken);
         if (!decryptedToken) throw new Error("Token de acesso descriptografado está vazio.");

        const sendResult = await sendWhatsappMessage(
            whatsappPhoneNumberId,
            clientPhoneNumber,
            decryptedToken,
            content, // Enviar conteúdo original, sem prefixo manual
            senderDisplayName // Passar nome do operador para o sender (se ele usar)
        );

        if (!sendResult.success) {
            console.error(`[Svc SendOperatorMsg] WhatsApp send failed:`, sendResult.error);
            throw new Error(`Falha ao enviar via WhatsApp: ${JSON.stringify(sendResult.error)}`); // Erro será pego abaixo
        }
        console.log(`[Svc SendOperatorMsg] WhatsApp send initiated successfully (Wamid: ${sendResult.wamid}) for msg ${pendingMessage.id}`);

        // Atualizar a mensagem no banco com o WAMID recebido E status SENT
        if (sendResult.wamid) {
             try {
                  // Atualizar status para SENT e guardar o WAMID no channel_message_id
                  pendingMessage = await prisma.message.update({
                      where: { id: pendingMessage.id },
                      data: { 
                          status: 'SENT', // <<< SET STATUS TO SENT
                          channel_message_id: sendResult.wamid // <<< USE channel_message_id
                      }, 
                      select: pendingMessageSelect // Re-selecionar para obter o objeto atualizado
                  });
                  console.log(`[Svc SendOperatorMsg] Updated message ${pendingMessage.id} to SENT with channel_message_id: ${sendResult.wamid}`);
             } catch (updateError) {
                  // Logar erro, mas não falhar a operação principal, pois o envio foi iniciado.
                  // O webhook de status pode eventualmente corrigir isso se a mensagem for encontrada de outra forma.
                  console.error(`[Svc SendOperatorMsg] Failed to update status/channel_message_id for message ${pendingMessage.id}:`, updateError);
             }
        } else {
            console.warn(`[Svc SendOperatorMsg] WhatsApp send succeeded for msg ${pendingMessage.id}, but no WAMID was returned.`);
        }

        // 4. Sucesso (Envio iniciado ou processado internamente)
         return { success: true, message: pendingMessage }; // Retornar a mensagem (potencialmente atualizada)

    } catch (error: any) {
        console.error(`[Svc SendOperatorMsg] Error sending message for conv ${conversationId}:`, error);
        // 5. Atualizar para FAILED em caso de erro
        if (pendingMessage) {
             try {
                  const existingMetadata = (typeof pendingMessage.metadata === 'object' && pendingMessage.metadata !== null) ? pendingMessage.metadata : {};
                 await prisma.message.update({
                     where: { id: pendingMessage.id },
                     data: { status: 'FAILED', errorMessage: error.message, metadata: { ...existingMetadata, error: error.message } }
                 });
                 console.log(`[Svc SendOperatorMsg] Updated message ${pendingMessage.id} to FAILED.`);
             } catch (updateError) {
                  console.error(`[Svc SendOperatorMsg] CRITICAL: Failed to update message ${pendingMessage.id} to FAILED after send error:`, updateError);
             }
        }
        return { success: false, error: error.message || 'Erro interno ao enviar mensagem.', statusCode: 500 };
    }
}