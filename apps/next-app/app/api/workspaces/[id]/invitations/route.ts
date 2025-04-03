import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/packages/shared-lib/src/db';
import { authOptions } from '@/packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '@/packages/shared-lib/src/permissions';
import crypto from 'crypto';

// Get all invitations for a workspace
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

    const invitations = await prisma.workspaceInvitation.findMany({
      where: { 
        workspace_id: workspaceId,
        expires_at: { gt: new Date() }
      },
    });

    return NextResponse.json(invitations);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json(
      { message: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

// Create a new invitation
export async function POST(
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

    // Properly accessing dynamic route params in Next.js 13+
    const { id: workspaceId } = params;
    
    // Check if user has admin permission for this workspace
    const isAdmin = await checkPermission(workspaceId, session.user.id, 'ADMIN');
    
    if (!isAdmin && !session.user.isSuperAdmin) {
      return NextResponse.json(
        { message: 'You do not have permission to create invitations' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
    });

    const { email, role } = schema.parse(body);

    // Check if user is already a member
    const existingMember = await prisma.user.findFirst({
      where: {
        email,
        workspace_members: {
          some: {
            workspace_id: workspaceId,
          },
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { message: 'User is already a member of this workspace' },
        { status: 409 }
      );
    }

    // Check if there's already an active invitation for this email
    const existingInvitation = await prisma.workspaceInvitation.findFirst({
      where: {
        workspace_id: workspaceId,
        email,
        expires_at: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { message: 'An invitation has already been sent to this email' },
        { status: 409 }
      );
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create the invitation
    const invitation = await prisma.workspaceInvitation.create({
      data: {
        email,
        role,
        token,
        expires_at: expiresAt,
        workspace_id: workspaceId,
        invited_by: session.user.id,
      },
    });

    // In a real app, you would send an email with the invitation link
    // For now, we'll just return the token in the response
    return NextResponse.json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expires_at,
      token: invitation.token,
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Failed to create invitation' },
      { status: 500 }
    );
  }
}