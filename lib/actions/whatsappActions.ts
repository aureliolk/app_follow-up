'use server';

import { prisma } from '@/lib/db';
// O tipo WhatsappTemplate não é diretamente usado aqui, mas sim os parâmetros do template
// import type { WhatsappTemplate } from '@/lib/types/whatsapp';
import { sendWhatsappTemplateMessage } from '@/lib/channel/whatsappSender';
import { decrypt } from '@/lib/encryption'; // Assumindo que as credenciais estão criptografadas
import { publishConversationUpdate } from '@/lib/services/notifierService';
import type { Message } from '@/app/types';

interface SendTemplateArgs {
  conversationId: string;
  workspaceId: string;
  clientId: string;
  templateName: string;
  templateLanguage: string;
  variables: Record<string, string>;
  templateBody: string;
  // triggeredByUserId?: string;
}



/**
 * Server Action para enviar uma mensagem de template do WhatsApp.
 * Busca credenciais do Workspace, chama a função de envio, renderiza o template
 * e cria a mensagem no DB com o conteúdo renderizado.
 */
export async function sendWhatsappTemplateAction(
  args: SendTemplateArgs
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log('[Server Action] sendWhatsappTemplateAction invoked with args:', args);

  let decryptedAccessToken: string;
  let phoneNumberId: string;
  let createdMessage = null;

  try {
    // 1. Buscar Workspace e Credenciais do WhatsApp
    const workspace = await prisma.workspace.findUnique({
      where: {
        id: args.workspaceId,
      },
      select: {
        whatsappPhoneNumberId: true,
        whatsappAccessToken: true, // Assumindo que este campo contém o token criptografado
        active_whatsapp_integration_type: true,
      }
    });

    if (!workspace) {
      throw new Error('Workspace não encontrado.');
    }
    if (workspace.active_whatsapp_integration_type !== 'WHATSAPP_CLOUD_API') {
      throw new Error('A integração ativa para este workspace não é a WhatsApp Cloud API.');
    }
    if (!workspace.whatsappPhoneNumberId) {
      throw new Error('ID do número de telefone do WhatsApp não configurado no workspace.');
    }
    if (!workspace.whatsappAccessToken) {
       throw new Error('Token de Acesso do WhatsApp não configurado no workspace.');
    }

    phoneNumberId = workspace.whatsappPhoneNumberId;

    // 2. Descriptografar Access Token
    try {
      // Assumindo que o campo whatsappAccessToken contém o valor criptografado
      decryptedAccessToken = decrypt(workspace.whatsappAccessToken);
      if (!decryptedAccessToken) {
        throw new Error('Token de acesso descriptografado está vazio.');
      }
    } catch (error) {
      console.error('[Server Action] Erro ao descriptografar Access Token do Workspace:', error);
      throw new Error('Falha ao processar o Access Token do WhatsApp.');
    }

    // 3. Buscar Número do Cliente
    const client = await prisma.client.findUnique({
      where: { id: args.clientId },
      select: { phone_number: true },
    });

    if (!client || !client.phone_number) {
      throw new Error('Número de telefone do cliente não encontrado.');
    }
    // TODO: Considerar usar lib/phoneUtils.ts para validar/formatar client.phone_number se necessário
    const recipientPhoneNumber = client.phone_number;

    // 4. Chamar a função de envio de template
    const sendResult = await sendWhatsappTemplateMessage({
      phoneNumberId: phoneNumberId,
      toPhoneNumber: recipientPhoneNumber,
      accessToken: decryptedAccessToken,
      templateName: args.templateName,
      templateLanguage: args.templateLanguage,
      variables: args.variables,
    });

    // 5. Renderizar o conteúdo do template
    let renderedContent = args.templateBody;
    try {
        // Substitui {{1}}, {{2}}, etc. pelos valores correspondentes
        // Ordena as chaves numericamente para garantir a substituição correta
        Object.entries(args.variables)
          .sort(([keyA], [keyB]) => parseInt(keyA) - parseInt(keyB))
          .forEach(([key, value]) => {
            const placeholder = `{{\s*${key}\s*}}`; // Regex para {{key}} com espaços opcionais
            renderedContent = renderedContent.replace(new RegExp(placeholder, 'g'), value || '' /* Evita 'undefined' */);
          });
    } catch (renderError) {
        console.error("[Server Action] Erro ao renderizar variáveis no corpo do template:", renderError);
        // Continua com o corpo original ou lança erro? Por enquanto, usa o corpo não renderizado.
        renderedContent = `(Erro ao renderizar template ${args.templateName}) ${args.templateBody}`;
    }

    // 6. Tratar o resultado e criar a mensagem no DB
    const messageStatus = sendResult.success ? (sendResult.wamid ? 'SENT' : 'PENDING') : 'FAILED';
    const wamid = sendResult.wamid;

    try {
      createdMessage = await prisma.message.create({
        data: {
          conversation_id: args.conversationId,
          sender_type: 'AGENT', // Ou 'SYSTEM'
          content: renderedContent, // <<< Usar conteúdo renderizado
          status: messageStatus,
          timestamp: new Date(),
          channel_message_id: wamid,
          media_url: null,
          media_mime_type: null,
        },
      });
       console.log(`[Server Action] Mensagem (Template ${args.templateName} - Renderizada) registrada no DB com ID ${createdMessage.id} e status ${messageStatus}. WAMID: ${wamid}`);

       if (createdMessage) {
         const redisChannel = `chat-updates:${args.conversationId}`;
         const payload = {
           type: 'new_message',
           payload: createdMessage
         };
         await publishConversationUpdate(redisChannel, payload);
         console.log(`[Server Action] Published 'new_message' to Redis channel ${redisChannel}`);
       }

    } catch (dbError) {
        console.error('[Server Action] Erro ao registrar mensagem no DB ou publicar no Redis:', dbError);
    }

    if (!sendResult.success) {
      // Se o envio falhou, jogue o erro para ser pego pelo catch externo
      const errorMessage = sendResult.error instanceof Object && 'message' in sendResult.error
                         ? sendResult.error.message
                         : 'Erro desconhecido na API do WhatsApp';
      throw new Error(`Falha no envio via WhatsApp: ${errorMessage}`);
    }

    return { success: true, messageId: wamid }; // Retorna sucesso e o WAMID se disponível

  } catch (error: any) {
    console.error('[Server Action] Error in sendWhatsappTemplateAction:', error);
    return { success: false, error: error.message || 'Erro desconhecido ao enviar template via Server Action.' };
  }
} 