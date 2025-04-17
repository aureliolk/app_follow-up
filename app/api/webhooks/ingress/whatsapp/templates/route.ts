// app/api/webhooks/ingress/whatsapp/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from '@/lib/permissions';
import { decrypt } from '@/lib/encryption';
import { WhatsappTemplate } from '@/app/types';
import { Prisma } from '@prisma/client';
import axios from 'axios';

export async function GET(req: NextRequest) {
  console.log("[API GET .../whatsapp/templates] Request received."); 
  try {
    // 1. Autenticação e Autorização via Sessão do Usuário
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.warn("[API GET .../whatsapp/templates] Unauthorized: No session found.");
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

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
      accessToken = decrypt(encryptedToken);
      if (!accessToken) throw new Error("Decrypted token is empty");
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
    const apiUrl = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        limit: 100,
      },
    });

    // 6. Mapear e Filtrar a resposta da Meta
    const approvedTemplates: WhatsappTemplate[] = [];
    if (response.data?.data && Array.isArray(response.data.data)) {
      response.data.data.forEach((template: any) => {
        // Filtrar por status APROVADO
        if (template.status !== 'APPROVED') {
          return; // Pula para o próximo template
        }

        // Encontrar o componente BODY
        const bodyComponent = template.components?.find((comp: any) => comp.type === 'BODY');
        const bodyText = bodyComponent?.text || ''; // Pega o texto do body ou string vazia

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

  } catch (error: any) {
    // Este catch pega erros da autenticação, permissão, busca no DB ou descriptografia
    console.error("[API GET .../whatsapp/templates] Generic Error (Outer Catch):", error.response?.data || error.message);
    // Evitar expor detalhes do erro interno, usar o erro já formatado se possível ou um genérico
    const errorMessage = error.response?.data?.error?.message || "Internal Server Error";
    const errorStatus = error.response?.status || 500; // Ajustar status se necessário

    return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  }
}