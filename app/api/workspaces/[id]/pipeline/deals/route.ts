import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth/auth-utils';
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';
import { Prisma } from '@prisma/client';

// Reutilizaremos ou adaptaremos a lógica de permissão aqui

// Helper simplificado para verificar permissão (igual ao de stages)
async function checkPermission(
  request: NextRequest,
  workspaceId: string
): Promise<{ userId: string | null; errorResponse: NextResponse | null }> {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { success: false, error: 'Não autorizado' },
        { status: 401 }
      ),
    };
  }
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspace_id: workspaceId, user_id: userId },
  });
  let isOwner = false;
  if (!membership) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true },
    });
    if (workspace?.owner_id === userId) isOwner = true;
  }
  if (!membership && !isOwner) {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { success: false, error: 'Acesso proibido a este workspace' },
        { status: 403 }
      ),
    };
  }
  return { userId, errorResponse: null };
}

// GET handler envolvido pelo middleware
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
      const awaitedParams = await params;
      const workspaceIdFromUrl = awaitedParams.id;

      if (!workspaceIdFromUrl) {
        return NextResponse.json(
          { success: false, error: 'Workspace ID é obrigatório na URL' },
          { status: 400 }
        );
      }

      if (workspaceIdFromToken && workspaceIdFromToken !== workspaceIdFromUrl) {
          return NextResponse.json(
            { success: false, error: 'Token de API não pertence a este workspace' },
            { status: 403 }
          );
      }
      const workspaceId = workspaceIdFromUrl;

      try {
        // Verificar autenticação
        const userId = await getCurrentUserId(authedReq);
        if (!userId && !workspaceIdFromToken) {
          return NextResponse.json(
            { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
            { status: 401 }
          );
        }

        // Verificar permissão do usuário (se via sessão)
        if (userId) {
            const membership = await prisma.workspaceMember.findFirst({
              where: { workspace_id: workspaceId, user_id: userId },
            });
            let isOwner = false;
            if (!membership) {
              const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId }, select: { owner_id: true },
              });
              if (workspace?.owner_id === userId) isOwner = true;
            }
            if (!membership && !isOwner) {
              return NextResponse.json(
                { success: false, error: 'Acesso proibido a este workspace (permissão de usuário)' },
                { status: 403 }
              );
            }
        }

        // Filtrar por stageId (opcional)
        const { searchParams } = new URL(authedReq.url);
        const stageId = searchParams.get('stageId');

        // Buscar os Deals
        const deals = await prisma.deal.findMany({
          where: {
            workspace_id: workspaceId,
            ...(stageId && { stage_id: stageId }),
          },
          include: {
            stage: true,
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            client: {
              select: {
                id: true,
                name: true,
                phone_number: true,
              },
            }
          },
          orderBy: [
            { stage: { order: 'asc' } }, // Ordena primeiro pela ordem do stage
            { createdAt: 'desc' }       // Ordena pela data de criação como fallback
          ],
        });

        return NextResponse.json({ success: true, data: deals }, { status: 200 });

      } catch (error) {
        console.error('Erro ao buscar deals do pipeline:', error);
        return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
      }
  });
}

// POST handler envolvido pelo middleware
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
   return withApiTokenAuth(request, async (authedReq, workspaceIdFromToken) => {
      const awaitedParams = await params;
      const workspaceIdFromUrl = awaitedParams.id;

      if (!workspaceIdFromUrl) {
        return NextResponse.json(
          { success: false, error: 'Workspace ID é obrigatório na URL' },
          { status: 400 }
        );
      }

      if (workspaceIdFromToken && workspaceIdFromToken !== workspaceIdFromUrl) {
          return NextResponse.json(
            { success: false, error: 'Token de API não pertence a este workspace' },
            { status: 403 }
          );
      }
      const workspaceId = workspaceIdFromUrl;

      try {
        // Verificar autenticação
        const userId = await getCurrentUserId(authedReq);
         if (!userId && !workspaceIdFromToken) {
           return NextResponse.json(
             { success: false, error: 'Não autorizado (requer sessão ou token de API válido)' },
             { status: 401 }
           );
         }

        // Verificar permissão do usuário (se via sessão)
        let userWhoCreatesId: string | null = null; // Guardar ID para created_by_id
        if (userId) {
             userWhoCreatesId = userId;
            const membership = await prisma.workspaceMember.findFirst({
              where: { workspace_id: workspaceId, user_id: userId },
            });
            let isOwner = false;
            if (!membership) {
              const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId }, select: { owner_id: true },
              });
              if (workspace?.owner_id === userId) isOwner = true;
            }
            if (!membership && !isOwner) {
              return NextResponse.json(
                { success: false, error: 'Acesso proibido para criar deal (permissão de usuário)' },
                { status: 403 }
              );
            }
        } else {
            // TODO: Lógica para created_by_id via token API
            console.warn('Criação de Deal via API Token: created_by_id não será definido.');
        }

        // Extrair e validar corpo
        const body = await authedReq.json();
        const {
          title, stageId, value, assignedToId, clientId, /* source */
        } = body;

        // Validação de title e stageId (simplificado, adicione tratamento de erro se necessário)
        if (!title || typeof title !== 'string') { return NextResponse.json({ error: 'Título inválido' }, { status: 400 }); }
        if (!stageId || typeof stageId !== 'string') { return NextResponse.json({ error: 'StageId inválido' }, { status: 400 }); }

        // Validar stageId, assignedToId, clientId (simplificado)
        const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId, workspace_id: workspaceId } });
        if (!stage) { return NextResponse.json({ error: 'Estágio inválido' }, { status: 400 }); }

        if (assignedToId) {
          const assignedUser = await prisma.user.findUnique({ where: { id: assignedToId } });
          if (!assignedUser) { return NextResponse.json({ error: 'Usuário responsável inválido' }, { status: 400 }); }
        }
        if (clientId) {
          const client = await prisma.client.findUnique({ where: { id: clientId, workspace_id: workspaceId } });
          if (!client) { return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 }); }
        }

        // Criar o Deal (ajustando a estrutura do createData)
        const createData: Prisma.DealCreateInput = {
            name: title, // O campo no schema é 'name', não 'title'
            value: value ? parseFloat(value) : null,
            // probability, expectedCloseDate, source poderiam ser adicionados aqui se necessário
            workspace: { connect: { id: workspaceId } },
            stage: { connect: { id: stageId } },
            client: clientId ? { connect: { id: clientId } } : undefined,
            assignedTo: assignedToId ? { connect: { id: assignedToId } } : undefined,
            // ai_controlled: true, // Definir valor padrão se necessário
            // Não há campo 'created_by_id' ou 'createdBy' no schema Deal fornecido
        };

        const newDeal = await prisma.deal.create({
          data: createData,
          include: {
            stage: true,
            assignedTo: { select: { id: true, name: true, email: true, image: true } },
            client: { select: { id: true, name: true, phone_number: true } }
          },
        });

        return NextResponse.json({ success: true, data: newDeal }, { status: 201 });

      } catch (error) {
        console.error('Erro ao criar deal:', error);
        if (error instanceof SyntaxError) {
          return NextResponse.json(
            { success: false, error: 'JSON inválido no corpo da requisição' },
            { status: 400 }
          );
        }
        // Adicionar tratamento de erro Prisma específico se necessário
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
           if (error.code === 'P2002') {
                return NextResponse.json({ success: false, error: 'Erro: Violação de restrição única.' }, { status: 409 });
            }
        }
        return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
      }
  });
} 