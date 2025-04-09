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
    // Construir o objeto de dados para atualização condicionalmente
    const updateData: any = {
      whatsappPhoneNumberId: phoneNumberId,
      whatsappBusinessAccountId: businessAccountId,
      whatsappWebhookVerifyToken: webhookVerifyToken,
      // Sempre gera um novo token de rota se um não existir, ou mantém o existente?
      // Por enquanto, vamos gerar um novo a cada save para garantir unicidade e rota atualizada
      whatsappWebhookRouteToken: crypto.randomBytes(16).toString('hex'),
    };

    // Criptografar e adicionar accessToken SOMENTE se um novo valor foi fornecido
    if (accessToken && accessToken !== 'PRESERVE_EXISTING') { // Verifica se não é vazio e não é o placeholder
      console.log(`[ACTION] Criptografando novo Access Token para Workspace ${workspaceId}...`);
      updateData.whatsappAccessToken = encrypt(accessToken);
      console.log(`[ACTION] Novo Access Token criptografado.`);
    } else {
      console.log(`[ACTION] Mantendo Access Token existente para Workspace ${workspaceId}.`);
    }

    // Criptografar e adicionar appSecret SOMENTE se um novo valor foi fornecido
    if (appSecret && appSecret !== 'PRESERVE_EXISTING') { // Verifica se não é vazio e não é o placeholder
      console.log(`[ACTION] Criptografando novo App Secret para Workspace ${workspaceId}...`);
      updateData.whatsappAppSecret = encrypt(appSecret);
      console.log(`[ACTION] Novo App Secret criptografado.`);
    } else {
      console.log(`[ACTION] Mantendo App Secret existente para Workspace ${workspaceId}.`);
    }
    
    // Remover a geração duplicada do routeToken que estava abaixo
    // console.log(`[ACTION] Gerado webhookRouteToken: ${updateData.whatsappWebhookRouteToken}`);

    // Atualizar o workspace com os dados construídos
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });

    console.log(`[ACTION] Credenciais WhatsApp atualizadas (segredos preservados se não alterados) para Workspace ${workspaceId}`);
    revalidatePath(`/workspace/${workspaceId}/settings/integrations/whatsapp`); // Atualiza a página

    return { success: true };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao salvar credenciais WhatsApp para ${workspaceId}:`, error);
    // Se o erro for da criptografia, ele já terá sido logado. Retorna erro genérico.
    return { success: false, error: 'Erro do servidor ao salvar as credenciais.' };
  }
}