// app/api/workspaces/[id]/tags/route.ts

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from "next-auth/next"
// Importar a configuração do NextAuth (ajuste o caminho se necessário)
import { authOptions } from "@/lib/auth/auth-options";

// --- Validação de Acesso (Exemplo usando NextAuth) ---
async function validateAccess(request: NextRequest, workspaceId: string) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return { authorized: false, userId: null, error: 'Usuário não autenticado.', status: 401 };
    }
    const userId = session.user.id;

    console.log(`[validateAccess] Usuário ${userId} não é Super Admin. Verificando membro do Workspace ${workspaceId}...`);

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { owner_id: true },
    });


    // Verificar se o usuário é membro do workspace
    const membership = await prisma.workspaceMember.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: workspaceId,
                user_id: workspace.owner_id,
            },
        },
        select: { role: true }, 
    });// Se não for Super Admin, continua a verificação de membro
    

    if (!membership) {
         console.log(`[validateAccess] Acesso negado para Usuário ${userId} no Workspace ${workspaceId} (não é membro).`);
        return { authorized: false, userId: null, error: 'Acesso negado a este workspace.', status: 403 };
    }

    console.log(`[validateAccess] Acesso permitido para Membro (User ID: ${userId}, Role: ${membership.role}) no Workspace ${workspaceId}`);
    return { authorized: true, userId, role: membership.role };
}

// --- GET: Buscar todas as tags disponíveis do workspace ---
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    // Aguardar params antes de acessar id
    const awaitedParams = await params; 
    const workspaceId = awaitedParams.id;

    // Validar Acesso
    const { authorized, error, status } = await validateAccess(request, workspaceId);
    if (!authorized) {
        return NextResponse.json({ success: false, error }, { status });
    }

    try {
        const tags = await prisma.workspaceTag.findMany({
            where: { workspace_id: workspaceId },
            orderBy: { name: 'asc' }, // Ordenar alfabeticamente
            select: { name: true }, // Selecionar apenas o nome
        });

        // Mapear para retornar apenas um array de strings
        const tagNames = tags.map(tag => tag.name);

        return NextResponse.json({ success: true, data: tagNames });

    } catch (err) {
        console.error(`[API Tags GET /${workspaceId}] Erro ao buscar tags:`, err);
        return NextResponse.json({ success: false, error: 'Erro interno ao buscar tags.' }, { status: 500 });
    }
}

// --- POST: Criar uma nova tag para o workspace ---
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    // Aguardar params antes de acessar id
    const awaitedParams = await params;
    const workspaceId = awaitedParams.id;

    // Validar Acesso e Permissão (Ex: só ADMIN ou MEMBER podem criar?)
    const { authorized, role, error, status } = await validateAccess(request, workspaceId);
    if (!authorized) {
        return NextResponse.json({ success: false, error }, { status });
    }

    // Validar permissão - Permitir SUPER_ADMIN, ADMIN e MEMBER
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN' && role !== 'MEMBER') {
        return NextResponse.json({ success: false, error: 'Permissão insuficiente para criar tags.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const tagName = body.name?.trim();

        if (!tagName) {
            return NextResponse.json({ success: false, error: 'O nome da tag é obrigatório.' }, { status: 400 });
        }

        // Limitar tamanho da tag (exemplo)
        if (tagName.length > 50) {
             return NextResponse.json({ success: false, error: 'O nome da tag não pode exceder 50 caracteres.' }, { status: 400 });
        }

        // Tentar criar a tag (o unique constraint no schema trata duplicatas)
        const newTag = await prisma.workspaceTag.create({
            data: {
                name: tagName,
                workspace_id: workspaceId,
            },
            select: { name: true }, // Retornar apenas o nome criado
        });

        return NextResponse.json({ success: true, data: newTag }, { status: 201 }); // 201 Created

    } catch (err: any) {
        // Verificar erro de duplicata (P2002)
        if (err.code === 'P2002') {
             return NextResponse.json({ success: false, error: 'Esta tag já existe neste workspace.' }, { status: 409 }); // 409 Conflict
        }

        console.error(`[API Tags POST /${workspaceId}] Erro ao criar tag:`, err);
        return NextResponse.json({ success: false, error: 'Erro interno ao criar tag.' }, { status: 500 });
    }
}

