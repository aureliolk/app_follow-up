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