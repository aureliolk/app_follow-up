import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from '@/lib/permissions';
import { sendInvitationEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

// Get all invitations for a workspace
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const workspaceId = params.id;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = user.id;

  try {
    // Check if user has permission to view invitations (ADMIN or OWNER)
    const hasAccess = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const workspaceId = params.id;
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = user.id;
  const userName = user.user_metadata?.name || user.email || 'Workspace Admin';

  try {
    // Check if user has permission to invite (ADMIN or OWNER)
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
    });

    const { email, role } = schema.parse(body);

    // Check if user is already a member
    const existingMember = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: workspaceId,
        user: { email: email },
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
    const token = randomBytes(32).toString('hex');
    
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
        invited_by: userId,
      },
      include: {
        workspace: {
          select: { name: true }
        }
      }
    });

    if (!invitation.workspace) {
      console.error(`[Invite API] Workspace ${workspaceId} não encontrado após criar convite ${invitation.id}`);
      return NextResponse.json(
        { message: 'Erro interno: Workspace não encontrado após criar convite.' },
        { status: 500 }
      );
    }

    const emailSent = await sendInvitationEmail({
        to: email,
        token: token,
        workspaceName: invitation.workspace.name,
    });

    if (!emailSent) {
      console.error(`[Invite API] Convite ${invitation.id} criado, mas falha ao enviar email para ${invitation.email}`);
      return NextResponse.json(
        { message: 'Convite criado, mas falha ao enviar o email de notificação.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expires_at,
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