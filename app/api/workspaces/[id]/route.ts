// app/api/workspaces/[id]/route.ts
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { Prisma } from '@prisma/client'; // Importar Prisma para tipos de erro

// Helper function ... (manter como está)

// Get a single workspace
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) { // Incluir verificação de ID
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const awaitedParams = await params;
    const workspaceId = awaitedParams.id;
    const userId = session.user.id;

    // Check if user has access to this workspace
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER'); // Usar checkPermission

    if (!hasAccess) {
      return NextResponse.json(
        { message: 'Você não tem acesso a este workspace' },
        { status: 403 }
      );
    }

    // Ajustar select/include para trazer os campos necessários ao contexto
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true, name: true, slug: true, owner_id: true, created_at: true, updated_at: true,
            lumibot_account_id: true,
            ai_default_system_prompt: true,
            ai_model_preference: true,
            owner: { select: { id: true, name: true, email: true } },
            _count: { select: { members: true } },
            members: {
                include: {
                    user: { select: { id: true, name: true, email: true, image: true } }
                }
            }
        }
    });


    if (!workspace) {
      return NextResponse.json(
        { message: 'Workspace não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Erro ao buscar workspace:', error);
    return NextResponse.json(
      { message: 'Falha ao buscar workspace' },
      { status: 500 }
    );
  }
}

// Esquema Zod para atualização ... (manter como está)
const workspaceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  lumibot_account_id: z.string().optional().nullable(),
  lumibot_api_token: z.string().optional().nullable(),
  ai_default_system_prompt: z.string().optional().nullable(),
  ai_model_preference: z.string().optional().nullable(),
});


// Update a workspace
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // <<< ADICIONAR AWAIT AQUI >>>
  await Promise.resolve();

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const { id: workspaceId } = await params;
    const userId = session.user.id;

    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');

    if (!hasPermission) {
      return NextResponse.json(
        { message: 'Você não tem permissão para atualizar este workspace' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validation = workspaceUpdateSchema.safeParse(body);

    if (!validation.success) {
       return NextResponse.json(
         { message: 'Dados inválidos', errors: validation.error.errors },
         { status: 400 }
       );
    }
    const { name, slug, lumibot_account_id, lumibot_api_token, ai_default_system_prompt, ai_model_preference } = validation.data;

    if (slug) {
      const existingWorkspace = await prisma.workspace.findUnique({ where: { slug } });
      if (existingWorkspace && existingWorkspace.id !== workspaceId) {
        return NextResponse.json({ message: 'Workspace slug is already taken' }, { status: 409 });
      }
    }

    const dataToUpdate: Prisma.WorkspaceUpdateInput = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (slug !== undefined) dataToUpdate.slug = slug;
    if (lumibot_account_id !== undefined) dataToUpdate.lumibot_account_id = lumibot_account_id;
    if (lumibot_api_token !== undefined) dataToUpdate.lumibot_api_token = lumibot_api_token;
    if (ai_default_system_prompt !== undefined) dataToUpdate.ai_default_system_prompt = ai_default_system_prompt;
    if (ai_model_preference !== undefined) dataToUpdate.ai_model_preference = ai_model_preference;

    if (Object.keys(dataToUpdate).length === 0) {
         return NextResponse.json({ message: 'Nenhuma alteração detectada.' }, { status: 200 });
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: dataToUpdate,
      select: { // Retorna os dados atualizados (sem o token)
         id: true, name: true, slug: true, owner_id: true, created_at: true, updated_at: true,
         lumibot_account_id: true,
         ai_default_system_prompt: true,
         ai_model_preference: true,
         _count: { select: { members: true } },
         owner: { select: { id: true, name: true, email: true } }
      }
    });

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Erro ao atualizar workspace:', error);
    if (error instanceof z.ZodError) { /* ... */ } // Já coberto pelo safeParse
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
         if (error.code === 'P2002' && error.meta?.target === 'Workspace_slug_key') { // Ser mais específico no erro P2002
             return NextResponse.json({ message: 'O slug fornecido já está em uso.' }, { status: 409 });
         }
    }
    return NextResponse.json({ message: 'Falha ao atualizar workspace' }, { status: 500 });
  }
}

// Delete a workspace
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // <<< ADICIONAR AWAIT AQUI >>>
  await Promise.resolve();

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) { // Incluir verificação de ID
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

   const awaitedParams = await params;
    const workspaceId = awaitedParams.id;
    const userId = session.user.id;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true } // Selecionar apenas o necessário
    });

    if (!workspace) {
      return NextResponse.json({ message: 'Workspace não encontrado' }, { status: 404 });
    }

    // Apenas o proprietário OU um super admin podem excluir
    if (workspace.owner_id !== userId && !session.user.isSuperAdmin) {
      return NextResponse.json(
        { message: 'Apenas o proprietário ou super admin podem excluir o workspace' },
        { status: 403 }
      );
    }

    // Delete workspace (cascade deve cuidar das relações)
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json(
      { message: 'Workspace excluído com sucesso' },
      { status: 200 } // Usar 200 OK para DELETE bem-sucedido é comum (ou 204 No Content)
    );
  } catch (error) {
    console.error('Erro ao excluir workspace:', error);
    // Adicionar tratamento para P2014 (relação necessária não pode ser deletada - pode acontecer se houver dependências não configuradas com cascade)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2014') {
         return NextResponse.json({ message: 'Não é possível excluir o workspace pois existem dados relacionados que impedem a exclusão.' }, { status: 409 }); // Conflict
    }
    return NextResponse.json({ message: 'Falha ao excluir workspace' }, { status: 500 });
  }
}