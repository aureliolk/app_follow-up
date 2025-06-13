// lib/actions/workspaceSettingsActions.ts
'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { authOptions } from '@/lib/auth/auth-options';
import { getServerSession } from 'next-auth'; // Corrigido para importar de 'next-auth'
import { z } from 'zod';
// Importar funções de criptografia
import { encrypt, decrypt } from '@/lib/encryption'; // Ajuste o path se necessário
import crypto from 'crypto'; // Importar crypto
import { da } from 'date-fns/locale';
// import { getSession } from 'next-auth/react'; // NÃO usar getSession de react em Server Actions

// Schema de validação para as configurações de IA
const AiSettingsSchema = z.object({
  workspaceId: z.string().min(1, 'ID do workspace é obrigatório'),
  ai_default_system_prompt: z.string().nullable().optional(),
  ai_model_preference: z.string().nullable().optional(),
  ai_name: z.string().nullable().optional(),
  ai_delay_between_messages: z.number().min(0).nullable().optional(),
  ai_send_fractionated: z.boolean().optional(),
});

type AiSettingsInput = z.infer<typeof AiSettingsSchema>;

interface ActionResult {
  success: boolean;
  error?: string;
}

// Schema de validação para as credenciais do WhatsApp
const WhatsappCredentialsSchema = z.object({
  workspaceId: z.string().uuid(),
  phoneNumberId: z.string().min(1, "ID do Número de Telefone é obrigatório."),
  businessAccountId: z.string().min(1, "ID da Conta Business é obrigatório."),
  accessToken: z.string().min(10, "Token de Acesso inválido."), // Validação básica
  webhookVerifyToken: z.string().min(10, "Token de Verificação é obrigatório e deve ser seguro."),
});

// Schema de validação para os dados recebidos do formulário da Evolution API
const evolutionSettingsSchema = z.object({
  workspaceId: z.string().cuid(),
  endpoint: z.string().url({ message: "Endpoint da API deve ser uma URL válida." }).optional().or(z.literal('')),
  apiKey: z.string().optional(), // Opcional, só atualiza se fornecido
  instanceName: z.string().optional(),
  activeIntegration: z.enum(['NONE', 'WHATSAPP_CLOUD_API', 'EVOLUTION_API']), // ALTERADO
});

// Tipagem para os dados da action da Evolution API
type EvolutionSettingsData = z.infer<typeof evolutionSettingsSchema>;

// Schema para validação do update da flag de conversão do Google Calendar
const GoogleCalendarConversionSchema = z.object({
  workspaceId: z.string().uuid('ID do Workspace inválido.'),
  enabled: z.boolean(),
});

// Schema para criação da instância Evolution (simplificado)
const CreateEvolutionInstanceSchema = z.object({
  workspaceId: z.string().uuid('ID do Workspace inválido.'),
});

// Tipo de retorno esperado da action de criação de instância Evolution
interface EvolutionInstanceResult extends ActionResult {
  instanceData?: {
    instanceName: string;
    status: string;
    token: string; // O "hash" na resposta original
    pairingCode?: string;
    qrCodeBase64?: string;
    qrCodeCount?: number;
  };
}

// Schema para buscar o status da instância Evolution
const FetchEvolutionInstanceStatusSchema = z.object({
  instanceName: z.string().min(1, 'Nome da instância (workspaceId) é obrigatório.'),
});

// Tipo de retorno esperado da action de status da Evolution API
interface EvolutionInstanceStatusResult extends ActionResult {
  connectionStatus?: string;
  instanceExists?: boolean; // Para diferenciar "não encontrado" de "desconectado"
  details?: {
    ownerJid?: string;
    profileName?: string;
    profilePicUrl?: string;
    // Adicionar outros campos se necessário
  };
  tokenHash?: string; // <<< Adicionar campo para o token hash armazenado
}

// Schema para deletar a instância Evolution
const DeleteEvolutionInstanceSchema = z.object({
  instanceName: z.string().min(1, 'Nome da instância (workspaceId) é obrigatório.'),
});

/**
 * Server Action para atualizar as configurações de IA do workspace
 */
export async function updateAiSettingsAction(data: AiSettingsInput) {
  try {
    // Verificar autenticação
    const session = await getServerSession(authOptions);
    if (!session) {
      console.error('[updateAiSettingsAction] Não autorizado. Faça login para continuar.');
      return { success: false, error: 'Não autorizado. Faça login para continuar.' };
    }

    // Validar dados de entrada
    const validationResult = AiSettingsSchema.safeParse(data);
    if (!validationResult.success) {
      console.error('[updateAiSettingsAction] Validation errors:', validationResult.error.errors);
      return {
        success: false,
        error: `Dados inválidos: ${validationResult.error.errors.map(e => e.message).join(', ')}`
      };
    }

    const { workspaceId, ...updateData } = validationResult.data;

    console.log('[updateAiSettingsAction] Received data:', {
      workspaceId,
      updateData
    });

    // Verificar se o workspace existe e se o usuário tem permissão
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        owner_id: true,
        // Buscar valores atuais para comparação
        ai_default_system_prompt: true,
        ai_model_preference: true,
        ai_name: true,
        ai_delay_between_messages: true,
        ai_send_fractionated: true,
      }
    });

    if (!workspace) {
      return { success: false, error: 'Workspace não encontrado.' };
    }

    // Verificar permissões (simplificado - apenas o owner pode alterar por enquanto)
    // if (workspace.owner_id !== session.user.id) {
    //   return { success: false, error: 'Você não tem permissão para alterar as configurações deste workspace.' };
    // }

    console.log('[updateAiSettingsAction] Current workspace values:', {
      ai_default_system_prompt: workspace.ai_default_system_prompt,
      ai_model_preference: workspace.ai_model_preference,
      ai_name: workspace.ai_name,
      ai_delay_between_messages: workspace.ai_delay_between_messages,
      ai_send_fractionated: workspace.ai_send_fractionated,
    });

    // Preparar dados para atualização, removendo campos undefined
    const dataToUpdate: any = {};

    if (updateData.ai_default_system_prompt !== undefined) {
      dataToUpdate.ai_default_system_prompt = updateData.ai_default_system_prompt === ''
        ? null
        : updateData.ai_default_system_prompt;
    }

    if (updateData.ai_model_preference !== undefined) {
      dataToUpdate.ai_model_preference = updateData.ai_model_preference === ''
        ? null
        : updateData.ai_model_preference;
    }

    if (updateData.ai_name !== undefined) {
      dataToUpdate.ai_name = updateData.ai_name === ''
        ? null
        : updateData.ai_name;
    }

    if (updateData.ai_delay_between_messages !== undefined) {
      dataToUpdate.ai_delay_between_messages = updateData.ai_delay_between_messages;
    }

    if (updateData.ai_send_fractionated !== undefined) {
      dataToUpdate.ai_send_fractionated = Boolean(updateData.ai_send_fractionated);
    }

    console.log('[updateAiSettingsAction] Data to update in DB:', {
      workspaceId,
      dataToUpdate,
      originalUpdateData: updateData
    });

    // Verificar se há dados para atualizar
    if (Object.keys(dataToUpdate).length === 0) {
      return { success: true, message: 'Nenhuma alteração detectada.' };
    }

    // Atualizar o workspace
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: dataToUpdate,
      select: {
        id: true,
        ai_default_system_prompt: true,
        ai_model_preference: true,
        ai_name: true,
        ai_delay_between_messages: true,
        ai_send_fractionated: true,
      }
    });

    console.log('[updateAiSettingsAction] Workspace updated successfully:', updatedWorkspace);

    // Revalidar as páginas que podem ter sido afetadas
    revalidatePath(`/workspace/${workspaceId}/ia`);
    revalidatePath(`/workspace/${workspaceId}`);

    return {
      success: true,
      message: 'Configurações de IA atualizadas com sucesso!',
      data: updatedWorkspace
    };

  } catch (error: any) {
    console.error('[updateAiSettingsAction] Error updating AI settings:', error);

    // Tratar erros específicos do Prisma
    if (error.code === 'P2002') {
      return { success: false, error: 'Conflito de dados. Verifique os valores inseridos.' };
    }

    if (error.code === 'P2025') {
      return { success: false, error: 'Workspace não encontrado.' };
    }

    return {
      success: false,
      error: 'Erro interno do servidor. Tente novamente mais tarde.'
    };
  }
}

/**
 * Server Action para obter as configurações atuais de IA do workspace
 */
export async function getAiSettingsAction(workspaceId: string) {
  try {
    // Verificar autenticação
    const session = await getServerSession(authOptions);
    if (!session) {
      return { success: false, error: 'Não autorizado.' };
    }

    // Buscar as configurações
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        ai_default_system_prompt: true,
        ai_model_preference: true,
        ai_name: true,
        ai_delay_between_messages: true,
        ai_send_fractionated: true,
        owner_id: true,
      }
    });

    if (!workspace) {
      return { success: false, error: 'Workspace não encontrado.' };
    }

    // Verificar permissões básicas
    if (workspace.owner_id !== session.user.id) {
      return { success: false, error: 'Acesso negado.' };
    }

    const { owner_id, ...settings } = workspace;

    return {
      success: true,
      data: settings
    };

  } catch (error: any) {
    console.error('[getAiSettingsAction] Error fetching AI settings:', error);
    return {
      success: false,
      error: 'Erro ao carregar configurações.'
    };
  }
}

/**
 * Server Action para obter as configurações atuais do WhatsApp do workspace
 */
export async function getWhatsappSettingsAction(workspaceId: string) {
  console.log(`[getWhatsappSettingsAction] Attempting to fetch settings for workspaceId: ${workspaceId}`);
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      console.warn('[getWhatsappSettingsAction] Unauthorized: No session found.');
      return { success: false, error: 'Não autorizado.' };
    }
    console.log(`[getWhatsappSettingsAction] Session found for user: ${session.user.id}`);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        whatsappBusinessAccountId: true,
        whatsappAccessToken: true,
        owner_id: true,
      },
    });

    if (!workspace) {
      console.warn(`[getWhatsappSettingsAction] Workspace not found for ID: ${workspaceId}`);
      return { success: false, error: 'Workspace não encontrado.' };
    }
    console.log(`[getWhatsappSettingsAction] Workspace found. Owner ID: ${workspace.owner_id}`);

    if (workspace.owner_id !== session.user.id) {
      console.warn(`[getWhatsappSettingsAction] Access denied: User ${session.user.id} is not owner of workspace ${workspaceId}.`);
      return { success: false, error: 'Acesso negado.' };
    }

    // Decrypt the access token if it exists
    let decryptedAccessToken = null;
    if (workspace.whatsappAccessToken) {
      try {
        decryptedAccessToken = decrypt(workspace.whatsappAccessToken);
        console.log('[getWhatsappSettingsAction] WhatsApp access token decrypted successfully.');
      } catch (decryptError) {
        console.error('[getWhatsappSettingsAction] Error decrypting WhatsApp access token:', decryptError);
        return { success: false, error: 'Erro ao descriptografar o token de acesso do WhatsApp.' };
      }
    } else {
      console.warn('[getWhatsappSettingsAction] WhatsApp access token is null or empty in DB.');
    }

    if (!workspace.whatsappBusinessAccountId) {
      console.warn('[getWhatsappSettingsAction] WhatsApp Business Account ID is null or empty in DB.');
      return { success: false, error: 'ID da Conta Business do WhatsApp não configurado.' };
    }

    console.log('[getWhatsappSettingsAction] Successfully fetched WhatsApp settings.');
    return {
      success: true,
      data: {
        wabaId: workspace.whatsappBusinessAccountId,
        accessToken: decryptedAccessToken,
      },
    };
  } catch (error: any) {
    console.error('[getWhatsappSettingsAction] Unhandled error fetching WhatsApp settings:', error);
    return {
      success: false,
      error: 'Erro ao carregar configurações do WhatsApp.',
    };
  }
}

/**
 * Server Action para salvar credenciais do WhatsApp Cloud API
 */
export async function saveWhatsappCredentialsAction(
  data: z.infer<typeof WhatsappCredentialsSchema>
): Promise<ActionResult> {
  const validation = WhatsappCredentialsSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  // Verificar se a chave de criptografia está carregada
  if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32) { // NEXTAUTH_SECRET geralmente requer 32 bytes para AES-256, 64 para HMAC
    console.error("[ACTION ERROR] Chave de criptografia (NEXTAUTH_SECRET) ausente ou inválida no servidor.");
    return { success: false, error: "Erro de configuração interna do servidor [EC01]." };
  }


  const {
    workspaceId,
    phoneNumberId,
    businessAccountId,
    accessToken,
    webhookVerifyToken,
  } = validation.data;

  try {
    // Construir o objeto de dados para atualização condicionalmente
    const updateData: any = {
      whatsappPhoneNumberId: phoneNumberId,
      whatsappBusinessAccountId: businessAccountId,
      whatsappWebhookVerifyToken: webhookVerifyToken,
      // Sempre gera um novo token de rota webhook
      whatsappWebhookRouteToken: crypto.randomBytes(16).toString('hex'),
    };

    // Criptografar e adicionar accessToken SOMENTE se um novo valor foi fornecido (não vazio e não placeholder)
    if (accessToken && accessToken !== 'PRESERVE_EXISTING') {
      console.log(`[ACTION] Criptografando novo Access Token para Workspace ${workspaceId}...`);
      // Assumindo que encrypt espera uma string e retorna uma string criptografada
      updateData.whatsappAccessToken = encrypt(accessToken);
      console.log(`[ACTION] Novo Access Token criptografado.`);
    } else {
      // Se o token for vazio ou o placeholder, manter o existente no DB (não incluir no updateData)
      // Se `accessToken === ''`, isso indica que o usuário quer limpar, mas a lógica atual não suporta.
      // Se for preciso limpar, adicionar lógica aqui.
      console.log(`[ACTION] Mantendo Access Token existente para Workspace ${workspaceId}.`);
    }

    // Verificar permissão antes de atualizar
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return { success: false, error: 'Não autenticado.' };
    }
    // Implementar checkUserWorkspacePermission ou verificar owner_id
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true }
    });
    if (!workspace || workspace.owner_id !== session.user.id) {
      return { success: false, error: 'Permissão negada.' };
    }


    // Atualizar o workspace com os dados construídos
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });

    console.log(`[ACTION] Credenciais WhatsApp atualizadas (segredos preservados se não alterados) para Workspace ${workspaceId}`);
    revalidatePath(`/workspace/${workspaceId}/integrations/whatsapp`); // Atualiza a página

    return { success: true };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao salvar credenciais WhatsApp para ${workspaceId}:`, error);
    // Se o erro for da criptografia, ele já terá sido logado. Retorna erro genérico.
    return { success: false, error: error.message || 'Erro do servidor ao salvar as credenciais.' };
  }
}

// Server Action para salvar configurações da Evolution API
export async function saveEvolutionApiSettings(data: EvolutionSettingsData): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: 'Usuário não autenticado.' };
  }

  // Validar dados recebidos
  const validationResult = evolutionSettingsSchema.safeParse(data);
  if (!validationResult.success) {
    // Coleta os erros de validação
    const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { success: false, error: `Dados inválidos: ${errors}` };
  }

  const { workspaceId, endpoint, apiKey, instanceName, activeIntegration } = validationResult.data;

  try {
    // Verificar permissão
    const workspaceCheck = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true }
    });
    if (!workspaceCheck || workspaceCheck.owner_id !== session.user.id) {
      return { success: false, error: 'Permissão negada.' };
    }


    const dataToUpdate: any = {
      // active_whatsapp_integration_type: activeIntegration, // REMOVIDO - Campo não existe no schema do DB Workspace
      evolution_api_endpoint: endpoint || null,
      evolution_api_instance_name: instanceName || null,
    };

    // Atualizar a API Key apenas se um novo valor foi fornecido (não vazio)
    if (apiKey && apiKey.trim() !== '') {
      // TODO: Idealmente, criptografar a API Key antes de salvar! Por enquanto, salva direto.
      dataToUpdate.evolution_api_key = apiKey.trim();
    } else if (apiKey === '') {
      // Se a chave for uma string vazia explicitamente, remover do DB
      dataToUpdate.evolution_api_key = null;
    }
    // Se apiKey for undefined, o campo não é incluído em dataToUpdate, mantendo o valor existente


    await prisma.workspace.update({
      where: { id: workspaceId },
      data: dataToUpdate,
    });

    // Revalidar o path da página de integrações para refletir as mudanças
    // Buscando o slug do workspace para construir o path correto
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
    if (workspace?.slug) {
      revalidatePath(`/workspace/${workspace.slug}/integrations/evolution`); // Ajustar path se necessário
    }

    return { success: true };

  } catch (error) {
    console.error("Erro ao salvar configurações da Evolution API:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor ao salvar as configurações.' };
  }
}

// Server Action para atualizar a flag de conversão de evento do Google Calendar
export async function updateGoogleCalendarConversionAction(
  data: z.infer<typeof GoogleCalendarConversionSchema>
): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return { success: false, error: 'Não autenticado.' };
  }

  const validation = GoogleCalendarConversionSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const { workspaceId, enabled } = validation.data;

  try {
    // Verificar permissão
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true }
    });
    if (!workspace || workspace.owner_id !== session.user.id) {
      return { success: false, error: 'Permissão negada.' };
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        google_calendar_event_conversion_enabled: enabled,
      },
    });

    console.log(`[ACTION] Flag google_calendar_event_conversion_enabled atualizada para ${enabled} no Workspace ${workspaceId}`);
    // Revalidar o path da página de integrações do Google (ajuste se necessário)
    revalidatePath(`/workspace/${workspaceId}/integrations`);

    return { success: true };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao atualizar flag de conversão do Google Calendar para ${workspaceId}:`, error);
    return { success: false, error: error.message || 'Erro do servidor ao atualizar a configuração.' };
  }
}

// Server Action para criar/conectar instância na Evolution API (simplificada)
export async function createEvolutionInstanceAction(
  data: z.infer<typeof CreateEvolutionInstanceSchema>
): Promise<EvolutionInstanceResult> {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return { success: false, error: 'Não autenticado.' };
  }

  const validation = CreateEvolutionInstanceSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const { workspaceId } = validation.data;

  try {
    // Verificar permissão
    const workspaceCheck = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true }
    });
    if (!workspaceCheck || workspaceCheck.owner_id !== session.user.id) {
      return { success: false, error: 'Permissão negada.' };
    }

    // <<< Gerar o Webhook Token ÚNICO AQUI >>>
    const evolution_webhook_route_token = crypto.randomBytes(16).toString('hex');
    const evolution_webhook_token = crypto.randomBytes(16).toString('hex');
    const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/ingress/${evolution_webhook_route_token}`;
    console.log(`[ACTION createEvolutionInstance] Gerado webhook URL: ${webhookUrl}`);

    // 2. Montar Payload para a API Evolution (simplificado)
    const targetUrl = (process.env.apiUrlEvolution?.endsWith('/') ? process.env.apiUrlEvolution : process.env.apiUrlEvolution + '/') + 'instance/create'; // Garante a barra final
    console.log(`[ACTION createEvolutionInstance] Target URL:`, targetUrl);

    const payload = {
      instanceName: workspaceId, // Usa o workspaceId como nome da instância (deve ser único globalmente)
      token: evolution_webhook_token, // O token que a Evolution usará para assinar/autenticar webhooks DELES para NÓS
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      groupsIgnore: true,
      webhook: {
        url: webhookUrl,
        enabled: true,
        byEvents: false,
        base64: true,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "MESSAGES_DELETE",
          "SEND_MESSAGE", // Incluído SEND_MESSAGE se for útil
        ],
        // conn: true, // webhook para status de conexão? Depende da Evolution API
        // ack: true, // webhook para acks de mensagens? Depende da Evolution API
        // presence: true, // webhook para status de presença? Depende da Evolution API
      }
    };

    console.log(`[ACTION createEvolutionInstance] Chamando ${targetUrl} com payload:`, JSON.stringify(payload, null, 2)); // Log do payload completo

    // 4. Fazer a chamada para a API Externa
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'apikey': process.env.apiKeyEvolution as string, // <<< Usar apiKeyEvolution >>>
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      console.error('[ACTION createEvolutionInstance] Erro da API Evolution:', responseBody);
      throw new Error(responseBody.message || responseBody.error || `Erro ${response.status} ao criar instância.`);
    }

    console.log('[ACTION createEvolutionInstance] Resposta da API Evolution:', responseBody);

    // 5. Processar e retornar sucesso
    const instanceData = responseBody.instance;
    const qrCodeData = responseBody.qrcode;

    // <<< Salvar os tokens e nome da instância no banco de dados >>>
    try {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          evolution_webhook_route_token: evolution_webhook_route_token, // Token usado na URL do webhook
          evolution_api_instance_name: instanceData.instanceName, // Nome da instância retornado pela Evolution
          evolution_api_token: evolution_webhook_token, // Token que a Evolution usará no header 'apikey'
          // evolution_api_instance_id: instanceData.instanceId, // Salvar se a API Evolution retornar um ID de instância separado
        }
      });
      console.log(`[ACTION createEvolutionInstance] Dados da instância Evolution salvos para workspace ${workspaceId}`);
    } catch (dbError) {
      console.error(`[ACTION createEvolutionInstance] Erro ao salvar dados da instância Evolution no DB para workspace ${workspaceId}:`, dbError);
      // Não falhar a action inteira, mas logar o erro de DB.
      // Talvez retornar um aviso parcial?
    }

    return {
      success: true,
      instanceData: {
        instanceName: instanceData.instanceName,
        status: instanceData.status,
        token: responseBody.hash, // Este é o API Key DA INSTÂNCIA (gerado pela Evolution), diferente do evolution_api_token que usamos como 'apikey' para chamar a API Evolution
        pairingCode: qrCodeData?.pairingCode,
        qrCodeBase64: qrCodeData?.base64,
        qrCodeCount: qrCodeData?.count,
      },
    };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao criar instância Evolution para ${workspaceId}:`, error);
    return { success: false, error: error.message || 'Erro do servidor ao criar instância Evolution.' };
  }
}


// Server Action para buscar o status de uma instância Evolution
export async function fetchEvolutionInstanceStatusAction(
  data: z.infer<typeof FetchEvolutionInstanceStatusSchema>
): Promise<EvolutionInstanceStatusResult> {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return { success: false, error: 'Não autenticado.' };
  }

  const validation = FetchEvolutionInstanceStatusSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const { instanceName } = validation.data; // instanceName é o workspaceId

  try {
    // Verificar permissão
    const workspaceCheck = await prisma.workspace.findUnique({
      where: { id: instanceName }, // instanceName é o workspaceId
      select: { owner_id: true }
    });
    if (!workspaceCheck || workspaceCheck.owner_id !== session.user.id) {
      return { success: false, error: 'Permissão negada.' };
    }

    const targetUrl = `${process.env.apiUrlEvolution?.endsWith('/') ? process.env.apiUrlEvolution : process.env.apiUrlEvolution + '/'}instance/fetchInstances?instanceName=${instanceName}`; // Garante a barra final e busca por instanceName
    console.log(`[ACTION fetchEvolutionInstanceStatus] Chamando GET ${targetUrl}`);

    // Buscar o token hash armazenado no nosso DB ANTES de chamar a API Evolution
    let storedTokenHash: string | null = null; // Mudar para null, pois pode não existir
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: instanceName }, // instanceName é o workspaceId
        select: { evolution_api_token: true } // evolution_api_token é o token que a Evolution espera no header apikey
      });
      if (workspace?.evolution_api_token) {
        storedTokenHash = workspace.evolution_api_token;
      }
    } catch (dbError) {
      console.error(`[ACTION fetchEvolutionInstanceStatus] Erro ao buscar token hash do DB para ${instanceName}:`, dbError);
      // Loga o erro, mas continua para tentar chamar a API Evolution
    }

    if (!storedTokenHash) {
      console.warn(`[ACTION fetchEvolutionInstanceStatus] Token hash não encontrado no DB para workspace ${instanceName}. Não é possível buscar status da Evolution API.`);
      // Pode retornar um status indicando que a integração não está configurada
      return { success: true, instanceExists: false, connectionStatus: 'NOT_CONFIGURED' };
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'apikey': storedTokenHash, // <<< Usar o storedTokenHash aqui >>>
        'Content-Type': 'application/json',
      },
    });

    const responseBody = await response.json();

    if (!response.ok) {
      // A API Evolution pode retornar 404 se a instância não existe ou 401/403 se o token for inválido
      if (response.status === 404) {
        console.log(`[ACTION fetchEvolutionInstanceStatus] Instância ${instanceName} não encontrada na Evolution API (404).`);
        return { success: true, instanceExists: false, connectionStatus: 'NOT_FOUND_IN_API' }; // Sucesso na chamada, mas instância não existe na API
      } else if (response.status === 401 || response.status === 403) {
        console.error(`[ACTION fetchEvolutionInstanceStatus] Erro de autenticação (${response.status}) ao buscar status para ${instanceName}. Token inválido?`);
        return { success: false, error: 'Erro de autenticação com a Evolution API. Verifique suas credenciais.', connectionStatus: 'AUTH_ERROR' };
      }
      console.error('[ACTION fetchEvolutionInstanceStatus] Erro da API Evolution:', responseBody);
      throw new Error(responseBody.message || responseBody.error || `Erro ${response.status} ao buscar instância.`);
    }

    console.log(`[ACTION fetchEvolutionInstanceStatus] Resposta para ${instanceName}:`, responseBody);

    // A API retorna um array, mesmo buscando por nome específico
    if (!Array.isArray(responseBody) || responseBody.length === 0) {
      console.log(`[ACTION fetchEvolutionInstanceStatus] Instância ${instanceName} não encontrada na resposta da Evolution API.`);
      return { success: true, instanceExists: false, connectionStatus: 'NOT_FOUND_IN_RESPONSE' };
    }

    const instanceDetailsFromApi = responseBody[0]; // Pegar o primeiro (e único esperado) item

    return {
      success: true,
      instanceExists: true,
      connectionStatus: instanceDetailsFromApi.connectionStatus, // Assume que este campo existe
      details: {
        ownerJid: instanceDetailsFromApi.ownerJid,
        profileName: instanceDetailsFromApi.profileName,
        profilePicUrl: instanceDetailsFromApi.profilePicUrl,
        // Adicionar outros campos se necessário
      },
      tokenHash: storedTokenHash // <<< Retornar o token hash do DB >>>
    };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao buscar status da instância Evolution ${instanceName}:`, error);
    return { success: false, error: error.message || 'Erro do servidor ao buscar status da instância Evolution.' };
  }
}

// Server Action para deletar uma instância Evolution
export async function deleteEvolutionInstanceAction(
  data: z.infer<typeof DeleteEvolutionInstanceSchema>
): Promise<ActionResult> { // ActionResult é { success: boolean; error?: string; }
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return { success: false, error: 'Não autenticado.' };
  }

  const validation = DeleteEvolutionInstanceSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const { instanceName } = validation.data; // instanceName é o workspaceId

  try {
    // Verificar permissão
    const workspaceCheck = await prisma.workspace.findUnique({
      where: { id: instanceName }, // instanceName é o workspaceId
      select: { owner_id: true }
    });
    if (!workspaceCheck || workspaceCheck.owner_id !== session.user.id) {
      return { success: false, error: 'Permissão negada.' };
    }

    // Buscar o token hash armazenado no nosso DB ANTES de chamar a API Evolution
    let storedTokenHash: string | null = null; // Mudar para null, pois pode não existir
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: instanceName }, // instanceName é o workspaceId
        select: { evolution_api_token: true } // evolution_api_token é o token que a Evolution espera no header apikey
      });
      if (workspace?.evolution_api_token) {
        storedTokenHash = workspace.evolution_api_token;
      }
    } catch (dbError) {
      console.error(`[ACTION deleteEvolutionInstanceAction] Erro ao buscar token hash do DB para ${instanceName}:`, dbError);
      // Loga o erro, mas continua... se o token não for encontrado, a chamada à API Evolution provavelmente falhará com 401/403
    }

    if (!storedTokenHash) {
      console.warn(`[ACTION deleteEvolutionInstanceAction] Token hash não encontrado no DB para workspace ${instanceName}. Não é possível deletar instância da Evolution API.`);
      // Se o token não existe localmente, consideramos sucesso na remoção local, mesmo que a instância não tenha sido deletada na API Evolution (pois não temos como chamá-la)
      // Talvez seria melhor retornar um erro ou um status parcial?
      // Por enquanto, vamos retornar sucesso, pois do ponto de vista do nosso DB a integração não está configurada.
      // TODO: Considerar limpar os campos evolution_* no DB local neste caso.
      // await prisma.workspace.update({ // Exemplo de limpeza
      //   where: { id: instanceName },
      //   data: {
      //     evolution_api_endpoint: null,
      //     evolution_api_key: null, // Se você salvar a chave aqui
      //     evolution_api_instance_name: null,
      //     evolution_api_token: null,
      //     evolution_webhook_route_token: null,
      //   }
      // });
      return { success: true, error: 'Integração Evolution API não configurada localmente.' };
    }

    const targetUrl = `${process.env.apiUrlEvolution?.endsWith('/') ? process.env.apiUrlEvolution : process.env.apiUrlEvolution + '/'}instance/delete/${instanceName}`; // Garante a barra final
    console.log(`[ACTION deleteEvolutionInstanceAction] Chamando DELETE ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'DELETE',
      headers: {
        'apikey': storedTokenHash, // <<< Usar o storedTokenHash aqui >>>
        'Content-Type': 'application/json', // Embora DELETE possa não ter corpo, o content-type pode ser esperado
      },
    });

    // A API da Evolution pode retornar 200 com um corpo de sucesso, ou 204 No Content
    // Ou um erro se a instância não existir ou falhar
    if (!response.ok && response.status !== 204) {
      const responseBody = await response.json().catch(() => ({ message: 'Falha ao ler corpo do erro' }));
      console.error(`[ACTION deleteEvolutionInstanceAction] Erro da API Evolution ao deletar ${instanceName}:`, responseBody);
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'Erro de autenticação com a Evolution API. Verifique suas credenciais.' };
      } else if (response.status === 404) {
        console.warn(`[ACTION deleteEvolutionInstanceAction] Instância ${instanceName} não encontrada na Evolution API ao tentar deletar.`);
        // Se não encontrou na API ao deletar, talvez já tenha sido deletada. Considerar sucesso para fins de sincronização local.
        // Prossegue para limpar o DB local.
      } else {
        throw new Error(responseBody.message || responseBody.error || `Erro ${response.status} ao deletar instância.`);
      }
    }

    // Se a resposta for 204 ou 404 (tratado como já deletado na API), response.json() falhará, então verificamos o status diretamente
    if (response.status === 204 || response.status === 404) {
      console.log(`[ACTION deleteEvolutionInstanceAction] Instância ${instanceName} deletada (204) ou não encontrada (404) na Evolution API. Limpando DB local.`);
    } else { // Resposta 200 com corpo, por exemplo
      const responseBody = await response.json().catch(() => null); // Tenta ler o corpo, mas não falha se vazio
      console.log(`[ACTION deleteEvolutionInstanceAction] Resposta da API Evolution ao deletar ${instanceName}:`, responseBody);
    }

    // Limpar campos relacionados à Evolution API no nosso banco de dados LOCAL independentemente do status 200/204/404 da API Evolution (se o token existia localmente)
    try {
      await prisma.workspace.update({
        where: { id: instanceName },
        data: {
          evolution_api_endpoint: null,
          evolution_api_key: null, // Se você estiver armazenando a chave global aqui
          evolution_api_instance_name: null,
          evolution_api_token: null, // Limpa o token da instância
          evolution_webhook_route_token: null,
          google_calendar_event_conversion_enabled: false, // Desabilitar conversão Google Calendar também ao remover Evolution?
        }
      });
      console.log(`[ACTION deleteEvolutionInstanceAction] Dados da Evolution API limpados do DB local para workspace ${instanceName}.`);
    } catch (dbError) {
      console.error(`[ACTION deleteEvolutionInstanceAction] Erro ao limpar dados da Evolution API do DB para workspace ${instanceName}:`, dbError);
      // Loga o erro do DB, mas a action ainda pode retornar sucesso se a chamada à API Evolution (ou o status) foi ok/404
    }


    // Revalidar o path da página de integrações para refletir as mudanças
    revalidatePath(`/workspace/${instanceName}/integrations/evolution`); // ou o path correto
    console.log(`[ACTION deleteEvolutionInstanceAction] Path revalidado para workspace ${instanceName}`);


    return { success: true }; // Retorna sucesso se a chamada à API foi 200/204/404 ou se o token não existia localmente

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha geral ao deletar instância Evolution ${instanceName}:`, error);
    // Captura erros que não foram tratados especificamente acima
    return { success: false, error: error.message || 'Erro do servidor ao deletar instância Evolution.' };
  }
}

// Server Action para Atulizar configuracoes da NumvemShop
// Schema de validação para os dados recebidos do formulário da Evolution API
const nuvemShopeIntegrationSchema = z.object({
  workspaceId: z.string(),
  store_id: z.string(),
  token: z.string() // Opcional, só atualiza se fornecido
});

type NumvemShopSettingsData = z.infer<typeof nuvemShopeIntegrationSchema>;


export async function UpdateNuvemShopIntegration(data: NumvemShopSettingsData): Promise<{ success: boolean; msg?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, msg: 'Usuário não autenticado.' };
  }
  const validationResult = nuvemShopeIntegrationSchema.safeParse(data);
  if (!validationResult.success) {
    // Coleta os erros de validação
    const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { success: false, msg: `Dados inválidos: ${errors}` };
  }

  try {
    await prisma.workspace.update({
      where: { id: data.workspaceId },
      data: {
        nuvemshopStoreId: data.store_id,
        nuvemshopApiKey: data.token, // Se token for vazio, não atualiza
      },
      select: {
        nuvemshopStoreId: true,
        nuvemshopApiKey: true,
      },
    });
    return {
      success: true,
      msg: 'Configurações da NuvemShop atualizadas com sucesso!',
    };
  } catch (error: any) {
    console.error('[UpdateNuvemShopIntegration] Error updating NuvemShop settings:', error);
    return {
      success: false,
      msg: 'Erro ao atualizar as configurações da NuvemShop. Verifique os dados e tente novamente.',
    }
  }
}