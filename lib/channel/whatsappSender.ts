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

// Interface para os parâmetros de envio de mídia
interface SendMediaParams {
  phoneNumberId: string;
  toPhoneNumber: string;
  accessToken: string;
  mediaUrl: string;
  mimeType: string;
  filename?: string; // Opcional, útil para documentos
  caption?: string;  // Opcional, para adicionar legenda a imagens/vídeos
}

// Mapeamento de tipos MIME para tipos da API do WhatsApp e nomes de campo
const mimeToWhatsAppType: Record<string, { type: 'image' | 'document' | 'audio' | 'video'; fieldName: string }> = {
  // Imagens
  'image/jpeg': { type: 'image', fieldName: 'image' },
  'image/png': { type: 'image', fieldName: 'image' },
  'image/webp': { type: 'image', fieldName: 'image' },
  // Documentos
  'application/pdf': { type: 'document', fieldName: 'document' },
  'application/vnd.ms-powerpoint': { type: 'document', fieldName: 'document' },
  'application/msword': { type: 'document', fieldName: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { type: 'document', fieldName: 'document' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { type: 'document', fieldName: 'document' },
  'application/vnd.ms-excel': { type: 'document', fieldName: 'document' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { type: 'document', fieldName: 'document' },
  'text/plain': { type: 'document', fieldName: 'document' },
  // Áudio
  'audio/aac': { type: 'audio', fieldName: 'audio' },
  'audio/mp4': { type: 'audio', fieldName: 'audio' },
  'audio/mpeg': { type: 'audio', fieldName: 'audio' },
  'audio/amr': { type: 'audio', fieldName: 'audio' },
  'audio/ogg': { type: 'audio', fieldName: 'audio' }, // Note: ogg requires codecs=opus for WhatsApp
  // Vídeo
  'video/mp4': { type: 'video', fieldName: 'video' },
  'video/3gpp': { type: 'video', fieldName: 'video' },
};

/**
 * Envia uma mensagem de mídia (imagem, documento, áudio, vídeo) via WhatsApp Cloud API.
 * A URL da mídia deve ser publicamente acessível.
 * @param params - Parâmetros contendo IDs, tokens, URL da mídia e tipo MIME.
 * @returns Um objeto indicando sucesso ou falha no envio.
 */
export async function sendWhatsappMediaMessage({
  phoneNumberId,
  toPhoneNumber,
  accessToken,
  mediaUrl,
  mimeType,
  filename,
  caption // Adicionado caption
}: SendMediaParams): Promise<SendResult> {
  const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const mapping = mimeToWhatsAppType[mimeType.toLowerCase()];

  if (!mapping) {
    console.error(`[WhatsappSender] Tipo MIME não suportado para envio de mídia: ${mimeType}`);
    return { success: false, error: { message: `Unsupported MIME type: ${mimeType}` } };
  }

  const { type, fieldName } = mapping;

  const requestBody: any = {
    messaging_product: 'whatsapp',
    to: toPhoneNumber,
    type: type,
    [fieldName]: {
      link: mediaUrl,
      // Adiciona filename se for documento e estiver disponível
      ...(type === 'document' && filename && { filename: filename }),
      // Adiciona caption se for imagem ou vídeo e estiver disponível
      ...( (type === 'image' || type === 'video') && caption && { caption: caption } )
    },
  };

   console.log(`[WhatsappSender] Enviando mídia (${type}, ${mimeType}) para ${toPhoneNumber} via ${phoneNumberId}. URL: ${mediaUrl}`);
   if (caption) {
       console.log(`  Caption: "${caption.substring(0,50)}..."`);
   }
   if (filename) {
        console.log(`  Filename: ${filename}`);
   }

  try {
    const response = await axios.post<WhatsAppResponse>(apiUrl, requestBody, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000, // Timeout maior para envio de mídia
    });

    const successData = response.data;
    const sentMessageId = successData.messages?.[0]?.id;

    if (!sentMessageId) {
      console.warn(`[WhatsappSender] Mídia enviada para ${toPhoneNumber}, mas ID da mensagem não encontrado na resposta Axios.`);
      return { success: true, messageId: undefined };
    }

    console.log(`[WhatsappSender] Mídia enviada com sucesso para ${toPhoneNumber} via Axios. Message ID: ${sentMessageId}`);
    return { success: true, messageId: sentMessageId };

  } catch (error: any) {
    console.error(`[WhatsappSender] Erro ao enviar mídia para ${toPhoneNumber} via Axios:`);

    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<WhatsAppErrorResponse>;
        const apiErrorData = axiosError.response?.data?.error;

        if (apiErrorData) {
            console.error(`  Status: ${axiosError.response?.status}`);
            console.error(`  API Error: ${apiErrorData.message} (Code: ${apiErrorData.code}, Type: ${apiErrorData.type}, Subcode: ${apiErrorData.error_subcode || 'N/A'})`);
            console.error(`  Trace ID: ${apiErrorData.fbtrace_id}`);
            return { success: false, error: apiErrorData };
        } else if (axiosError.request) {
            console.error('  Erro: Nenhuma resposta recebida da API (problema de rede ou timeout).');
            return { success: false, error: { message: 'Network Error or Timeout sending media' } };
        } else {
            console.error('  Erro na configuração da requisição Axios:', axiosError.message);
            return { success: false, error: { message: `Axios setup error sending media: ${axiosError.message}` } };
        }
    } else {
        console.error('  Erro inesperado:', error.message);
        return { success: false, error: { message: error.message || 'Unknown error occurred sending media' } };
    }
  }
}