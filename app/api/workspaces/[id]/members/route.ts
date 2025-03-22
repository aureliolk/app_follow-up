import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';

// Get workspace members and invitations
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const workspaceId = params.id;
    
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

// Update a member's role
export async function PATCH(
  req: Request,
  { params }: { params: { id: string, memberId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const workspaceId = params.id;
    const memberId = params.memberId;
    
    // Check if user has admin permission for this workspace
    const isAdmin = await checkPermission(workspaceId, session.user.id, 'ADMIN');
    
    if (!isAdmin && !session.user.isSuperAdmin) {
      return NextResponse.json(
        { message: 'You do not have permission to update member roles' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { role } = body;

    if (!role || !['ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
      return NextResponse.json(
        { message: 'Invalid role' },
        { status: 400 }
      );
    }

    // Get the member to update
    const member = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: {
        workspace: true,
      },
    });

    if (!member) {
      return NextResponse.json(
        { message: 'Member not found' },
        { status: 404 }
      );
    }

    // Prevent updating the role of the workspace owner
    if (member.workspace.owner_id === member.user_id) {
      return NextResponse.json(
        { message: 'Cannot change the role of the workspace owner' },
        { status: 400 }
      );
    }

    // Update the member's role
    const updatedMember = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
    });

    return NextResponse.json({
      id: updatedMember.id,
      role: updatedMember.role,
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    return NextResponse.json(
      { message: 'Failed to update member role' },
      { status: 500 }
    );
  }
}

// Remove a member from workspace
export async function DELETE(
  req: Request,
  { params }: { params: { id: string, memberId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const workspaceId = params.id;
    const memberId = params.memberId;
    
    // Check if user has admin permission for this workspace
    const isAdmin = await checkPermission(workspaceId, session.user.id, 'ADMIN');
    
    if (!isAdmin && !session.user.isSuperAdmin) {
      return NextResponse.json(
        { message: 'You do not have permission to remove members' },
        { status: 403 }
      );
    }

    // Get the member to remove
    const member = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: {
        workspace: true,
      },
    });

    if (!member) {
      return NextResponse.json(
        { message: 'Member not found' },
        { status: 404 }
      );
    }

    // Prevent removing the workspace owner
    if (member.workspace.owner_id === member.user_id) {
      return NextResponse.json(
        { message: 'Cannot remove the workspace owner' },
        { status: 400 }
      );
    }

    // Remove the member
    await prisma.workspaceMember.delete({
      where: { id: memberId },
    });

    return NextResponse.json(
      { message: 'Member removed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json(
      { message: 'Failed to remove member' },
      { status: 500 }
    );
  }
}