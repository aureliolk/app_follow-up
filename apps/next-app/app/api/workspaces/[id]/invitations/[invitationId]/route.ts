import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../../../packages/shared-lib/src/db';
import { authOptions } from '../../../../../../../../packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '../../../../../../../../packages/shared-lib/src/permissions';

// Delete an invitation
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; invitationId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Properly accessing dynamic route params in Next.js 13+
    const { id: workspaceId, invitationId } = params;
    
    // Check if user has admin permission for this workspace
    const isAdmin = await checkPermission(workspaceId, session.user.id, 'ADMIN');
    
    if (!isAdmin && !session.user.isSuperAdmin) {
      return NextResponse.json(
        { message: 'You do not have permission to cancel invitations' },
        { status: 403 }
      );
    }

    // Ensure the invitation belongs to this workspace
    const invitation = await prisma.workspaceInvitation.findFirst({
      where: {
        id: invitationId,
        workspace_id: workspaceId,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { message: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Delete the invitation
    await prisma.workspaceInvitation.delete({
      where: { id: invitationId },
    });

    return NextResponse.json(
      { message: 'Invitation cancelled successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    return NextResponse.json(
      { message: 'Failed to cancel invitation' },
      { status: 500 }
    );
  }
}

// Resend an invitation
export async function POST(
  req: Request,
  { params }: { params: { id: string; invitationId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Properly accessing dynamic route params in Next.js 13+
    const { id: workspaceId, invitationId } = params;
    
    // Check if user has admin permission for this workspace
    const isAdmin = await checkPermission(workspaceId, session.user.id, 'ADMIN');
    
    if (!isAdmin && !session.user.isSuperAdmin) {
      return NextResponse.json(
        { message: 'You do not have permission to resend invitations' },
        { status: 403 }
      );
    }

    // Find the invitation
    const invitation = await prisma.workspaceInvitation.findFirst({
      where: {
        id: invitationId,
        workspace_id: workspaceId,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { message: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Update expiration date (extend by 7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update the invitation
    const updatedInvitation = await prisma.workspaceInvitation.update({
      where: { id: invitationId },
      data: {
        expires_at: expiresAt,
      },
    });

    // In a real app, you would send an email with the invitation link
    // For now, we'll just return success message

    return NextResponse.json({
      message: 'Invitation resent successfully',
      email: updatedInvitation.email,
      expiresAt: updatedInvitation.expires_at,
    });
  } catch (error) {
    console.error('Error resending invitation:', error);
    return NextResponse.json(
      { message: 'Failed to resend invitation' },
      { status: 500 }
    );
  }
}