import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';

// Get workspace members and invitations
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Properly accessing dynamic route params in Next.js 13+
    const { id: workspaceId } = params;
    
    // Check if user has access to this workspace
    const hasAccess = await checkPermission(workspaceId, session.user.id, 'VIEWER');
    
    if (!hasAccess && !session.user.isSuperAdmin) {
      return NextResponse.json(
        { message: 'You do not have access to this workspace' },
        { status: 403 }
      );
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
          },
        },
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
    console.error('Error fetching workspace members:', error);
    return NextResponse.json(
      { message: 'Failed to fetch workspace members' },
      { status: 500 }
    );
  }
}