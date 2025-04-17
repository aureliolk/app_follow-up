// app/api/workspaces/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from "zod";
import { checkPermission } from "@/lib/permissions";
import { Prisma } from '@prisma/client';

// GET a specific workspace by ID
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const workspaceId = params.id;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = user.id;

  try {
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true }
            }
          }
        },
        api_tokens: {
            select: { id: true, name: true, created_at: true, last_used_at: true, revoked: true, expires_at: true }
        }
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error(`Error fetching workspace ${workspaceId}:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

const workspaceUpdateSchema = z.object({
  name: z.string().min(1, "Workspace name cannot be empty").optional(),
  slug: z.string().min(1, "Workspace slug cannot be empty").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens").optional(),
  ai_default_system_prompt: z.string().optional().nullable(),
  ai_model_preference: z.string().optional().nullable(),
  ai_name: z.string().optional().nullable(),
});

// PUT update a specific workspace by ID
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const workspaceId = params.id;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = user.id;

  try {
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validation = workspaceUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input", details: validation.error.errors }, { status: 400 });
    }

    const updateData = validation.data;

    if (updateData.slug) {
      const existingWorkspace = await prisma.workspace.findUnique({
        where: { slug: updateData.slug },
      });
      if (existingWorkspace && existingWorkspace.id !== workspaceId) {
        return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
      }
    }

    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
      include: {
          members: {
              include: {
                  user: { select: { id: true, name: true, email: true, image: true } }
              }
          },
          api_tokens: {
             select: { id: true, name: true, created_at: true, last_used_at: true, revoked: true, expires_at: true }
          }
      }
    });

    return NextResponse.json(updatedWorkspace);
  } catch (error: any) {
    console.error(`Error updating workspace ${workspaceId}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// DELETE a specific workspace by ID
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const workspaceId = params.id;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = user.id;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    if (workspace.owner_id !== userId) {
      const isSuperAdmin = false;
      if (!isSuperAdmin) {
          console.warn(`User ${userId} attempted to delete workspace ${workspaceId} but is not the owner.`);
          return NextResponse.json({ error: "Forbidden: Only the owner can delete the workspace" }, { status: 403 });
      }
      console.log(`Super admin ${userId} is deleting workspace ${workspaceId}`);
    }

    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json({ message: "Workspace deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting workspace ${workspaceId}:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}