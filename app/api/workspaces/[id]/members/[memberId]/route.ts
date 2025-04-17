import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

// Schema for updating member role
const memberUpdateSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']), // Define valid roles
});

// PUT: Update a member's role
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  const { id: workspaceId, memberId } = params;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = user.id;

  try {
    // Check if the user has permission to update members (ADMIN or OWNER)
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Ensure the member being updated exists in the workspace
    const memberToUpdate = await prisma.workspaceMember.findUnique({
      where: {
        id: memberId,
        workspace_id: workspaceId,
      },
      include: { workspace: { select: { owner_id: true } } } // Get owner_id
    });

    if (!memberToUpdate) {
      return NextResponse.json({ error: "Member not found in this workspace" }, { status: 404 });
    }

    // Prevent owner from changing their own role (or being demoted by admin)
    if (memberToUpdate.workspace.owner_id === memberToUpdate.user_id) {
         return NextResponse.json({ error: "Cannot change the owner's role" }, { status: 400 });
    }

     // Prevent logged-in user from changing their own role via this endpoint
     if (memberToUpdate.user_id === userId) {
         return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
     }

    const body = await request.json();
    const validation = memberUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input", details: validation.error.errors }, { status: 400 });
    }

    const { role } = validation.data;

    const updatedMember = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true, image: true } } } // Return updated member with user info
    });

    return NextResponse.json(updatedMember);
  } catch (error) {
    console.error(`Error updating member ${memberId} in workspace ${workspaceId}:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE: Remove a member from the workspace
export async function DELETE(
  request: NextRequest, // Keep request param
  { params }: { params: { id: string; memberId: string } }
) {
  const { id: workspaceId, memberId } = params;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = user.id;

  try {
    // Check if the user has permission to remove members (ADMIN or OWNER)
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Find the member to be removed
    const memberToRemove = await prisma.workspaceMember.findUnique({
      where: {
        id: memberId,
        workspace_id: workspaceId,
      },
       include: { workspace: { select: { owner_id: true } } } // Include owner_id
    });

    if (!memberToRemove) {
      return NextResponse.json({ error: "Member not found in this workspace" }, { status: 404 });
    }

    // Prevent owner from being removed
    if (memberToRemove.workspace.owner_id === memberToRemove.user_id) {
        return NextResponse.json({ error: "Cannot remove the workspace owner" }, { status: 400 });
    }

    // Prevent user from removing themselves (they should use a 'leave workspace' action)
    if (memberToRemove.user_id === userId) {
        return NextResponse.json({ error: "Cannot remove yourself. Use 'Leave Workspace' instead." }, { status: 400 });
    }

    await prisma.workspaceMember.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ message: "Member removed successfully" }, { status: 200 });
  } catch (error) {
    console.error(`Error removing member ${memberId} from workspace ${workspaceId}:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}