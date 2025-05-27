// app/api/workspaces/[id]/route.ts
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { Prisma } from '@prisma/client';

// Get a single workspace
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const awaitedParams = await params; // Aguardar a resolução da Promise de params
    const workspaceId = awaitedParams.id;
    const userId = session.user.id;

    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');

    if (!hasAccess) {
      return NextResponse.json(
        { message: 'Você não tem acesso a este workspace' },
        { status: 403 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true, name: true, slug: true, owner_id: true, created_at: true, updated_at: true,
            ai_default_system_prompt: true,
            ai_model_preference: true,
            ai_name: true,
            owner: { select: { id: true, name: true, email: true } },
            _count: { select: { members: true } },
            ai_delay_between_messages: true, // Adicionado para consistência
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

// Esquema Zod para atualização com preprocess
const workspaceUpdateSchema = z.object({
  name: z.string().min(1, "Nome do workspace é obrigatório").optional(),
  slug: z.string().min(1, "Slug é obrigatório").optional(),
  ai_default_system_prompt: z.string().optional().nullable(),
  ai_model_preference: z.string().optional().nullable(),
  ai_name: z.string().min(1, "Nome da IA deve ter pelo menos 1 caractere").max(50).optional().nullable(),
  ai_delay_between_messages: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '') return null; // Trata null, undefined ou string vazia como null
      if (typeof val === 'string') {
        const num = parseInt(val, 10);
        // Retorna o número se for um número válido, senão retorna o valor original para falhar na validação de tipo
        return isNaN(num) ? val : num;
      }
      return val; // Retorna como está se já for número ou outro tipo
    },
    z.number().int("Delay deve ser um número inteiro.")
      .nonnegative("Delay não pode ser negativo.")
      .optional()
      .nullable()
  ),
});


// Update a workspace
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Não é necessário `await Promise.resolve();` aqui, pois `params` é um argumento da função.

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const awaitedParams = await params; // Aguardar a resolução da Promise de params
    const workspaceId = awaitedParams.id;
    const userId = session.user.id;

    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');

    if (!hasPermission) {
      return NextResponse.json(
        { message: 'Você não tem permissão para atualizar este workspace' },
        { status: 403 }
      );
    }

    const body = await req.json();
    console.log("[API PATCH /workspaces/:id] Received body:", JSON.stringify(body, null, 2));

    const validation = workspaceUpdateSchema.safeParse(body);

    if (!validation.success) {
        console.error("[API PATCH /workspaces/:id] Zod validation FAILED. Errors:", JSON.stringify(validation.error.flatten(), null, 2));
        return NextResponse.json({ message: 'Dados inválidos.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const validatedData = validation.data;
    console.log("[API PATCH /workspaces/:id] Validated data (after Zod parse):", JSON.stringify(validatedData, null, 2));


    if (validatedData.slug) {
      const existingWorkspace = await prisma.workspace.findUnique({ where: { slug: validatedData.slug } });
      if (existingWorkspace && existingWorkspace.id !== workspaceId) {
        return NextResponse.json({ message: 'Workspace slug is already taken' }, { status: 409 });
      }
    }

    // Prisma espera que os campos opcionais sejam undefined se não forem alterados,
    // ou null se forem explicitamente definidos como null, ou o valor novo.
    const dataToUpdateForPrisma: Prisma.WorkspaceUpdateInput = {};

    // Só adiciona ao objeto de update se o campo estiver presente nos dados validados
    // e não for undefined (o que significa que foi enviado pelo cliente)
    if ('name' in validatedData && validatedData.name !== undefined) {
        dataToUpdateForPrisma.name = validatedData.name;
    }
    if ('slug' in validatedData && validatedData.slug !== undefined) {
        dataToUpdateForPrisma.slug = validatedData.slug;
    }
    if ('ai_default_system_prompt' in validatedData && validatedData.ai_default_system_prompt !== undefined) {
        dataToUpdateForPrisma.ai_default_system_prompt = validatedData.ai_default_system_prompt;
    }
    if ('ai_model_preference' in validatedData && validatedData.ai_model_preference !== undefined) {
        dataToUpdateForPrisma.ai_model_preference = validatedData.ai_model_preference;
    }
    if ('ai_name' in validatedData && validatedData.ai_name !== undefined) {
        dataToUpdateForPrisma.ai_name = validatedData.ai_name;
    }
    // ai_delay_between_messages já será number | null | undefined após o preprocess e validação Zod
    if ('ai_delay_between_messages' in validatedData && validatedData.ai_delay_between_messages !== undefined) {
        dataToUpdateForPrisma.ai_delay_between_messages = validatedData.ai_delay_between_messages;
    }


    if (Object.keys(dataToUpdateForPrisma).length === 0) {
         console.log("[API PATCH /workspaces/:id] Nenhuma alteração detectada para o banco de dados.");
         return NextResponse.json({ message: 'Nenhuma alteração detectada.' }, { status: 200 });
    }

    console.log("[API PATCH /workspaces/:id] Data to update in Prisma:", JSON.stringify(dataToUpdateForPrisma, null, 2));

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: dataToUpdateForPrisma,
      select: {
         id: true, name: true, slug: true, owner_id: true, created_at: true, updated_at: true,
         ai_default_system_prompt: true,
         ai_model_preference: true,
         ai_name: true,
         ai_delay_between_messages: true,
         _count: { select: { members: true } },
         owner: { select: { id: true, name: true, email: true } }
      }
    });

    console.log("[API PATCH /workspaces/:id] Workspace updated successfully:", JSON.stringify(workspace, null, 2));
    return NextResponse.json(workspace);

  } catch (error) {
    console.error('[API PATCH /workspaces/:id] Erro ao atualizar workspace:', error);
    // O ZodError deve ser pego pelo safeParse. Se chegar aqui, é outro tipo de erro.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
         if (error.code === 'P2002' && error.meta?.target && (error.meta.target as string[]).includes('slug')) {
             return NextResponse.json({ message: 'O slug fornecido já está em uso.' }, { status: 409 });
         }
    }
    return NextResponse.json({ message: 'Falha ao atualizar workspace. Verifique os logs do servidor.' }, { status: 500 });
  }
}

// Delete a workspace
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
    }

    const awaitedParams = await params; // Aguardar a resolução da Promise de params
    const workspaceId = awaitedParams.id;
    const userId = session.user.id;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true }
    });

    if (!workspace) {
      return NextResponse.json({ message: 'Workspace não encontrado' }, { status: 404 });
    }

    if (workspace.owner_id !== userId && !session.user.isSuperAdmin) {
      return NextResponse.json(
        { message: 'Apenas o proprietário ou super admin podem excluir o workspace' },
        { status: 403 }
      );
    }

    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json(
      { message: 'Workspace excluído com sucesso' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao excluir workspace:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2014') {
         return NextResponse.json({ message: 'Não é possível excluir o workspace pois existem dados relacionados que impedem a exclusão.' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Falha ao excluir workspace' }, { status: 500 });
  }
}