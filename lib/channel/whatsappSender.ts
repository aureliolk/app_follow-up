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

export interface WhatsAppApiErrorData {
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


export interface SendResult {
  success: boolean;
  wamid?: string; // Add wamid (WhatsApp message ID)
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
  displayName: string
): Promise<SendResult> {
  const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const requestBody = {
    messaging_product: 'whatsapp',
    to: toPhoneNumber,
    type: 'text',
    text: {
      preview_url: true, // Pode ajustar se quiser preview de links
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
    const sentWamid = successData.messages?.[0]?.id;

    if (!sentWamid) {
        console.warn(`[WhatsappSender] Mensagem enviada para ${toPhoneNumber}, mas WAMID não encontrado na resposta Axios.`);
        // Considerar sucesso mesmo sem WAMID? Ou retornar erro?
        // Vamos retornar sucesso sem WAMID por enquanto.
        return { success: true, wamid: undefined }; // <<< Usar wamid
    }

    console.log(`[WhatsappSender] Mensagem enviada com sucesso para ${toPhoneNumber} via Axios. WAMID: ${sentWamid}`);
    return { success: true, wamid: sentWamid }; // <<< Usar wamid

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
  const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${params.phoneNumberId}/messages`;
  let messagePayload: any;
  let logIdentifier: string; // Para logs

  if (isSendMediaByIdParams(params)) {
    // Envio por ID
    logIdentifier = `Media ID ${params.mediaId}`;
    messagePayload = {
      messaging_product: 'whatsapp',
      to: params.toPhoneNumber,
      type: params.messageType,
      [params.messageType]: { // Nome do campo varia com o tipo (image, audio, video, document)
        id: params.mediaId,
        ...(params.caption && { caption: params.caption }),
        // Filename não é necessário ou usado ao enviar por ID de mídia
        // ...(params.messageType === 'document' && params.filename && { filename: params.filename }), // <<< LINHA REMOVIDA
      }
    };
  } else {
    // Envio por URL
    logIdentifier = `Media URL ${params.mediaUrl.substring(0, 50)}...`;
    const typeInfo = mimeToWhatsAppType[params.mimeType];
    if (!typeInfo) {
        console.error(`[WhatsappSender] Tipo MIME não suportado para envio via URL: ${params.mimeType}`);
        return { success: false, error: { message: `Unsupported MIME type for URL sending: ${params.mimeType}` } };
    }

    messagePayload = {
        messaging_product: 'whatsapp',
        to: params.toPhoneNumber,
        type: typeInfo.type,
        [typeInfo.fieldName]: { // Campo correto (image, document, etc.)
          link: params.mediaUrl,
          ...(params.caption && { caption: params.caption }),
          // Filename é crucial para documentos e útil para outros tipos
          ...(typeInfo.type === 'document' && params.filename && { filename: params.filename }),
        }
      };
  }

  console.log(`[WhatsappSender] Sending media message (${logIdentifier}) to ${params.toPhoneNumber} via ${params.phoneNumberId} (Axios)`);

  try {
    const response = await axios.post<WhatsAppResponse>(apiUrl, messagePayload, {
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000, // Timeout um pouco maior para envio de mídia por URL
    });

    const sentWamid = response.data.messages?.[0]?.id;
    if (!sentWamid) {
      console.warn(`[WhatsappSender] Media message sent to ${params.toPhoneNumber}, but WAMID not found.`);
      return { success: true, wamid: undefined };
    }

    console.log(`[WhatsappSender] Media message sent successfully to ${params.toPhoneNumber}. WAMID: ${sentWamid}`);
    return { success: true, wamid: sentWamid };

  } catch (error: any) {
    // Reutilizar a mesma lógica de tratamento de erro Axios
    console.error(`[WhatsappSender] Error sending media message (${logIdentifier}) to ${params.toPhoneNumber} via Axios:`);
     if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<WhatsAppErrorResponse>;
        const apiErrorData = axiosError.response?.data?.error;
        if (apiErrorData) {
            console.error(`  Status: ${axiosError.response?.status}`);
            console.error(`  API Error: ${apiErrorData.message} (Code: ${apiErrorData.code}, Type: ${apiErrorData.type}, Subcode: ${apiErrorData.error_subcode || 'N/A'})`);
            console.error(`  Trace ID: ${apiErrorData.fbtrace_id}`);
            return { success: false, error: apiErrorData };
        } else if (axiosError.request) {
            console.error('  Error: No response received from API (network/timeout).');
            return { success: false, error: { message: 'Network Error or Timeout' } };
        } else {
            console.error('  Error: Axios setup error:', axiosError.message);
            return { success: false, error: { message: `Axios setup error: ${axiosError.message}` } };
        }
    } else {
        console.error('  Unexpected error:', error.message);
        return { success: false, error: { message: error.message || 'Unknown error occurred' } };
    }
  }
}

// --- NOVA FUNÇÃO PARA TEMPLATES ---

interface SendTemplateParams {
  phoneNumberId: string;
  toPhoneNumber: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
  variables: Record<string, string>; // Variáveis como { "1": "valor1", "2": "valor2" }
}

/**
 * Envia uma mensagem de template via WhatsApp Cloud API.
 * @param params - Objeto contendo os parâmetros para o envio do template.
 * @returns Um objeto indicando sucesso ou falha no envio.
 */
export async function sendWhatsappTemplateMessage(
  params: SendTemplateParams
): Promise<SendResult> {
  const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${params.phoneNumberId}/messages`;

  // Construir a seção de componentes para as variáveis
  const components = [];
  if (Object.keys(params.variables).length > 0) {
    components.push({
      type: 'body',
      parameters: Object.entries(params.variables)
        .sort(([keyA], [keyB]) => parseInt(keyA) - parseInt(keyB)) // Garante ordem {{1}}, {{2}}...
        .map(([, value]) => ({ type: 'text', text: value }))
    });
    // TODO: Adicionar suporte para variáveis de HEADER e BUTTONS se necessário no futuro
  }

  const requestBody = {
    messaging_product: 'whatsapp',
    to: params.toPhoneNumber,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.templateLanguage },
      components: components,
    },
  };

  console.log(`[WhatsappSender] Sending template '${params.templateName}' (${params.templateLanguage}) to ${params.toPhoneNumber} via ${params.phoneNumberId} (Axios)`);

  try {
    const response = await axios.post<WhatsAppResponse>(apiUrl, requestBody, {
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // Timeout padrão
    });

    const sentWamid = response.data.messages?.[0]?.id;
    if (!sentWamid) {
      console.warn(`[WhatsappSender] Template message sent to ${params.toPhoneNumber}, but WAMID not found.`);
      return { success: true, wamid: undefined };
    }

    console.log(`[WhatsappSender] Template message sent successfully to ${params.toPhoneNumber}. WAMID: ${sentWamid}`);
    return { success: true, wamid: sentWamid };

  } catch (error: any) {
    // Reutilizar a mesma lógica de tratamento de erro Axios
    console.error(`[WhatsappSender] Error sending template '${params.templateName}' to ${params.toPhoneNumber} via Axios:`);
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<WhatsAppErrorResponse>;
        const apiErrorData = axiosError.response?.data?.error;
        if (apiErrorData) {
            console.error(`  Status: ${axiosError.response?.status}`);
            console.error(`  API Error: ${apiErrorData.message} (Code: ${apiErrorData.code}, Type: ${apiErrorData.type}, Subcode: ${apiErrorData.error_subcode || 'N/A'})`);
            console.error(`  Trace ID: ${apiErrorData.fbtrace_id}`);
            return { success: false, error: apiErrorData };
        } else if (axiosError.request) {
            console.error('  Error: No response received from API (network/timeout).');
            return { success: false, error: { message: 'Network Error or Timeout' } };
        } else {
            console.error('  Error: Axios setup error:', axiosError.message);
            return { success: false, error: { message: `Axios setup error: ${axiosError.message}` } };
        }
    } else {
        console.error('  Unexpected error:', error.message);
        return { success: false, error: { message: error.message || 'Unknown error occurred' } };
    }
  }
}