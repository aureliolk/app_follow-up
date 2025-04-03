// app/api/clients/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../packages/shared-lib/src/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../../packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '../../../../../../packages/shared-lib/src/permissions';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

// Schema para atualização
const clientUpdateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").optional().nullable(),
  phone_number: z.string().min(5, "Número de telefone inválido").optional().nullable(),
  external_id: z.string().optional().nullable(),
  channel: z.string().optional().nullable(),
  // workspaceId é necessário para verificação, mas não para update
  workspaceId: z.string().uuid("ID do Workspace inválido"),
});

// --- GET: Buscar um cliente específico ---
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = params.id;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');

    console.log(`GET /api/clients/${clientId}: Request received (Workspace ID: ${workspaceId})`);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
    }

    const hasPermission = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada' }, { status: 403 });
    }

    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        workspace_id: workspaceId, // Garante que pertence ao workspace
      },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: 'Cliente não encontrado' }, { status: 404 });
    }

    console.log(`GET /api/clients/${clientId}: Cliente encontrado.`);
    return NextResponse.json({ success: true, data: client });

  } catch (error) {
    console.error(`GET /api/clients/[id]: Error fetching client:`, error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar cliente' }, { status: 500 });
  }
}

// --- PUT: Atualizar cliente ---
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }

) {
  try {
    const awaitedParams = await params;
    const clientId = awaitedParams.id;
    console.log(`PUT /api/clients/${clientId}: Request received`);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json();
    console.log(`PUT /api/clients/${clientId}: Request body:`, body);

    const validation = clientUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { workspaceId, ...updateData } = validation.data; // Separa workspaceId dos dados de update

    // Normalizar canal se presente
    if (updateData.channel) {
      updateData.channel = updateData.channel.toUpperCase();
    }

    // Verificar permissão (ADMIN ou MEMBER talvez?)
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER'); // Ou ADMIN
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada para editar este cliente' }, { status: 403 });
    }

    // Verificar se o cliente pertence ao workspace antes de atualizar
    const existingClient = await prisma.client.findFirst({
      where: { id: clientId, workspace_id: workspaceId },
      select: { id: true } // Só precisamos saber se existe
    });
    if (!existingClient) {
         return NextResponse.json({ success: false, error: 'Cliente não encontrado neste workspace' }, { status: 404 });
    }

    // Verificar duplicação de telefone/canal se forem alterados
     if (updateData.phone_number && updateData.channel) {
         const duplicateClient = await prisma.client.findUnique({
             where: {
                 workspace_id_phone_number_channel: {
                     workspace_id: workspaceId,
                     phone_number: updateData.phone_number,
                     channel: updateData.channel,
                 },
                 // Excluir o próprio cliente da verificação
                 NOT: { id: clientId }
             }
         });
         if (duplicateClient) {
              return NextResponse.json({ success: false, error: 'Já existe outro cliente com este telefone e canal neste workspace.' }, { status: 409 });
         }
    }

    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: updateData,
    });

    console.log(`PUT /api/clients/${clientId}: Cliente atualizado com sucesso.`);
    return NextResponse.json({ success: true, data: updatedClient });

  } catch (error) {
    console.error(`PUT /api/clients/[id]: Error updating client:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
       return NextResponse.json({ success: false, error: 'Já existe outro cliente com estas informações.' }, { status: 409 });
     }
    return NextResponse.json({ success: false, error: 'Erro interno ao atualizar cliente' }, { status: 500 });
  }
}

// --- DELETE: Excluir cliente ---
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = params.id;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId'); // Espera workspaceId como query param

    console.log(`DELETE /api/clients/${clientId}: Request received (Workspace ID: ${workspaceId})`);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
    }

    // Verificar permissão (ADMIN necessário para excluir?)
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada para excluir este cliente' }, { status: 403 });
    }

    // Verificar se o cliente pertence ao workspace antes de excluir
    const clientToDelete = await prisma.client.findFirst({
       where: { id: clientId, workspace_id: workspaceId },
       select: { id: true }
    });

    if (!clientToDelete) {
         return NextResponse.json({ success: false, error: 'Cliente não encontrado neste workspace' }, { status: 404 });
    }

    // Excluir cliente (onDelete: Cascade deve cuidar das conversas/mensagens relacionadas)
    await prisma.client.delete({
      where: { id: clientId },
    });

    console.log(`DELETE /api/clients/${clientId}: Cliente excluído com sucesso.`);
    return NextResponse.json({ success: true, message: 'Cliente excluído com sucesso' }, { status: 200 });

  } catch (error) {
    console.error(`DELETE /api/clients/[id]: Error deleting client:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2014') { // Exemplo de erro FK
       return NextResponse.json({ success: false, error: 'Não é possível excluir o cliente pois existem dados relacionados.' }, { status: 409 }); // Conflict
     }
    return NextResponse.json({ success: false, error: 'Erro interno ao excluir cliente' }, { status: 500 });
  }
}