// lib/channel/whatsappSender.ts
import axios, { AxiosError } from 'axios'; // Importar Axios
import FormData from 'form-data'; // <<< Adicionar import para FormData
import { Readable } from 'stream'; // <<< Adicionar import para Stream

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

// <<< INÍCIO NOVA FUNÇÃO >>>
interface UploadMediaResult {
    success: boolean;
    mediaId?: string;
    error?: WhatsAppApiErrorData | { message: string };
}

/**
 * Faz upload de um arquivo de mídia para a API do WhatsApp Cloud.
 * @param fileBuffer Buffer do arquivo a ser enviado.
 * @param filename Nome do arquivo (usado no FormData).
 * @param mimeType Tipo MIME do arquivo (ex: 'audio/webm', 'image/png').
 * @param phoneNumberId ID do número de telefone da Meta que está enviando.
 * @param accessToken Token de acesso da API (descriptografado).
 * @returns Objeto indicando sucesso e o ID da mídia ou erro.
 */
export async function uploadWhatsappMedia(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    phoneNumberId: string,
    accessToken: string
): Promise<UploadMediaResult> {
    const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/media`;
    const formData = new FormData();

    formData.append('messaging_product', 'whatsapp');
    formData.append('file', fileBuffer, {
        filename: filename,
        contentType: mimeType,
    });
    // O parâmetro 'type' (mimeType) não é mais enviado aqui, o WhatsApp infere do contentType.

    console.log(`[WhatsappSender] Uploading media (${mimeType}, ${filename}, size: ${fileBuffer.length} bytes) to Meta API for number ${phoneNumberId}`);

    try {
        const response = await axios.post<{ id: string }>(apiUrl, formData, {
            headers: {
                ...formData.getHeaders(), // Inclui Content-Type: multipart/form-data; boundary=...
                'Authorization': `Bearer ${accessToken}`,
            },
            maxContentLength: Infinity, // Necessário para arquivos maiores
            maxBodyLength: Infinity,    // Necessário para arquivos maiores
            timeout: 60000, // Timeout maior para upload (60 segundos)
        });

        const mediaId = response.data?.id;

        if (!mediaId) {
            console.error(`[WhatsappSender] Media upload for ${filename} succeeded but no media ID returned.`);
            return { success: false, error: { message: 'Media upload succeeded but no media ID returned.' } };
        }

        console.log(`[WhatsappSender] Media ${filename} uploaded successfully. Media ID: ${mediaId}`);
        return { success: true, mediaId: mediaId };

    } catch (error: any) {
        console.error(`[WhatsappSender] Error uploading media ${filename} (${mimeType}) for number ${phoneNumberId}:`);
        // Reutilizar a lógica de tratamento de erro do Axios
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<WhatsAppErrorResponse>;
            const apiErrorData = axiosError.response?.data?.error;
            if (apiErrorData) {
                console.error(`  Status: ${axiosError.response?.status}`);
                console.error(`  API Upload Error: ${apiErrorData.message} (Code: ${apiErrorData.code}, Type: ${apiErrorData.type}, Subcode: ${apiErrorData.error_subcode || 'N/A'})`);
                console.error(`  Trace ID: ${apiErrorData.fbtrace_id}`);
                return { success: false, error: apiErrorData };
            } else if (axiosError.request) {
                console.error('  Upload Error: No response received from API (network/timeout).');
                return { success: false, error: { message: 'Network Error or Timeout during media upload' } };
            } else {
                console.error('  Upload Error: Axios setup error:', axiosError.message);
                return { success: false, error: { message: `Axios setup error during media upload: ${axiosError.message}` } };
            }
        } else {
            console.error('  Upload Error: Unexpected error:', error.message);
            return { success: false, error: { message: error.message || 'Unknown error occurred during media upload' } };
        }
    }
}
// <<< FIM NOVA FUNÇÃO >>>

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
  messageText: string,
  displayName?: string
): Promise<SendResult> {
  const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const requestBody = {
    messaging_product: 'whatsapp',
    to: toPhoneNumber,
    type: 'text',
    text: {
      preview_url: false, // Pode ajustar se quiser preview de links
      body: `*${displayName}*\n ${messageText}`,
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
// <<< REMOVER INTERFACE ANTIGA >>>
// interface SendMediaParams {
//   phoneNumberId: string;
//   toPhoneNumber: string;
//   accessToken: string;
//   mediaUrl: string;
//   mimeType: string;
//   filename?: string; // Opcional, útil para documentos
//   caption?: string;  // Opcional, para adicionar legenda a imagens/vídeos
// }

// <<< NOVAS INTERFACES PARA PARÂMETROS >>>
interface SendMediaParamsBase {
  phoneNumberId: string;
  toPhoneNumber: string;
  accessToken: string;
  caption?: string; // Legenda comum
}

// Para envio usando ID de mídia pré-uploadado
interface SendMediaByIdParams extends SendMediaParamsBase {
  mediaId: string;
  messageType: 'image' | 'audio' | 'video' | 'document'; // Tipo DEVE ser fornecido pelo chamador
}

// Para envio usando URL pública (principalmente imagens/docs)
interface SendMediaByUrlParams extends SendMediaParamsBase {
  mediaUrl: string;
  mimeType: string; // Necessário para determinar o tipo E para documentos/links
  filename?: string; // Opcional, mas necessário para documentos
}

// Type Guard para diferenciar os parâmetros em tempo de execução
function isSendMediaByIdParams(params: any): params is SendMediaByIdParams {
  return typeof params.mediaId === 'string' && typeof params.messageType === 'string';
}

// --- Mapeamento mimeToWhatsAppType ainda pode ser útil para URL ---
// (O mapeamento mimeToWhatsAppType permanece o mesmo)
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
 * Envia uma mensagem de mídia (imagem, documento, áudio, vídeo) via WhatsApp Cloud API,
 * usando um ID de mídia pré-uploadado OU uma URL pública.
 * @param params - Parâmetros contendo IDs, tokens e detalhes da mídia (mediaId OU mediaUrl/mimeType).
 * @returns Um objeto indicando sucesso ou falha no envio.
 */
 // <<< MODIFICAR ASSINATURA E CORPO DA FUNÇÃO >>>
export async function sendWhatsappMediaMessage(
  params: SendMediaByIdParams | SendMediaByUrlParams // Aceita um dos dois tipos
): Promise<SendResult> {
  const { phoneNumberId, toPhoneNumber, accessToken, caption } = params;
  const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  let requestBody: any;
  let logType: string; // Para logging

  // Verifica qual tipo de parâmetro foi passado usando o type guard
  if (isSendMediaByIdParams(params)) {
    // --- Envio por Media ID ---
    const { mediaId, messageType } = params;
    logType = `Media ID (${messageType})`;

    // Validação básica
    if (!['image', 'audio', 'video', 'document'].includes(messageType)) {
        console.error(`[WhatsappSender] Invalid messageType provided for sending by ID: ${messageType}`);
        return { success: false, error: { message: `Invalid messageType for sending by ID: ${messageType}` } };
    }

    requestBody = {
      messaging_product: 'whatsapp',
      to: toPhoneNumber,
      type: messageType,
      [messageType]: { // Usa o tipo como nome do campo (ex: 'image': { id: ... })
        id: mediaId,
        // Adiciona caption APENAS se for imagem ou vídeo
        ...( (messageType === 'image' || messageType === 'video') && caption && { caption: caption } )
        // Filename não é usado ao enviar por ID
      },
    };
    console.log(`[WhatsappSender] Enviando ${logType} para ${toPhoneNumber}. ID: ${mediaId}`);

  } else {
    // --- Envio por URL ---
    const { mediaUrl, mimeType, filename } = params;
    logType = `Media URL (${mimeType})`;

    const mapping = mimeToWhatsAppType[mimeType.toLowerCase()];
    if (!mapping) {
      console.error(`[WhatsappSender] Tipo MIME não suportado para envio de mídia por URL: ${mimeType}`);
      return { success: false, error: { message: `Unsupported MIME type for sending by URL: ${mimeType}` } };
    }
    const { type, fieldName } = mapping; // fieldName é geralmente igual a type

    requestBody = {
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
     console.log(`[WhatsappSender] Enviando ${logType} para ${toPhoneNumber}. URL: ${mediaUrl}`);
     if (filename) console.log(`  Filename: ${filename}`);
  }

  // Log da legenda, se houver (comum a ambos os métodos)
  if (caption) {
     console.log(`  Caption: "${caption.substring(0,50)}..."`);
  }

  // --- Lógica de Envio (comum a ambos os métodos) ---
  try {
    const response = await axios.post<WhatsAppResponse>(apiUrl, requestBody, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000, // Timeout razoável para envio de mídia
    });

    const successData = response.data;
    const sentMessageId = successData.messages?.[0]?.id;

    if (!sentMessageId) {
      console.warn(`[WhatsappSender] Mídia (${logType}) enviada para ${toPhoneNumber}, mas ID da mensagem não encontrado na resposta.`);
      return { success: true, messageId: undefined };
    }

    console.log(`[WhatsappSender] Mídia (${logType}) enviada com sucesso para ${toPhoneNumber}. Message ID: ${sentMessageId}`);
    return { success: true, messageId: sentMessageId };

  } catch (error: any) {
     // Reutiliza a lógica de tratamento de erro do Axios, ajustando a mensagem
     console.error(`[WhatsappSender] Erro ao enviar ${logType} para ${toPhoneNumber}:`);
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
             return { success: false, error: { message: `Network Error or Timeout sending ${logType}` } };
         } else {
             console.error('  Erro na configuração da requisição Axios:', axiosError.message);
             return { success: false, error: { message: `Axios setup error sending ${logType}: ${axiosError.message}` } };
         }
     } else {
         console.error('  Erro inesperado:', error.message);
         return { success: false, error: { message: error.message || `Unknown error occurred sending ${logType}` } };
     }
  }
}