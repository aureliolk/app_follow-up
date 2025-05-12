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
  webhookSetupWarning?: string; // <<< Adicionar o campo opcional aqui
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

    // <<< Gerar o Webhook Token ÚNICO AQUI >>>
    const evolution_webhook_route_token = crypto.randomBytes(16).toString('hex');
    const evolution_webhook_token = crypto.randomBytes(16).toString('hex');
    const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/ingress/evolution/hook/${evolution_webhook_route_token}`;
    console.log(`[ACTION createEvolutionInstance] Gerado webhook URL: ${webhookUrl}`);

    // 2. Montar Payload para a API Evolution (simplificado)
    const targetUrl = process.env.apiUrlEvolution + '/instance/create';
    console.log(`[ACTION createEvolutionInstance] Target URL:`, targetUrl);

    const payload = {
      instanceName: workspaceId, // Usa o workspaceId como nome da instância
      token: evolution_webhook_token, 
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED", "GROUP_UPDATE", "PRESENCE_UPDATE"],
      groups_ignore: true
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

    // <<< Salvar o evolutionWebhookToken no banco de dados >>>
    try {
        await prisma.workspace.update({
          where: {id: workspaceId},
          data: {
            evolution_webhook_route_token: evolution_webhook_route_token,
            evolution_api_instance_name: instanceData.instanceName,
            evolution_api_token: evolution_webhook_token, // <<< Salvar o nome da instância retornado >>>
             // evolution_api_instance_id: instanceData.instanceId, // Se existir e for útil
          }
        });
        console.log(`[ACTION createEvolutionInstance] Evolution webhook token salvo para workspace ${workspaceId}`);
    } catch(dbError) {
        console.error(`[ACTION createEvolutionInstance] Erro ao salvar webhook token no DB para workspace ${workspaceId}:`, dbError);
        // Não falhar a action inteira, mas logar o erro de DB.
        // Talvez retornar um aviso parcial?
    }

    // <<< REINTRODUZIR A CONFIGURAÇÃO DO WEBHOOK VIA /webhook/set >>>
    let webhookSetupWarning: string | undefined = undefined;
    try {
      const webhookSetUrl = `${process.env.apiUrlEvolution}/webhook/set/${instanceData.instanceName}`;
      console.log(`[ACTION createEvolutionInstance] Configurando webhook em: ${webhookSetUrl}`);
      const webhookPayload = {
        enabled: true, // Certificar-se de que está habilitado
        url: webhookUrl, // Sua URL pública (ngrok ou produção)
        webhook_by_events: false, // Tentar com false primeiro
        events: [ // Eventos que você quer receber
          "MESSAGES_UPSERT", 
          "CONNECTION_UPDATE", 
          "QRCODE_UPDATED",
          // Adicione outros eventos conforme necessário
        ]
      };
      
      console.log(`[ACTION createEvolutionInstance] Payload para /webhook/set:`, JSON.stringify(webhookPayload, null, 2));

      const webhookResponse = await fetch(webhookSetUrl, {
        method: 'POST',
        headers: {
          'apikey': evolution_webhook_token, // O token da INSTÂNCIA, não o global
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });

      if (!webhookResponse.ok) {
        const webhookErrorBody = await webhookResponse.json().catch(() => ({ message: 'Falha ao ler corpo do erro do webhook/set' }));
        console.error(`[ACTION createEvolutionInstance] Erro ao configurar webhook para ${instanceData.instanceName}. Corpo do erro:`, JSON.stringify(webhookErrorBody, null, 2));
        const errorMessage = Array.isArray(webhookErrorBody.message) ? webhookErrorBody.message.join(', ') : (webhookErrorBody.message || webhookErrorBody.error || `Erro ${webhookResponse.status} ao configurar webhook.`);
        webhookSetupWarning = `Falha ao configurar webhook: ${errorMessage}`;
      } else {
        const webhookSuccessBody = await webhookResponse.json().catch(() => null);
        console.log(`[ACTION createEvolutionInstance] Webhook configurado com sucesso para ${instanceData.instanceName}. Resposta:`, webhookSuccessBody);
      }

    } catch (error: any) {
      console.error(`[ACTION createEvolutionInstance] Exceção ao configurar webhook para ${instanceData.instanceName}:`, error);
      webhookSetupWarning = `Exceção ao configurar webhook: ${error.message}`;
    }

    return {
      success: true,
      instanceData: {
        instanceName: instanceData.instanceName, 
        status: instanceData.status,
        token: responseBody.hash, // Este é o API Key da instância (antigo 'token' ou 'hash')
        pairingCode: qrCodeData?.pairingCode,
        qrCodeBase64: qrCodeData?.base64,
        qrCodeCount: qrCodeData?.count,
      },
      webhookSetupWarning // <<< Retornar o aviso, se houver >>>
    };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao criar instância Evolution para ${workspaceId}:`, error);
    return { success: false, error: error.message || 'Erro do servidor ao criar instância Evolution.' };
  }
}

// --- Evolution API Status Fetch Action ---

// Schema para buscar o status da instância
const FetchEvolutionInstanceStatusSchema = z.object({
  instanceName: z.string().min(1, 'Nome da instância (workspaceId) é obrigatório.'),
});

// Tipo de retorno esperado da action de status
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

// Server Action para buscar o status de uma instância Evolution
export async function fetchEvolutionInstanceStatusAction(
  data: z.infer<typeof FetchEvolutionInstanceStatusSchema>
): Promise<EvolutionInstanceStatusResult> {
  // TODO: Adicionar verificação de permissão do usuário?

  const validation = FetchEvolutionInstanceStatusSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const { instanceName } = validation.data;

  try {
    const targetUrl = `${process.env.apiUrlEvolution}/instance/fetchInstances?instanceName=${instanceName}`;
    console.log(`[ACTION fetchEvolutionInstanceStatus] Chamando GET ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'apikey': process.env.apiKeyEvolution as string, // Usar a chave global
        'Content-Type': 'application/json',
      },
    });

    const responseBody = await response.json();

    if (!response.ok) {
      // A API Evolution pode retornar 404 se a instância não existe
      if (response.status === 404) {
        console.log(`[ACTION fetchEvolutionInstanceStatus] Instância ${instanceName} não encontrada (404).`);
        return { success: true, instanceExists: false }; // Sucesso na chamada, mas instância não existe
      }
      console.error('[ACTION fetchEvolutionInstanceStatus] Erro da API Evolution:', responseBody);
      throw new Error(responseBody.message || responseBody.error || `Erro ${response.status} ao buscar instância.`);
    }

    console.log(`[ACTION fetchEvolutionInstanceStatus] Resposta para ${instanceName}:`, responseBody);

    // A API retorna um array, mesmo buscando por nome específico
    if (!Array.isArray(responseBody) || responseBody.length === 0) {
      console.log(`[ACTION fetchEvolutionInstanceStatus] Instância ${instanceName} não encontrada na resposta.`);
      return { success: true, instanceExists: false };
    }

    const instanceDetailsFromApi = responseBody[0]; // Pegar o primeiro (e único esperado) item

    // <<< Buscar o token hash armazenado no nosso DB >>>
    let storedTokenHash: string | undefined = undefined;
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: instanceName }, // instanceName é o workspaceId
            select: { evolution_api_token: true }
        });
        if (workspace?.evolution_api_token) {
            storedTokenHash = workspace.evolution_api_token;
        }
    } catch (dbError) {
        console.error(`[ACTION fetchEvolutionInstanceStatus] Erro ao buscar token hash do DB para ${instanceName}:`, dbError);
        // Não falhar a action inteira, mas logar.
    }

    return {
      success: true,
      instanceExists: true,
      connectionStatus: instanceDetailsFromApi.connectionStatus,
      details: {
        ownerJid: instanceDetailsFromApi.ownerJid,
        profileName: instanceDetailsFromApi.profileName,
        profilePicUrl: instanceDetailsFromApi.profilePicUrl,
      },
      tokenHash: storedTokenHash // <<< Retornar o token hash do DB >>>
    };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao buscar status da instância Evolution ${instanceName}:`, error);
    return { success: false, error: error.message || 'Erro do servidor ao buscar status da instância.' };
  }
}

// --- Evolution API Delete Instance Action ---

// Schema para deletar a instância Evolution
const DeleteEvolutionInstanceSchema = z.object({
  instanceName: z.string().min(1, 'Nome da instância (workspaceId) é obrigatório.'),
});

// Server Action para deletar uma instância Evolution
export async function deleteEvolutionInstanceAction(
  data: z.infer<typeof DeleteEvolutionInstanceSchema>
): Promise<ActionResult> { // ActionResult é { success: boolean; error?: string; }
  // TODO: Adicionar verificação de permissão do usuário?

  const validation = DeleteEvolutionInstanceSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const { instanceName } = validation.data;

  try {
    const targetUrl = `${process.env.apiUrlEvolution}/instance/delete/${instanceName}`;
    console.log(`[ACTION deleteEvolutionInstanceAction] Chamando DELETE ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'DELETE',
      headers: {
        'apikey': process.env.apiKeyEvolution as string,
        'Content-Type': 'application/json', // Embora DELETE possa não ter corpo, o content-type pode ser esperado
      },
    });

    // A API da Evolution pode retornar 200 com um corpo de sucesso, ou 204 No Content
    // Ou um erro se a instância não existir ou falhar
    if (!response.ok && response.status !== 204) {
      const responseBody = await response.json().catch(() => ({ message: 'Falha ao ler corpo do erro' }));
      console.error(`[ACTION deleteEvolutionInstanceAction] Erro da API Evolution ao deletar ${instanceName}:`, responseBody);
      throw new Error(responseBody.message || responseBody.error || `Erro ${response.status} ao deletar instância.`);
    }
    
    // Se a resposta for 204, response.json() falhará, então verificamos o status diretamente
    if (response.status === 204) {
         console.log(`[ACTION deleteEvolutionInstanceAction] Instância ${instanceName} deletada com sucesso (204 No Content).`);
    } else {
        const responseBody = await response.json().catch(() => null); // Tenta ler o corpo, mas não falha se vazio
        console.log(`[ACTION deleteEvolutionInstanceAction] Resposta da API Evolution ao deletar ${instanceName}:`, responseBody);
    }


    // Revalidar o path da página de integrações para refletir as mudanças
    // Assumindo que instanceName é o workspaceId, como nas outras actions
    const workspace = await prisma.workspace.findUnique({ 
        where: { id: instanceName }, // instanceName deve ser o workspaceId
        select: { evolution_api_endpoint: true } // Apenas para verificar se o workspace existe, ou poderia usar o slug
    });
    
    if (workspace) {
        // Opcional: Limpar campos relacionados à Evolution API no nosso banco de dados
        // await prisma.workspace.update({
        //   where: { id: instanceName },
        //   data: {
        //     evolution_api_instance_id: null, // Se você estiver armazenando isso
        //     evolution_api_instance_name: null, 
        //     // Manter endpoint e apikey? Ou limpar também?
        //   }
        // });
        revalidatePath(`/workspace/${instanceName}/integrations/evolution`); // ou o path correto
        console.log(`[ACTION deleteEvolutionInstanceAction] Path revalidado para workspace ${instanceName}`);
    }


    return { success: true };

  } catch (error: any) {
    console.error(`[ACTION ERROR] Falha ao deletar instância Evolution ${instanceName}:`, error);
    return { success: false, error: error.message || 'Erro do servidor ao deletar instância.' };
  }
}