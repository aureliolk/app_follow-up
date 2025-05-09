// app/api/clients/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';
import { Prisma } from '@prisma/client';

// Schema para criação de cliente
const clientCreateSchema = z.object({
  workspaceId: z.string().uuid("ID do Workspace inválido"), // Vem do corpo na criação via UI
  name: z.string().min(1, "Nome é obrigatório").optional().nullable(),
  phone_number: z.string().min(5, "Número de telefone inválido").optional().nullable(), // Validar melhor se necessário
  external_id: z.string().optional().nullable(),
  channel: z.string().optional().nullable(),
});

// --- GET: Listar clientes ---
export async function GET(req: NextRequest) {
  console.log("API GET /api/clients: Requisição recebida.");
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn("API GET Clients: Não autorizado - Sessão inválida.");
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const searchTerm = url.searchParams.get('search') || '';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    console.log(`API GET Clients: Buscando para workspaceId: ${workspaceId}, search: "${searchTerm}", page: ${page}, limit: ${limit}`);

    if (!workspaceId) {
      console.error("API GET Clients: Erro - ID do Workspace é obrigatório.");
      return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
    }

    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
      console.warn(`API GET Clients: Permissão negada para User ${userId} no Workspace ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'Permissão negada para acessar este workspace' }, { status: 403 });
    }

    const whereClause: Prisma.ClientWhereInput = {
      workspace_id: workspaceId,
    };

    if (searchTerm) {
      whereClause.OR = [
        {
          name: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
        {
          phone_number: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
      ];
    }

    const clients = await prisma.client.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
          id: true,
          name: true,
          phone_number: true,
          channel: true,
          external_id: true,
          created_at: true,
          updated_at: true,
      }
    });

    // Para determinar hasMore, poderíamos buscar limit + 1 itens e verificar se veio mais um
    // Ou, fazer uma contagem total, mas é menos eficiente para paginação simples.
    // Por simplicidade, se o número de clientes retornados for igual ao limite, assumimos que pode haver mais.
    // Uma forma mais robusta seria comparar com o total de clientes que correspondem ao filtro,
    // mas isso exigiria outra query de contagem.
    const hasMore = clients.length === limit;

    console.log(`API GET Clients: Encontrados ${clients.length} clientes. HasMore: ${hasMore}`);
    return NextResponse.json({ success: true, data: clients, hasMore: hasMore });

  } catch (error) {
    console.error('API GET Clients: Erro interno:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar clientes' }, { status: 500 });
  }
}

// --- POST: Criar novo cliente ---
export async function POST(req: NextRequest) {
  console.log("API POST /api/clients: Requisição recebida.");
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn("API POST Clients: Não autorizado - Sessão inválida.");
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await req.json();
    const validation = clientCreateSchema.safeParse(body);

    if (!validation.success) {
      console.error("API POST Clients: Erro de validação Zod:", validation.error.errors);
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }

    const { workspaceId, name, phone_number, external_id, channel } = validation.data;
    console.log(`API POST Clients: Tentando criar no Workspace ${workspaceId} por User ${userId}`);

    // Verificar permissão para criar (MEMBER ou ADMIN)
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER'); // Ou ADMIN se preferir
    if (!hasPermission) {
      console.warn(`API POST Clients: Permissão negada para User ${userId} criar no Workspace ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'Permissão negada para criar cliente neste workspace' }, { status: 403 });
    }

    // Verificar se já existe um cliente com o mesmo telefone/canal (se fornecido)
    if (phone_number && channel) {
         const existingClient = await prisma.client.findUnique({
             where: {
                 workspace_id_phone_number_channel: {
                     workspace_id: workspaceId,
                     phone_number: phone_number,
                     channel: channel.toUpperCase(), // Normalizar canal
                 }
             }
         });
         if (existingClient) {
              console.warn(`API POST Clients: Cliente já existe com telefone ${phone_number} e canal ${channel}`);
              return NextResponse.json({ success: false, error: 'Cliente já existe com este telefone e canal neste workspace.' }, { status: 409 });
         }
    }

    const newClient = await prisma.client.create({
      data: {
        workspace_id: workspaceId,
        name: name,
        phone_number: phone_number,
        external_id: external_id,
        channel: channel ? channel.toUpperCase() : null, // Normalizar canal
        // metadata pode ser adicionado se necessário
      },
    });

    console.log(`API POST Clients: Cliente ${newClient.id} criado com sucesso.`);
    return NextResponse.json({ success: true, data: newClient }, { status: 201 });

  } catch (error) {
    console.error('API POST Clients: Erro interno:', error);
    // Tratar erro de constraint única (se a verificação acima falhar por algum motivo)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
       return NextResponse.json({ success: false, error: 'Cliente já existe com estas informações.' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'Erro interno ao criar cliente' }, { status: 500 });
  }
}