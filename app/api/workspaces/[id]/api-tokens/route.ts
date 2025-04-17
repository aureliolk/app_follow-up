import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from "@/lib/permissions";
import { randomBytes } from 'crypto';
import { Prisma } from "@prisma/client";

// Função para gerar token criptograficamente seguro
function generateToken() {
  // Formato: wsat_RANDOM_STRING
  // Onde RANDOM_STRING é um string aleatório em base64 (sem caracteres especiais)
  // Use a função randomBytes importada do módulo 'crypto' do Node.js
  const bytes = randomBytes(32);
  const tokenString = bytes.toString('base64').replace(/[+/=]/g, '');
  return `wsat_${tokenString}`;
}

// Helper function to authenticate and authorize the request
// Returns the user ID if successful, otherwise returns a NextResponse error
async function authenticateRequest(request: NextRequest, workspaceId: string): Promise<{ userId: string | null; response: NextResponse | null }> {
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return { userId: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
    }
    const userId = user.id;

    // Check if user has ADMIN permission for this workspace
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
        return { userId: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return { userId, response: null };
}

// Listar tokens de API para um workspace
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const workspaceId = params.id;
    // Use a função de autenticação unificada
    const authResult = await authenticateRequest(request, workspaceId);
    if (authResult.response) return authResult.response;
    const userId = authResult.userId;

    // Garantir que userId não seja null (embora authenticateRequest deva tratar isso)
    if (!userId) {
        console.error("Authentication passed but userId is null in GET /api-tokens");
        return NextResponse.json({ error: "Authentication error" }, { status: 500 });
    }

    try {
        // Buscar tokens (mas não retornar o valor do token completo)
        const tokens = await prisma.workspaceApiToken.findMany({
            where: {
                workspace_id: workspaceId,
            },
            select: {
                id: true,
                name: true,
                token: false, // Não retornar o token completo por segurança
                created_at: true,
                expires_at: true,
                last_used_at: true,
                revoked: true,
                creator: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        return NextResponse.json({ tokens });

    } catch (error) {
        console.error(`Error fetching API tokens for workspace ${workspaceId}:`, error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// Criar um novo token de API
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const workspaceId = params.id;
    const authResult = await authenticateRequest(request, workspaceId);
    if (authResult.response) return authResult.response;
    const userId = authResult.userId;

    if (!userId) {
         console.error("Authentication passed but userId is null in POST /api-tokens");
         return NextResponse.json({ error: "Authentication error" }, { status: 500 });
    }

    try {
        const body = await request.json();
        const validation = tokenCreateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid input", details: validation.error.errors }, { status: 400 });
        }

        const { name, expires_in_days } = validation.data;

        // Generate secure random token
        const tokenValue = generateToken(); // Usa a função corrigida

        let expires_at: Date | null = null;
        if (expires_in_days) {
            expires_at = new Date();
            expires_at.setDate(expires_at.getDate() + expires_in_days);
        }

        const newToken = await prisma.workspaceApiToken.create({
            data: {
                workspace_id: workspaceId,
                name: name,
                token: tokenValue,
                created_by: userId,
                expires_at: expires_at,
            },
            select: {
                id: true,
                name: true,
                created_at: true,
                expires_at: true,
                last_used_at: true,
                revoked: true,
                created_by: true,
            }
        });

        // Retornar o token completo APENAS na criação
        const responseData = {
            ...newToken,
            token: tokenValue 
        }

        return NextResponse.json(responseData, { status: 201 });

    } catch (error) {
        console.error(`Error creating API token for workspace ${workspaceId}:`, error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// Schema for creating API token
const tokenCreateSchema = z.object({
    name: z.string().min(1, "Token name cannot be empty"),
    expires_in_days: z.number().int().positive().optional().nullable(),
});