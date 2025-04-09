// lib/actions/workspaceSettingsActions.ts
'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
// Importar funções de criptografia
import { encrypt, decrypt } from '@/lib/encryption'; // Ajuste o path se necessário
import crypto from 'crypto'; // Importar crypto

// Schema e ActionResult permanecem iguais...
const WhatsappCredentialsSchema = z.object({
  workspaceId: z.string().uuid(),
  phoneNumberId: z.string().min(1, "ID do Número de Telefone é obrigatório."),
  businessAccountId: z.string().min(1, "ID da Conta Business é obrigatório."),
  accessToken: z.string().min(10, "Token de Acesso inválido."), // Validação básica
  appSecret: z.string().min(10, "Segredo do Aplicativo inválido."), // Validação básica
  webhookVerifyToken: z.string().min(10, "Token de Verificação é obrigatório e deve ser seguro."),
});

interface ActionResult {
  success: boolean;
  error?: string;
}


export async function saveWhatsappCredentialsAction(
  data: z.infer<typeof WhatsappCredentialsSchema>
): Promise<ActionResult> {
  const validation = WhatsappCredentialsSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  // Verificar se a chave de criptografia está carregada (o import já faz isso, mas podemos checar de novo)
  if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length !== 64) {
       console.error("[ACTION ERROR] Chave de criptografia (NEXTAUTH_SECRET) ausente ou inválida no servidor.");
       return { success: false, error: "Erro de configuração interna do servidor [EC01]." };
  }


  const {
    workspaceId,
    phoneNumberId,
    businessAccountId,
    accessToken,
    appSecret,
    webhookVerifyToken,
  } = validation.data;

  try {
    // Criptografar os segredos ANTES de salvar
    console.log(`[ACTION] Criptografando segredos para Workspace ${workspaceId}...`);
    const encryptedAccessToken = encrypt(accessToken);
    const encryptedAppSecret = encrypt(appSecret);
    console.log(`[ACTION] Segredos criptografados.`);

    // Gerar o token único para a rota do webhook
    const webhookRouteToken = crypto.randomBytes(16).toString('hex');
    console.log(`[ACTION] Gerado webhookRouteToken: ${webhookRouteToken}`);

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        whatsappPhoneNumberId: phoneNumberId,
        whatsappBusinessAccountId: businessAccountId,
        whatsappAccessToken: encryptedAccessToken, // Salvar valor criptografado
        whatsappAppSecret: encryptedAppSecret,   // Salvar valor criptografado
        whatsappWebhookVerifyToken: webhookVerifyToken,
        whatsappWebhookRouteToken: webhookRouteToken, // Salvar o token gerado
      },
    });

    console.log(`[ACTION] Credenciais WhatsApp salvas (criptografadas) e route token gerado para Workspace ${workspaceId}`);
    revalidatePath(`/workspace/${workspaceId}/settings/integrations/whatsapp`); // Atualiza a página

    return { success: true };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao salvar credenciais WhatsApp para ${workspaceId}:`, error);
    // Se o erro for da criptografia, ele já terá sido logado. Retorna erro genérico.
    return { success: false, error: 'Erro do servidor ao salvar as credenciais.' };
  }
}