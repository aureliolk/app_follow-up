// lib/channel/whatsappSender.ts
import axios, { AxiosError } from 'axios'; // Importar Axios

const WHATSAPP_API_VERSION = 'v19.0'; // Ou a versão que você estiver usando

interface WhatsAppResponse {
  messaging_product: string;
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

interface WhatsAppApiErrorData {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
    error_data?: any;
}

interface WhatsAppErrorResponse {
    error: WhatsAppApiErrorData;
}


interface SendResult {
  success: boolean;
  messageId?: string;
  error?: WhatsAppApiErrorData | { message: string }; // Tipo de erro mais específico
}

/**
 * Envia uma mensagem de texto simples via WhatsApp Cloud API usando Axios.
 * @param phoneNumberId - O ID do número de telefone da Meta que está enviando a mensagem.
 * @param toPhoneNumber - O número de telefone do destinatário (formato internacional, ex: 5511999998888).
 * @param accessToken - O token de acesso da API do WhatsApp Cloud (descriptografado).
 * @param messageText - O conteúdo da mensagem a ser enviada.
 * @returns Um objeto indicando sucesso ou falha no envio.
 */
export async function sendWhatsappMessage(
  phoneNumberId: string,
  toPhoneNumber: string,
  accessToken: string,
  messageText: string
): Promise<SendResult> {
  const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const requestBody = {
    messaging_product: 'whatsapp',
    to: toPhoneNumber,
    type: 'text',
    text: {
      preview_url: false, // Pode ajustar se quiser preview de links
      body: messageText,
    },
  };

  console.log(`[WhatsappSender] Enviando para ${toPhoneNumber} via ${phoneNumberId} (Axios): "${messageText.substring(0, 50)}..."`);

  try {
    const response = await axios.post<WhatsAppResponse>(apiUrl, requestBody, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
       // Definir um timeout razoável (ex: 10 segundos)
      timeout: 10000,
    });

    const successData = response.data;
    const sentMessageId = successData.messages?.[0]?.id;

    if (!sentMessageId) {
        console.warn(`[WhatsappSender] Mensagem enviada para ${toPhoneNumber}, mas ID da mensagem não encontrado na resposta Axios.`);
        // Considerar sucesso mesmo sem ID
        return { success: true, messageId: undefined };
    }

    console.log(`[WhatsappSender] Mensagem enviada com sucesso para ${toPhoneNumber} via Axios. Message ID: ${sentMessageId}`);
    return { success: true, messageId: sentMessageId };

  } catch (error: any) {
    console.error(`[WhatsappSender] Erro ao enviar mensagem para ${toPhoneNumber} via Axios:`);

    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<WhatsAppErrorResponse>;
        const apiErrorData = axiosError.response?.data?.error; // Erro específico da API do WhatsApp

        if (apiErrorData) {
            // Erro retornado pela API do WhatsApp
            console.error(`  Status: ${axiosError.response?.status}`);
            console.error(`  API Error: ${apiErrorData.message} (Code: ${apiErrorData.code}, Type: ${apiErrorData.type}, Subcode: ${apiErrorData.error_subcode || 'N/A'})`);
            console.error(`  Trace ID: ${apiErrorData.fbtrace_id}`);
            return { success: false, error: apiErrorData };
        } else if (axiosError.request) {
            // A requisição foi feita, mas não houve resposta (erro de rede/timeout)
            console.error('  Erro: Nenhuma resposta recebida da API (problema de rede ou timeout).');
            return { success: false, error: { message: 'Network Error or Timeout' } };
        } else {
            // Erro na configuração da requisição Axios
            console.error('  Erro na configuração da requisição Axios:', axiosError.message);
            return { success: false, error: { message: `Axios setup error: ${axiosError.message}` } };
        }
    } else {
        // Erro inesperado não relacionado ao Axios
        console.error('  Erro inesperado:', error.message);
        return { success: false, error: { message: error.message || 'Unknown error occurred' } };
    }
  }
}