// lib/channel/evolutionSender.ts
import axios, { AxiosError } from 'axios';
import { SendResult } from './whatsappSender'; // Reusing SendResult interface

interface EvolutionApiErrorData {
  message?: string; // Make message optional
  status?: number;
  code?: string;
}

interface SendEvolutionMediaParams {
  evolutionApiEndpoint: string;
  evolutionApiKey: string;
  evolutionInstanceName: string; // Assuming instance name is part of the URL or headers
  toPhoneNumber: string; // Full phone number with country code
  mediaUrl: string; // URL of the media to send
  mimeType: string; // MIME type of the media
  mediaType: 'image' | 'audio' | 'video' | 'document'; // Type of media
  caption?: string; // Optional caption for image/video
  filename?: string; // Optional filename for documents
}

/**
 * Envia uma mensagem de mídia (imagem, documento, áudio, vídeo) via Evolution API.
 * @param params - Parâmetros contendo detalhes da API Evolution e da mídia.
 * @returns Um objeto indicando sucesso ou falha no envio.
 */
export async function sendEvolutionMediaMessage(
  params: SendEvolutionMediaParams
): Promise<SendResult> {
  const {
    evolutionApiEndpoint,
    evolutionApiKey,
    evolutionInstanceName,
    toPhoneNumber,
    mediaUrl,
    mimeType,
    mediaType,
    caption,
    filename,
  } = params;

  const apiUrl = `${evolutionApiEndpoint}/message/sendMedia/${evolutionInstanceName}`;

  let requestBody: any;
  let logIdentifier: string;

  // Evolution API typically expects 'url' for media and 'caption' for text
  // The 'type' field might be 'image', 'video', 'audio', 'document'
  // Filename is usually for documents
  switch (mediaType) {
    case 'image':
      requestBody = {
        number: toPhoneNumber,
        options: {
          delay: 1200, // Example delay
        },
        mediaMessage: {
          url: mediaUrl,
          mimetype: mimeType,
          caption: caption,
        },
      };
      logIdentifier = `Image URL ${mediaUrl.substring(0, 50)}...`;
      break;
    case 'video':
      requestBody = {
        number: toPhoneNumber,
        options: {
          delay: 1200,
        },
        mediaMessage: {
          url: mediaUrl,
          mimetype: mimeType,
          caption: caption,
        },
      };
      logIdentifier = `Video URL ${mediaUrl.substring(0, 50)}...`;
      break;
    case 'audio':
      requestBody = {
        number: toPhoneNumber,
        options: {
          delay: 1200,
        },
        mediaMessage: {
          url: mediaUrl,
          mimetype: mimeType,
          // Evolution API might require specific audio formats or parameters
          // For now, assuming direct URL works.
        },
      };
      logIdentifier = `Audio URL ${mediaUrl.substring(0, 50)}...`;
      break;
    case 'document':
      requestBody = {
        number: toPhoneNumber,
        options: {
          delay: 1200,
        },
        mediaMessage: {
          url: mediaUrl,
          mimetype: mimeType,
          fileName: filename || 'document', // Evolution might use fileName instead of filename
          caption: caption,
        },
      };
      logIdentifier = `Document URL ${mediaUrl.substring(0, 50)}...`;
      break;
    default:
      console.error(`[EvolutionSender] Unsupported media type for Evolution API: ${mediaType}`);
      return { success: false, error: { message: `Unsupported media type: ${mediaType}` } };
  }

  console.log(`[EvolutionSender] Sending media message (${logIdentifier}) to ${toPhoneNumber} via Evolution API`);

  try {
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey, // Evolution API often uses 'apikey' header
      },
      timeout: 30000, // Increased timeout for media sends
    });

    // Evolution API response structure might vary.
    // Assuming a simple success/failure or message ID.
    if (response.data && response.data.status === 'success') {
      console.log(`[EvolutionSender] Media message sent successfully to ${toPhoneNumber}.`);
      return { success: true, wamid: response.data.messageId || 'N/A' }; // Assuming messageId or similar
    } else {
      console.error(`[EvolutionSender] Evolution API returned non-success status:`, response.data);
      return { success: false, error: { message: response.data?.message || 'Evolution API non-success response' } };
    }
  } catch (error: any) {
    console.error(`[EvolutionSender] Error sending media message (${logIdentifier}) to ${toPhoneNumber} via Evolution API:`);
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const apiErrorData: EvolutionApiErrorData = axiosError.response?.data;
      if (apiErrorData) {
        console.error(`  Status: ${axiosError.response?.status}`);
        console.error(`  API Error: ${apiErrorData.message} (Code: ${apiErrorData.code || 'N/A'})`);
        return { success: false, error: { message: apiErrorData.message || 'Evolution API error' } };
      } else if (axiosError.request) {
        console.error('  Error: No response received from API (network/timeout).');
        return { success: false, error: { message: 'Network Error or Timeout during Evolution API media send' } };
      } else {
        console.error('  Error: Axios setup error:', axiosError.message);
        return { success: false, error: { message: `Axios setup error: ${axiosError.message}` } };
      }
    } else {
      console.error('  Unexpected error:', error.message);
      return { success: false, error: { message: error.message || 'Unknown error occurred during Evolution API media send' } };
    }
  }
}