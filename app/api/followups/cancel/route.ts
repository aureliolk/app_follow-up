import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { FollowUpStatus, Prisma } from '@prisma/client'; // Import Prisma para error handling

// Esquema de validação para o corpo da requisição
const cancelFollowUpSchema = z.object({
  workspaceId: z.string().min(1, "Workspace ID é obrigatório"),
  clientId: z.string().min(1, "Client ID é obrigatório"),
  // Opcional: Adicionar um status final desejado se necessário
  // finalStatus: z.enum([FollowUpStatus.CONVERTED, FollowUpStatus.CANCELLED]).optional().default(FollowUpStatus.CANCELLED),
});

export async function POST(req: NextRequest) {
  console.log("API POST /api/followups/cancel: Request received.");
  try {
    const apiKey = req.headers.get('x-api-key');
    let isAuthenticatedViaApiKey = false;
    let userId: string | null = null;

    // --- Parse e validação do corpo da requisição (necessário antes para API key) ---
    let parsedBody;
    try {
      // Clonar a requisição para ler o corpo duas vezes se necessário (API key vs Session)
      const body = await req.clone().json(); 
      parsedBody = cancelFollowUpSchema.parse(body);
      console.log(`API POST /api/followups/cancel: Parsed body:`, parsedBody);
    } catch (error) {
      console.warn("API POST /api/followups/cancel: Invalid request body:", error);
      return NextResponse.json({ success: false, error: 'Dados inválidos na requisição', details: (error as z.ZodError).errors }, { status: 400 });
    }
    const { workspaceId, clientId } = parsedBody;
    const finalStatus = FollowUpStatus.CONVERTED;

    // --- Tentar Autenticação via API Key --- 
    if (apiKey) {
      console.log(`API POST /api/followups/cancel: Attempting authentication via API key.`);
      try {
        const tokenRecord = await prisma.workspaceApiToken.findFirst({
          where: {
            token: apiKey,
            workspace_id: workspaceId, // Validar contra o workspace da requisição
            revoked: false,
            OR: [
              { expires_at: null },
              { expires_at: { gt: new Date() } }
            ]
          },
          select: { id: true } // Selecionar apenas o ID para confirmação e update
        });

        if (tokenRecord) {
          console.log(`API POST /api/followups/cancel: Authentication successful via API key for workspace ${workspaceId}. Token ID: ${tokenRecord.id}`);
          isAuthenticatedViaApiKey = true;
          // Atualizar último uso do token (sem falhar a requisição principal se isso der erro)
          prisma.workspaceApiToken.update({
            where: { id: tokenRecord.id },
            data: { last_used_at: new Date() }
          }).catch(err => {
            console.error(`API POST /api/followups/cancel: Failed to update last_used_at for token ${tokenRecord.id}`, err);
          });
        } else {
          console.warn(`API POST /api/followups/cancel: Invalid or expired API key provided for workspace ${workspaceId}.`);
          // Não retornar erro ainda, pode tentar autenticação por sessão
        }
      } catch (error) {
        console.error('API POST /api/followups/cancel: Error validating API key:', error);
        // Tratar erro na validação da chave, mas não necessariamente falhar a requisição ainda
      }
    }

    // --- Se não autenticado via API Key, tentar Autenticação via Sessão --- 
    if (!isAuthenticatedViaApiKey) {
      console.log(`API POST /api/followups/cancel: API key not provided or invalid. Attempting session authentication.`);
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        console.warn("API POST /api/followups/cancel: Unauthorized - No session found and API key invalid/missing.");
        return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
      }
      userId = session.user.id;
      console.log(`API POST /api/followups/cancel: Session authentication successful for user ${userId}.`);

      // --- Verificar Permissão (Apenas para autenticação via sessão) ---
      console.log(`API POST /api/followups/cancel: Checking permission for user ${userId} on workspace ${workspaceId}`);
      const hasAccess = await checkPermission(workspaceId, userId, 'MEMBER');
      if (!hasAccess) {
        console.warn(`API POST /api/followups/cancel: Forbidden - User ${userId} lacks MEMBER permission on workspace ${workspaceId}.`);
        return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });
      }
      console.log(`API POST /api/followups/cancel: User ${userId} has permission.`);
    } else {
      // Log para indicar que a verificação de permissão foi pulada devido à API Key
      console.log(`API POST /api/followups/cancel: Skipping permission check due to valid API key authentication.`);
    }

    // --- Lógica Principal: Cancelar Follow-up (Executa se API Key ou Sessão+Permissão forem válidos) ---
    console.log(`API POST /api/followups/cancel: Searching for active follow-up for client ${clientId} in workspace ${workspaceId}`);
    const activeFollowUp = await prisma.followUp.findFirst({
      where: {
        workspace_id: workspaceId,
        client_id: clientId,
        status: {
          in: [FollowUpStatus.ACTIVE, FollowUpStatus.PAUSED],
        },
      },
      select: { id: true, status: true },
    });

    if (!activeFollowUp) {
      console.log(`API POST /api/followups/cancel: No active follow-up found for client ${clientId}.`);
      return NextResponse.json({ success: true, message: 'Nenhum follow-up ativo encontrado ou já foi cancelado/concluído.' });
    }

    console.log(`API POST /api/followups/cancel: Found active follow-up ${activeFollowUp.id}. Current status: ${activeFollowUp.status}. Updating to ${finalStatus}...`);

    const updatedFollowUp = await prisma.followUp.update({
      where: {
        id: activeFollowUp.id,
      },
      data: {
        status: finalStatus,
        next_sequence_message_at: null,
        updated_at: new Date(),
      },
      select: { id: true, status: true }
    });

    console.log(`API POST /api/followups/cancel: Follow-up ${updatedFollowUp.id} updated successfully to status ${updatedFollowUp.status}.`);

    return NextResponse.json({ success: true, message: 'Follow-up cancelado com sucesso.', data: updatedFollowUp });

  } catch (error) {
    console.error('API POST /api/followups/cancel: Internal error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(`API POST /api/followups/cancel: Prisma Error Code - ${error.code}`, error.message);
        return NextResponse.json({ success: false, error: 'Erro no banco de dados ao cancelar follow-up.' }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'Erro interno ao cancelar follow-up' }, { status: 500 });
  }
} 