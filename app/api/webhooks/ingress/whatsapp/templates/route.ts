// app/api/webhooks/ingress/whatsapp/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db'; // <<< Descomentar Prisma
import { decrypt } from '@/lib/encryption'; // <<< CORRIGIDO: usar decrypt
import { WhatsappTemplate } from '@/app/types'; // <<< Importar tipo de app/types
import { Prisma } from '@prisma/client'; // <<< Importar tipos Prisma para error handling

// Mock Data removido

export async function GET(req: NextRequest) {
  console.log("[API GET .../whatsapp/templates] Request received."); 
  try {
    // 1. Autenticação
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn("[API GET .../whatsapp/templates] Unauthorized: No session found.");
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Obter Workspace ID dos parâmetros
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      console.warn("[API GET .../whatsapp/templates] Bad Request: workspaceId query parameter is required.");
      return NextResponse.json({ success: false, error: 'workspaceId query parameter is required' }, { status: 400 });
    }
    console.log(`[API GET .../whatsapp/templates] Request for workspaceId: ${workspaceId} by user: ${userId}`);

    // 3. Verificar Permissão (VIEWER)
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER'); 
    if (!hasAccess) {
        console.warn(`[API GET .../whatsapp/templates] User ${userId} forbidden for workspace ${workspaceId}.`);
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    console.log(`[API GET .../whatsapp/templates] User ${userId} has permission for workspace ${workspaceId}.`);

    // 4. Buscar Credenciais do Workspace
    let workspace;
    try {
      workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: {
          whatsappBusinessAccountId: true,
          whatsappAccessToken: true,
          // Adicionar outros campos se necessário no futuro
        },
      });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
            console.error(`[API GET .../whatsapp/templates] Workspace not found: ${workspaceId}`);
            return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
        } else {
            console.error(`[API GET .../whatsapp/templates] Error fetching workspace ${workspaceId}:`, e);
            // Lançar para o catch externo
            throw e; 
        }
    }

    const wabaId = workspace.whatsappBusinessAccountId;
    const encryptedToken = workspace.whatsappAccessToken;

    if (!wabaId || !encryptedToken) {
      console.error(`[API GET .../whatsapp/templates] Missing WABA ID or Token for workspace: ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'WhatsApp integration not configured for this workspace.' }, { status: 400 }); // Bad Request ou 500?
    }

    let accessToken;
    try {
      accessToken = decrypt(encryptedToken); // <<< CORRIGIDO: usar decrypt
    } catch (decryptionError) {
      console.error(`[API GET .../whatsapp/templates] Failed to decrypt token for workspace ${workspaceId}:`, decryptionError);
      return NextResponse.json({ success: false, error: 'Failed to process WhatsApp credentials.' }, { status: 500 });
    }

    if (!accessToken) {
        console.error(`[API GET .../whatsapp/templates] Decrypted token is empty for workspace: ${workspaceId}`);
        return NextResponse.json({ success: false, error: 'Invalid WhatsApp credentials configuration.' }, { status: 500 });
    }

    console.log(`[API GET .../whatsapp/templates] Successfully retrieved and decrypted credentials for WABA ID: ${wabaId}`);

    // 5. Chamar API da Meta para buscar templates
    const metaApiUrl = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=name,language,category,components,status&limit=100&access_token=${accessToken}`;
    // Nota: Adicionamos status ao fields e removemos filter por status aprovado da URL, faremos o filtro no código.
    // O limit=100 pode precisar de paginação se houver mais templates.

    let metaApiResponse;
    try {
      console.log(`[API GET .../whatsapp/templates] Fetching templates from Meta API for WABA ID: ${wabaId}`);
      metaApiResponse = await fetch(metaApiUrl, {
        method: 'GET',
        headers: {
           // O token agora está na URL, não precisamos do Header Authorization
           // 'Authorization': `Bearer ${accessToken}`, 
          'Content-Type': 'application/json',
        },
         // Adicionar cache revalidate se apropriado, ex: cada 1 hora
        next: { revalidate: 3600 } 
      });

      if (!metaApiResponse.ok) {
        const errorBody = await metaApiResponse.text(); // Ler como texto para evitar erro de JSON
        console.error(`[API GET .../whatsapp/templates] Meta API request failed for WABA ${wabaId}. Status: ${metaApiResponse.status}. Body: ${errorBody}`);
        throw new Error(`Meta API Error (${metaApiResponse.status}): Failed to fetch templates.`);
      }

      const metaData = await metaApiResponse.json();
      console.log(`[API GET .../whatsapp/templates] Meta API response received for WABA ID: ${wabaId}. Found ${metaData?.data?.length || 0} raw templates.`);
      
      // 6. Mapear e Filtrar a resposta da Meta
      const approvedTemplates: WhatsappTemplate[] = [];
      if (metaData?.data && Array.isArray(metaData.data)) {
        metaData.data.forEach((template: any) => {
          // Filtrar por status APROVADO
          if (template.status !== 'APPROVED') {
            return; // Pula para o próximo template
          }

          // Encontrar o componente BODY
          const bodyComponent = template.components?.find((comp: any) => comp.type === 'BODY');
          const bodyText = bodyComponent?.text || ''; // Pega o texto do body ou string vazia

           // Pular templates sem body? Ou permitir? Por ora, permitimos.
          // if (!bodyText) {
          //   console.warn(`[API GET .../whatsapp/templates] Template ${template.name} (${template.language}) skipped: No BODY component found.`);
          //   return;
          // }

          // Criar objeto no nosso formato
          approvedTemplates.push({
            id: template.id, // Usar ID da Meta
            name: template.name,
            language: template.language,
            category: template.category,
            body: bodyText, // Mapeado do componente BODY
          });
        });
      }

      // 7. Retornar Resposta com os templates mapeados
      console.log(`[API GET .../whatsapp/templates] Returning ${approvedTemplates.length} APPROVED templates for workspace ${workspaceId}`);
      return NextResponse.json({ success: true, data: approvedTemplates });

    } catch (fetchError: any) {
       // Erro pode ser da chamada fetch ou do processamento do JSON/mapeamento
       console.error(`[API GET .../whatsapp/templates] Error during Meta API call or processing for WABA ${wabaId}:`, fetchError.message || fetchError);
       // Retornar um erro genérico para o cliente, mas logamos o detalhe
       return NextResponse.json({ success: false, error: 'Failed to retrieve WhatsApp templates.' }, { status: 500 });
    }

  } catch (error: any) {
    // Este catch pega erros da autenticação, permissão, busca no DB ou descriptografia
    console.error("[API GET .../whatsapp/templates] Generic Error (Outer Catch):", error.message || error);
    // Evitar expor detalhes do erro interno, usar o erro já formatado se possível ou um genérico
    const errorMessage = error.message.includes('Workspace not found') ? 'Workspace not found' 
                       : error.message.includes('credentials') ? 'Failed to process credentials' 
                       : 'Internal Server Error';
     const errorStatus = error.message.includes('Workspace not found') ? 404 : 500; // Ajustar status se necessário

    return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  }
}