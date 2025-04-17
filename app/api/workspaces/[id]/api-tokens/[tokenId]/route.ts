import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

// Helper function to authenticate and authorize the request for a specific token route
// Returns the user ID and the validated token if successful, otherwise returns a NextResponse error
async function authenticateRequestTokenRoute(request: NextRequest, workspaceId: string, tokenId: string): Promise<{ userId: string | null; tokenData: Prisma.WorkspaceApiTokenGetPayload<{}> | null; response: NextResponse | null }> {
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return { userId: null, tokenData: null, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
    }
    const userId = user.id;

    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
        return { userId: null, tokenData: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    const tokenData = await prisma.workspaceApiToken.findUnique({
        where: { id: tokenId, workspace_id: workspaceId },
    });

    if (!tokenData) {
        return { userId: null, tokenData: null, response: NextResponse.json({ error: "API Token not found in this workspace" }, { status: 404 }) };
    }

    return { userId, tokenData, response: null };
}

// GET: Retrieve details of a specific API token (excluding the token value)
export async function GET(request: NextRequest, { params }: { params: { id: string; tokenId: string } }) {
    const { id: workspaceId, tokenId } = params;
    const authResult = await authenticateRequestTokenRoute(request, workspaceId, tokenId);
    if (authResult.response) return authResult.response;
    const tokenData = authResult.tokenData;

    const responseData = {
        id: tokenData?.id,
        name: tokenData?.name,
        created_at: tokenData?.created_at,
        expires_at: tokenData?.expires_at,
        last_used_at: tokenData?.last_used_at,
        revoked: tokenData?.revoked,
        created_by: tokenData?.created_by,
    };

    return NextResponse.json(responseData);
}

// PUT/PATCH: Update token (e.g., revoke/unrevoke)
const tokenUpdateSchema = z.object({
    revoked: z.boolean(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string; tokenId: string } }) {
    const { id: workspaceId, tokenId } = params;
    const authResult = await authenticateRequestTokenRoute(request, workspaceId, tokenId);
    if (authResult.response) return authResult.response;

    try {
        const body = await request.json();
        const validation = tokenUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid input", details: validation.error.errors }, { status: 400 });
        }

        const { revoked } = validation.data;

        const updatedToken = await prisma.workspaceApiToken.update({
            where: { id: tokenId },
            data: { revoked },
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

        return NextResponse.json(updatedToken);

    } catch (error) {
        console.error(`Error updating API token ${tokenId} for workspace ${workspaceId}:`, error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// DELETE: Permanently delete an API token
export async function DELETE(request: NextRequest, { params }: { params: { id: string; tokenId: string } }) {
    const { id: workspaceId, tokenId } = params;
    const authResult = await authenticateRequestTokenRoute(request, workspaceId, tokenId);
    if (authResult.response) return authResult.response;

    try {
        await prisma.workspaceApiToken.delete({
            where: { id: tokenId },
        });

        return NextResponse.json({ message: "API Token deleted successfully" }, { status: 200 });

    } catch (error) {
        console.error(`Error deleting API token ${tokenId} for workspace ${workspaceId}:`, error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}