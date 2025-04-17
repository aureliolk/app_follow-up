// app/api/workspaces/[id]/tags/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getUserRole, checkPermission } from "@/lib/permissions";

// Schema Zod para validação da criação/atualização de tag
const tagSchema = z.object({
  name: z.string().min(1, 'Nome da tag é obrigatório.'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve estar em formato hexadecimal (#RRGGBB).').optional(),
});

// --- GET: Listar todas as tags de um workspace ---
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const workspaceId = params.id;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }
    const userId = user.id;

    // Verificar se o usuário tem pelo menos acesso de VIEWER
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
        return NextResponse.json({ success: false, error: "Acesso negado" }, { status: 403 });
    }

    try {
        const tags = await prisma.workspaceTag.findMany({
            where: {
                workspace_id: workspaceId,
            },
            orderBy: {
                name: 'asc',
            },
        });
        return NextResponse.json({ success: true, tags });
    } catch (error) {
        console.error(`Erro ao buscar tags para workspace ${workspaceId}:`, error);
        return NextResponse.json({ success: false, error: "Erro interno do servidor" }, { status: 500 });
    }
}

// --- POST: Criar uma nova tag para o workspace ---
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const workspaceId = params.id; // Get workspaceId from params
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }
    const userId = user.id;

    // Obter o role do usuário neste workspace
    const userRole = await getUserRole(workspaceId, userId);

    // Verificar se tem acesso e permissão para criar (ADMIN ou MEMBER)
    if (!userRole) { 
        return NextResponse.json({ success: false, error: "Acesso negado a este workspace." }, { status: 403 });
    }
    if (userRole !== 'ADMIN' && userRole !== 'MEMBER') { // Somente Admin e Member podem criar
        return NextResponse.json({ success: false, error: 'Permissão insuficiente para criar tags.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const validation = tagSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ success: false, error: "Dados inválidos", details: validation.error.errors }, { status: 400 });
        }

        const { name, color } = validation.data;

        // Verificar se já existe tag com mesmo nome (case-insensitive) no workspace
        const existingTag = await prisma.workspaceTag.findFirst({
            where: {
                workspace_id: workspaceId,
                name: {
                    equals: name,
                    mode: 'insensitive',
                },
            },
        });

        if (existingTag) {
            return NextResponse.json({ success: false, error: `A tag \"${name}\" já existe neste workspace.` }, { status: 409 }); // Conflict
        }

        const newTag = await prisma.workspaceTag.create({
            data: {
                workspace_id: workspaceId,
                name: name,
            },
        });

        return NextResponse.json({ success: true, tag: newTag }, { status: 201 });

    } catch (error) {
        console.error(`Erro ao criar tag para workspace ${workspaceId}:`, error);
        return NextResponse.json({ success: false, error: "Erro interno do servidor" }, { status: 500 });
    }
}

// --- PATCH: Atualizar uma tag específica (Ex: /api/workspaces/{wsId}/tags/{tagId}) ---
// (Esta rota precisaria ser criada em `app/api/workspaces/[id]/tags/[tagId]/route.ts`)

// --- DELETE: Excluir uma tag específica (Ex: /api/workspaces/{wsId}/tags/{tagId}) ---
// (Esta rota precisaria ser criada em `app/api/workspaces/[id]/tags/[tagId]/route.ts`) 

