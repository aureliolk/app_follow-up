import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { Prisma } from '@prisma/client';

// Helper function to check workspace access
async function hasWorkspaceAccess(workspaceId: string, userId: string) {
  const count = await prisma.workspaceMember.count({
    where: {
      workspace_id: workspaceId,
      user_id: userId,
    },
  });
  
  const isOwner = await prisma.workspace.count({
    where: {
      id: workspaceId,
      owner_id: userId,
    },
  });
  
  return count > 0 || isOwner > 0;
}

// Get a single workspace
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const workspaceId = params.id;
    
    // Check if user has access to this workspace
    const hasAccess = await hasWorkspaceAccess(workspaceId, session.user.id);
    
    if (!hasAccess) {
      return NextResponse.json(
        { message: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    return NextResponse.json(
      { message: 'Failed to fetch workspace' },
      { status: 500 }
    );
  }
}

// Esquema Zod para atualização do Workspace
const workspaceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  lumibot_account_id: z.string().optional().nullable(),
  lumibot_api_token: z.string().optional().nullable(),
});

// Update a workspace
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) { // Verificar ID do usuário também
      return NextResponse.json(
        { message: 'Não autorizado' },
        { status: 401 }
      );
    }

    const workspaceId = params.id;
    const userId = session.user.id; // <<< Pegar userId

    // Check if user has admin permission for this workspace
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN'); // <<< Usar userId

    if (!hasPermission) {
      return NextResponse.json(
        { message: 'Você não tem permissão para atualizar este workspace' },
        { status: 403 }
      );
    }

    const body = await req.json();
    // <<< VALIDAR COM O NOVO SCHEMA >>>
    const validation = workspaceUpdateSchema.safeParse(body);

    if (!validation.success) {
       return NextResponse.json(
         { message: 'Dados inválidos', errors: validation.error.errors },
         { status: 400 }
       );
    }
    const { name, slug, lumibot_account_id, lumibot_api_token } = validation.data; // <<< Extrair novos campos

    // If slug is being updated, check it's not already taken... (manter como está)
    if (slug) {
       // ... lógica de verificação do slug ...
    }

    // <<< ATUALIZAR DADOS NO PRISMA >>>
    const dataToUpdate: Prisma.WorkspaceUpdateInput = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (slug !== undefined) dataToUpdate.slug = slug;
    if (lumibot_account_id !== undefined) dataToUpdate.lumibot_account_id = lumibot_account_id;
    // Só atualiza o token se um novo valor foi enviado no body
    if (lumibot_api_token !== undefined) dataToUpdate.lumibot_api_token = lumibot_api_token;


    // Verificar se há algo para atualizar
    if (Object.keys(dataToUpdate).length === 0) {
        // Se não houver dados válidos para atualizar, podemos retornar um 200 OK ou 304 Not Modified
         return NextResponse.json({ message: 'Nenhuma alteração detectada.' }, { status: 200 });
    }


    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: dataToUpdate,
       // Selecionar os campos atualizados para retornar, excluindo o token por segurança
      select: {
         id: true,
         name: true,
         slug: true,
         owner_id: true,
         created_at: true,
         updated_at: true,
         lumibot_account_id: true, // Retorna o ID da conta
         // Não retornar lumibot_api_token
         _count: { select: { members: true } },
         owner: { select: { id: true, name: true, email: true } }
      }
    });

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Erro ao atualizar workspace:', error);

    if (error instanceof z.ZodError) { // Já tratado pela validação safeParse
       return NextResponse.json(
         { message: 'Dados inválidos', errors: error.errors },
         { status: 400 }
       );
    }

    // Tratar outros erros do Prisma (ex: P2002 para slug duplicado)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
         if (error.code === 'P2002') {
             return NextResponse.json({ message: 'O slug fornecido já está em uso.' }, { status: 409 });
         }
    }

    return NextResponse.json(
      { message: 'Falha ao atualizar workspace' },
      { status: 500 }
    );
  }
}

// Delete a workspace
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const workspaceId = params.id;
    
    // Check if user is the owner of this workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    
    if (!workspace) {
      return NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      );
    }
    
    if (workspace.owner_id !== session.user.id) {
      return NextResponse.json(
        { message: 'Only the workspace owner can delete it' },
        { status: 403 }
      );
    }

    // Delete workspace (cascade will handle members and invitations)
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json(
      { message: 'Workspace deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return NextResponse.json(
      { message: 'Failed to delete workspace' },
      { status: 500 }
    );
  }
}