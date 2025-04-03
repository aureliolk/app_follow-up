import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../../../packages/shared-lib/src/db';
import { authOptions } from '../../../../../../../../packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '../../../../../../../../packages/shared-lib/src/permissions';

// Update a member's role
export async function PATCH(req: Request, props: { params: Promise<{ id: string; memberId: string }> }) {
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
    const { id: workspaceId, memberId } = params;
    
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
export async function DELETE(req: Request, props: { params: Promise<{ id: string; memberId: string }> }) {
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
    const { id: workspaceId, memberId } = params;
    
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