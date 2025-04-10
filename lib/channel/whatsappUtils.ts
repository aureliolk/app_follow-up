import axios from 'axios';

// URL base da API do WhatsApp Graph (pode variar com a versão)
const WHATSAPP_GRAPH_API_URL = 'https://graph.facebook.com/v20.0'; // Use a versão mais recente ou a sua versão

/**
 * Busca a URL temporária de download de uma mídia do WhatsApp.
 * @param mediaId O ID da mídia fornecido pelo webhook.
 * @param accessToken O token de acesso descriptografado do workspace.
 * @returns A URL temporária para download ou null em caso de erro.
 */
export async function getWhatsappMediaUrl(mediaId: string, accessToken: string): Promise<string | null> {
  if (!mediaId || !accessToken) {
    console.error('[getWhatsappMediaUrl] Media ID ou Access Token ausente.');
    return null;
  }

  const url = `${WHATSAPP_GRAPH_API_URL}/${mediaId}`;
  console.log(`[getWhatsappMediaUrl] Buscando URL de mídia para ID: ${mediaId} em ${url}`);

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.data && response.data.url) {
      console.log(`[getWhatsappMediaUrl] URL de mídia encontrada: ${response.data.url}`);
      return response.data.url;
    } else {
      console.warn(`[getWhatsappMediaUrl] Resposta da API do WhatsApp não contém URL:`, response.data);
      return null;
    }
  } catch (error: any) {
    console.error(`[getWhatsappMediaUrl] Erro ao buscar URL de mídia para ID ${mediaId}:`, error.response?.data || error.message);
    return null;
  }
} 