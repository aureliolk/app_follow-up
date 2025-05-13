/**
 * Envia mensagem via WhatsApp Cloud API.
 */
import { sendWhatsappMessage as whatsappApiSend } from '@/lib/channel/whatsappSender';
import { decrypt } from '@/lib/encryption';

/**
 * Envia mensagem via WhatsApp Cloud API.
 * Descriptografa o token antes de enviar.
 */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  recipientPhone: string,
  encryptedAccessToken: string,
  content: string,
  senderName?: string
): Promise<{ success: boolean; wamid?: string; error?: any }> {
  // Descriptografar token
  const token = decrypt(encryptedAccessToken);
  if (!token) {
    return { success: false, error: 'Token de acesso descriptografado está vazio.' };
  }
  // Enviar via módulo existente
  const result = await whatsappApiSend(
    phoneNumberId,
    recipientPhone,
    token,
    content,
    senderName
  );
  return result;
}

/**
 * Envia mensagem via Evolution API.
 */
import axios from 'axios';
import { standardizeAndFormatE164 } from '@/lib/phoneUtils';

interface EvolutionSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEvolutionMessage({
  endpoint,
  apiKey,
  instanceName,
  toPhoneNumber,
  messageContent,
  senderName
}: {
  endpoint: string;
  apiKey: string;
  instanceName: string;
  toPhoneNumber: string;
  messageContent: string;
  senderName: string;
}): Promise<EvolutionSendResult> {
  console.log(`[sendEvolutionMessage] Preparando para enviar para ${toPhoneNumber} via Instância ${instanceName}`);
  
  const formattedNumber = standardizeAndFormatE164(toPhoneNumber, true);
  if (!formattedNumber) {
    console.error(`[sendEvolutionMessage] Número inválido ou não formatável: ${toPhoneNumber}`);
    return { success: false, error: `Número de telefone inválido: ${toPhoneNumber}` };
  }

  const url = `${endpoint.replace(/\/$/, '')}/message/sendText/${instanceName}`;
  const payload = {
    number: formattedNumber,
    options: {
      delay: 1200,
      presence: "composing",
    },
    text: `*${senderName}*\n ${messageContent}`
  };

  try {
    console.log(`[sendEvolutionMessage] Enviando POST para: ${url}`);
    const response = await axios.post(url, payload, {
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
       timeout: 15000,
    });

    console.log(`[sendEvolutionMessage] Resposta da API Evolution recebida (Status: ${response.status})`);
    if (response.status === 201 || response.status === 200) {
       const responseData = response.data;
       const messageId = responseData?.key?.id || responseData?.id || responseData?.message?.id || null;
       if (messageId) {
           console.log(`[sendEvolutionMessage] Mensagem enviada com sucesso. ID retornado: ${messageId}`);
           return { success: true, messageId: messageId };
       } else {
           console.warn(`[sendEvolutionMessage] Sucesso no envio (Status ${response.status}), mas ID da mensagem não encontrado na resposta:`, responseData);
           return { success: true, messageId: 'unknown_id_success' };
       }
    } else {
      console.error(`[sendEvolutionMessage] Erro no envio. Status: ${response.status}. Resposta:`, response.data);
      return { success: false, error: `Erro da API Evolution: Status ${response.status} - ${JSON.stringify(response.data)}` };
    }
  } catch (error: any) {
    console.error('[sendEvolutionMessage] Erro durante a chamada Axios para Evolution API:', error);
    let errorMessage = 'Erro desconhecido ao conectar na Evolution API.';
    if (axios.isAxiosError(error)) {
      errorMessage = `Erro Axios: ${error.message}.`;
      if (error.response) {
        errorMessage += ` Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return { success: false, error: errorMessage };
  }
}