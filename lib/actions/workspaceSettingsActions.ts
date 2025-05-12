// lib/actions/workspaceSettingsActions.ts
'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
// Importar funções de criptografia
import { encrypt, decrypt } from '@/lib/encryption'; // Ajuste o path se necessário
import crypto from 'crypto'; // Importar crypto
import { getSession } from 'next-auth/react'; // Usar getSession (ou seu equivalente)
import { WhatsappIntegrationType } from '@prisma/client'; // Importar o Enum

// Schema e ActionResult permanecem iguais...
const WhatsappCredentialsSchema = z.object({
  workspaceId: z.string().uuid(),
  phoneNumberId: z.string().min(1, "ID do Número de Telefone é obrigatório."),
  businessAccountId: z.string().min(1, "ID da Conta Business é obrigatório."),
  accessToken: z.string().min(10, "Token de Acesso inválido."), // Validação básica
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

// Schema de validação para os dados recebidos do formulário
const evolutionSettingsSchema = z.object({
  workspaceId: z.string().cuid(),
  endpoint: z.string().url({ message: "Endpoint da API deve ser uma URL válida." }).optional().or(z.literal('')),
  apiKey: z.string().optional(), // Opcional, só atualiza se fornecido
  instanceName: z.string().optional(),
  activeIntegration: z.nativeEnum(WhatsappIntegrationType)
});

// Tipagem para os dados da action
type EvolutionSettingsData = z.infer<typeof evolutionSettingsSchema>;

// Server Action para salvar configurações da Evolution API
export async function saveEvolutionApiSettings(data: EvolutionSettingsData): Promise<{ success: boolean; error?: string }> {
  const session = await getSession(); 
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
    const dataToUpdate: any = {
      active_whatsapp_integration_type: activeIntegration,
      evolution_api_endpoint: endpoint || null,
      evolution_api_instance_name: instanceName || null,
    };

    // Atualizar a API Key apenas se um novo valor foi fornecido
    if (apiKey && apiKey.trim() !== '') {
      // TODO: Idealmente, criptografar a API Key antes de salvar!
      dataToUpdate.evolution_api_key = apiKey;
    } else {
      // Se a chave for uma string vazia explicitamente, remover do DB (ou manter, dependendo da lógica desejada)
      // Aqui estamos optando por não alterar se vier vazia/undefined.
      // Se quisesse remover: 
      // if (apiKey === '') { dataToUpdate.evolution_api_key = null; }
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: dataToUpdate,
    });

    // Revalidar o path da página de integrações para refletir as mudanças
    // Buscando o slug do workspace para construir o path correto
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true } });
    if (workspace?.slug) {
      revalidatePath(`/workspace/${workspace.slug}/integrations/whatsapp`);
    }

    return { success: true };

  } catch (error) {
    console.error("Erro ao salvar configurações da Evolution API:", error);
    return { success: false, error: 'Erro interno do servidor ao salvar as configurações.' };
  }
}

// Schema para validação do update da flag de conversão do Google Calendar
const GoogleCalendarConversionSchema = z.object({
  workspaceId: z.string().uuid('ID do Workspace inválido.'),
  enabled: z.boolean(),
});

// Server Action para atualizar a flag de conversão de evento do Google Calendar
export async function updateGoogleCalendarConversionAction(
  data: z.infer<typeof GoogleCalendarConversionSchema>
): Promise<ActionResult> {
  // TODO: Adicionar verificação de permissão do usuário para alterar configurações do workspace
  // const session = await getSession();
  // if (!session?.user?.id) {
  //   return { success: false, error: 'Usuário não autenticado.' };
  // }
  // const hasPermission = await checkUserWorkspacePermission(session.user.id, data.workspaceId, ['admin', 'owner']); // Exemplo
  // if (!hasPermission) {
  //   return { success: false, error: 'Permissão negada.' };
  // }

  const validation = GoogleCalendarConversionSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const { workspaceId, enabled } = validation.data;

  try {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        google_calendar_event_conversion_enabled: enabled,
      },
    });

    console.log(`[ACTION] Flag google_calendar_event_conversion_enabled atualizada para ${enabled} no Workspace ${workspaceId}`);
    // Revalidar o path da página de integrações do Google (ajuste se necessário)
    // Assumindo que a página de integrações Google está em /workspace/[id]/integrations
    revalidatePath(`/workspace/${workspaceId}/integrations`); 

    return { success: true };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao atualizar flag de conversão do Google Calendar para ${workspaceId}:`, error);
    return { success: false, error: 'Erro do servidor ao atualizar a configuração.' };
  }
}

// --- Evolution API Actions ---

// Schema para criação da instância Evolution (simplificado)
const CreateEvolutionInstanceSchema = z.object({
  workspaceId: z.string().uuid('ID do Workspace inválido.'),
});

// Tipo de retorno esperado da action (sem alterações)
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

// Server Action para criar/conectar instância na Evolution API (simplificada)
export async function createEvolutionInstanceAction(
  data: z.infer<typeof CreateEvolutionInstanceSchema>
): Promise<EvolutionInstanceResult> {
  // TODO: Adicionar verificação de permissão do usuário

  const validation = CreateEvolutionInstanceSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const { workspaceId } = validation.data;
  // instanceName e providedPhoneNumber removidos

  try {

    // 1. Buscar configurações do Workspace (apenas a API key é necessária aqui)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        evolution_api_key: true,
      },
    });

    // 2. Montar Payload para a API Evolution (simplificado)
    const targetUrl = process.env.apiUrlEvolution + '/instance/create';
    console.log(`[ACTION createEvolutionInstance] Target URL:`, targetUrl);

    const payload = {
      instanceName: workspaceId, // Usa o workspaceId como nome da instância
      token: crypto.randomBytes(16).toString('hex'), // Continua usando a variável de ambiente (confirmar se é isso mesmo)
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      // webhook e number removidos do payload inicial
      events: ["MESSAGES_UPSERT"],
      webhook_by_events: false,
      groups_ignore: true
    };

    console.log(`[ACTION createEvolutionInstance] Chamando ${targetUrl} com payload:`, payload);

    // 4. Fazer a chamada para a API Externa (inalterado)
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'apikey': process.env.apiKeyEvolution,
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

    // 5. Processar e retornar sucesso (inalterado, mas instanceName agora será o workspaceId)
    const instanceData = responseBody.instance;
    const qrCodeData = responseBody.qrcode;

    // TODO: Salvar o instanceId retornado (`instanceData.instanceId`) e o nome (workspaceId) no workspace?
    // await prisma.workspace.update({
    //   where: {id: workspaceId},
    //   data: {
    //      evolution_api_instance_id: instanceData.instanceId,
    //      evolution_api_instance_name: workspaceId // Salva o nome usado
    //   }
    // });

    return {
      success: true,
      instanceData: {
        instanceName: instanceData.instanceName, // Retornado pela API (deve ser o workspaceId)
        status: instanceData.status,
        token: responseBody.hash,
        pairingCode: qrCodeData?.pairingCode,
        qrCodeBase64: qrCodeData?.base64,
        qrCodeCount: qrCodeData?.count,
      }
    };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao criar instância Evolution para ${workspaceId}:`, error);
    return { success: false, error: error.message || 'Erro do servidor ao criar instância Evolution.' };
  }
}