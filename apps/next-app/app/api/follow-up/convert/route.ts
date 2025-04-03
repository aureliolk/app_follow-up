// app/api/follow-up/convert/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../../packages/shared-lib/src/db';
import { checkPermission } from '../../../../../../packages/shared-lib/src/permissions';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../../packages/shared-lib/src/auth/auth-options';
import { Prisma } from '@prisma/client'; // Importar para tipos de erro

// Schema para validar o corpo da requisição
const convertFollowUpSchema = z.object({
  followUpId: z.string().uuid("ID de Follow-up inválido."),
});

// Definir o status de conversão (use um Enum se preferir)
const CONVERTED_STATUS = "CONVERTED"; // << Mude se usar outro nome para o status finalizado com sucesso

export async function POST(req: NextRequest) {
  console.log(`[API /convert] Recebida requisição para marcar FollowUp como convertido.`);

  try {
    // 1. Autenticação
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn("[API /convert] Acesso não autorizado (sem sessão).");
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Validação do Input
    const body = await req.json();
    const validation = convertFollowUpSchema.safeParse(body);

    if (!validation.success) {
      console.warn("[API /convert] Dados inválidos:", validation.error.errors);
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { followUpId } = validation.data;
    console.log(`[API /convert] Tentando converter FollowUp ID: ${followUpId}`);

    // 3. Buscar FollowUp e Workspace ID para Autorização
    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
      select: {
        id: true,
        status: true, // Para verificar se já está finalizado
        campaign: {   // Navega até a campanha
          select: {
            workspaces: { // Navega até a tabela de junção
              select: {
                workspace_id: true // Pega o ID do workspace associado
              },
              take: 1 // Assume 1 workspace por campanha neste contexto
            }
          }
        }
      }
    });

    if (!followUp) {
      console.warn(`[API /convert] FollowUp ${followUpId} não encontrado.`);
      return NextResponse.json({ success: false, error: 'Follow-up não encontrado' }, { status: 404 });
    }

    const workspaceId = followUp.campaign?.workspaces?.[0]?.workspace_id;
    if (!workspaceId) {
      // Isso indica um problema de integridade de dados ou configuração
      console.error(`[API /convert] Não foi possível determinar o Workspace ID para FollowUp ${followUpId} através da Campanha.`);
      return NextResponse.json({ success: false, error: 'Erro interno: Workspace não associado ao follow-up.' }, { status: 500 });
    }
    console.log(`[API /convert] FollowUp ${followUpId} pertence ao Workspace ${workspaceId}. Verificando permissão...`);

    // 4. Autorização (Permissão no Workspace)
    // Definir qual role mínima pode marcar como convertido (MEMBER parece razoável)
    const requiredRole = 'MEMBER';
    const hasPermission = await checkPermission(workspaceId, userId, requiredRole);
    if (!hasPermission) {
      console.warn(`[API /convert] Usuário ${userId} não tem permissão (${requiredRole}) no Workspace ${workspaceId}.`);
      return NextResponse.json({ success: false, error: 'Permissão negada para modificar este follow-up.' }, { status: 403 });
    }
    console.log(`[API /convert] Usuário ${userId} tem permissão.`);

    // 5. Verificar Status Atual (Evitar update desnecessário)
    const terminalStatuses = [CONVERTED_STATUS, 'COMPLETED', 'CANCELLED', 'FAILED']; // Status que indicam fim
    if (terminalStatuses.includes(followUp.status.toUpperCase())) {
        console.log(`[API /convert] FollowUp ${followUpId} já está em um estado terminal (${followUp.status}). Nenhuma ação necessária.`);
        return NextResponse.json({ success: true, message: `Follow-up já estava finalizado como ${followUp.status}.` });
    }

    // 6. Atualizar o FollowUp
    console.log(`[API /convert] Atualizando status do FollowUp ${followUpId} para ${CONVERTED_STATUS}.`);
    const updatedFollowUp = await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status: CONVERTED_STATUS,
        next_sequence_message_at: null, // Limpa agendamento futuro (importante!)
        // Opcional: Adicionar completed_at se fizer sentido para CONVERTED
        // completed_at: new Date(),
      },
      select: { id: true, status: true } // Retorna apenas o necessário
    });

    console.log(`[API /convert] FollowUp ${updatedFollowUp.id} atualizado com sucesso para ${updatedFollowUp.status}.`);

    // 7. Resposta de Sucesso
    return NextResponse.json({
      success: true,
      message: 'Follow-up marcado como convertido com sucesso.',
      data: {
        id: updatedFollowUp.id,
        status: updatedFollowUp.status,
      }
    });

  } catch (error) {
    console.error('[API /convert] Erro inesperado:', error);
    // Tratamento genérico de erro
    let statusCode = 500;
    let errorMessage = 'Erro interno do servidor ao processar a requisição.';

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Erros conhecidos do Prisma (ex: registro não encontrado P2025, embora já checado)
       if (error.code === 'P2025') {
         statusCode = 404;
         errorMessage = 'Follow-up não encontrado durante a atualização.';
       }
    } else if (error instanceof z.ZodError) { // Caso a validação falhe de outra forma
        statusCode = 400;
        errorMessage = 'Erro de validação nos dados fornecidos.';
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: statusCode });
  }
}