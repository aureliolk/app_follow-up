import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from "@/lib/permissions";

// Get workspace members and invitations
export async function GET(
  request: NextRequest,
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
    // Check if user has permission to view members (e.g., 'VIEWER')
    const hasPermission = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all members with their user info
    const members = await prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
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
      orderBy: {
        created_at: "asc",
      },
    });

    // Format members data
    const formattedMembers = members.map(member => ({
      id: member.id,
      email: member.user.email,
      name: member.user.name || member.user.email.split('@')[0],
      role: member.role,
      status: 'ACTIVE',
      userId: member.user_id
    }));

    // Get pending invitations
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { 
        workspace_id: workspaceId,
        expires_at: { gt: new Date() }
      },
    });

    // Format invitations data
    const formattedInvitations = invitations.map(invitation => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expires_at,
    }));

    return NextResponse.json({
      members: formattedMembers,
      invitations: formattedInvitations,
    });
  } catch (error) {
    console.error(`Error fetching members for workspace ${workspaceId}:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}