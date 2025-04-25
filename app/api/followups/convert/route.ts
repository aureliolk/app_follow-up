import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { FollowUpStatus, Prisma } from '@prisma/client'; // Import Prisma para error handling
import { standardizeBrazilianPhoneNumber } from '@/lib/phoneUtils'; // <<< Importar função
import { markFollowUpConverted } from '@/lib/services/followUpService'; // <<< Importar a função do serviço

// Esquema de validação para o corpo da requisição
const convertFollowUpSchema = z.object({
  workspaceId: z.string().min(1, "Workspace ID é obrigatório"),
  clientPhoneNumber: z.string().min(1, "Número do cliente é obrigatório"),
});

export async function POST(req: NextRequest) {
  console.log("API POST /api/followups/convert: Request received.");
  try {
    const apiKey = req.headers.get('x-api-key');
    let isAuthenticatedViaApiKey = false;
    let userId: string | null = null;

    // --- Parse e validação do corpo da requisição (necessário antes para API key) ---
    let parsedBody : z.infer<typeof convertFollowUpSchema>;
    try {
      // Clonar a requisição para ler o corpo duas vezes se necessário (API key vs Session)
      const body = await req.clone().json(); 
      parsedBody = convertFollowUpSchema.parse(body);
      console.log(`API POST /api/followups/convert: Parsed body:`, parsedBody);
    } catch (error) {
      console.warn("API POST /api/followups/convert: Invalid request body:", error);
      return NextResponse.json({ success: false, error: 'Dados inválidos na requisição', details: (error as z.ZodError).errors }, { status: 400 });
    }
    const { workspaceId, clientPhoneNumber: rawPhoneNumber } = parsedBody;
    const finalStatus = FollowUpStatus.CONVERTED;

    // --- Tentar Autenticação via API Key --- 
    if (apiKey) {
      console.log(`API POST /api/followups/convert: Attempting authentication via API key.`);
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
          console.log(`API POST /api/followups/convert: Authentication successful via API key for workspace ${workspaceId}. Token ID: ${tokenRecord.id}`);
          isAuthenticatedViaApiKey = true;
          // Atualizar último uso do token (sem falhar a requisição principal se isso der erro)
          prisma.workspaceApiToken.update({
            where: { id: tokenRecord.id },
            data: { last_used_at: new Date() }
          }).catch(err => {
            console.error(`API POST /api/followups/convert: Failed to update last_used_at for token ${tokenRecord.id}`, err);
          });
        } else {
          console.warn(`API POST /api/followups/convert: Invalid or expired API key provided for workspace ${workspaceId}.`);
          // Não retornar erro ainda, pode tentar autenticação por sessão
        }
      } catch (error) {
        console.error('API POST /api/followups/convert: Error validating API key:', error);
        // Tratar erro na validação da chave, mas não necessariamente falhar a requisição ainda
      }
    }

    // --- Se não autenticado via API Key, tentar Autenticação via Sessão --- 
    if (!isAuthenticatedViaApiKey) {
      console.log(`API POST /api/followups/convert: API key not provided or invalid. Attempting session authentication.`);
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        console.warn("API POST /api/followups/convert: Unauthorized - No session found and API key invalid/missing.");
        return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
      }
      userId = session.user.id;
      console.log(`API POST /api/followups/convert: Session authentication successful for user ${userId}.`);

      // --- Verificar Permissão (Apenas para autenticação via sessão) ---
      console.log(`API POST /api/followups/convert: Checking permission for user ${userId} on workspace ${workspaceId}`);
      const hasAccess = await checkPermission(workspaceId, userId, 'MEMBER');
      if (!hasAccess) {
        console.warn(`API POST /api/followups/convert: Forbidden - User ${userId} lacks MEMBER permission on workspace ${workspaceId}.`);
        return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });
      }
      console.log(`API POST /api/followups/convert: User ${userId} has permission.`);
    } else {
      // Log para indicar que a verificação de permissão foi pulada devido à API Key
      console.log(`API POST /api/followups/convert: Skipping permission check due to valid API key authentication.`);
    }

    // --- Lógica Principal: Cancelar Follow-up (Executa se API Key ou Sessão+Permissão forem válidos) ---
    // <<< ALTERAÇÃO: Padronizar número e buscar Cliente >>>
    const clientPhoneNumber = standardizeBrazilianPhoneNumber(rawPhoneNumber);
    if (!clientPhoneNumber) {
        console.warn(`API POST /api/followups/convert: Invalid phone number provided: ${rawPhoneNumber}`);
        return NextResponse.json({ success: false, error: 'Número de telefone inválido.' }, { status: 400 });
    }
    console.log(`API POST /api/followups/convert: Standardized phone number: ${clientPhoneNumber}. Searching for client in workspace ${workspaceId}`);

    // <<< ALTERNATIVA: Usar findFirst para evitar problemas com nome de índice composto >>>
    const client = await prisma.client.findFirst({
      where: {
        workspace_id: workspaceId,
        phone_number: clientPhoneNumber,
      },
      select: { id: true },
    });

    if (!client) {
      console.warn(`API POST /api/followups/convert: Client not found for phone ${clientPhoneNumber} in workspace ${workspaceId}.`);
      return NextResponse.json({ success: false, error: 'Cliente não encontrado neste workspace com o telefone fornecido.' }, { status: 404 });
    }
    const clientId = client.id;
    console.log(`API POST /api/followups/convert: Found client ID: ${clientId}`);
    
    // Buscar Follow-up ativo ou pausado (APENAS PARA OBTER O ID)
    console.log(`API POST /api/followups/convert: Searching for active/paused follow-up for client ${clientId} to get its ID...`);
    const activeFollowUp = await prisma.followUp.findFirst({
      where: {
        workspace_id: workspaceId,
        client_id: clientId, 
        status: {
          in: [FollowUpStatus.ACTIVE, FollowUpStatus.PAUSED],
        },
      },
      select: { id: true }, // <<< Selecionar apenas o ID
    });

    if (!activeFollowUp) {
      console.log(`API POST /api/followups/convert: No active or paused follow-up found for client ${clientId}.`);
      return NextResponse.json({ success: true, message: 'Nenhum follow-up ativo ou pausado encontrado para este cliente.' });
    }
    const followUpIdToConvert = activeFollowUp.id;
    console.log(`API POST /api/followups/convert: Found follow-up ID to convert: ${followUpIdToConvert}`);

    // <<< CHAMAR O SERVIÇO PARA CONVERTER E REMOVER JOBS >>>
    const updatedFollowUpResult = await markFollowUpConverted(followUpIdToConvert);

    if (updatedFollowUpResult) {
        console.log(`API POST /api/followups/convert: Follow-up ${updatedFollowUpResult.id} processed by service. Final status: ${updatedFollowUpResult.status}.`);
        return NextResponse.json({ 
            success: true, 
            message: `Follow-up ${updatedFollowUpResult.status === FollowUpStatus.CONVERTED ? 'marcado como convertido' : 'processado (status atual: ' + updatedFollowUpResult.status + ')'} com sucesso.`, 
            data: updatedFollowUpResult 
        });
    } else {
         console.warn(`API POST /api/followups/convert: Follow-up ${followUpIdToConvert} não foi encontrado pelo serviço (pode ter sido alterado por outro processo).`);
         // Retornar sucesso, pois a intenção era converter algo que não está mais no estado esperado ou não existe.
         return NextResponse.json({ success: true, message: 'Follow-up não encontrado ou já estava em estado final.' });
    }

  } catch (error) {
    console.error('API POST /api/followups/convert: Internal error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(`API POST /api/followups/convert: Prisma Error Code - ${error.code}`, error.message);
        return NextResponse.json({ success: false, error: 'Erro no banco de dados ao processar conversão de follow-up.' }, { status: 500 });
    } else if (error instanceof Error) {
        // Capturar outros erros (ex: do followUpService)
         return NextResponse.json({ success: false, error: `Erro ao processar conversão: ${error.message}` }, { status: 500 });
    } else {
        return NextResponse.json({ success: false, error: 'Erro interno desconhecido ao converter follow-up' }, { status: 500 });
    }
  }
} 