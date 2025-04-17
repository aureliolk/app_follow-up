import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { checkPermission } from "@/lib/permissions";
import { sendInvitationEmail } from "@/lib/email";
import { InvitationStatus } from "@prisma/client";

// Delete an invitation
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; invitationId: string } }
) {
  try {
    const { id: workspaceId, invitationId } = params;
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Check if user has admin permission for this workspace
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    
    if (!hasPermission) {
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

    // Cannot delete/revoke already accepted invitations
    if (invitation.status === InvitationStatus.ACCEPTED) {
        return NextResponse.json({ error: "Cannot revoke an already accepted invitation" }, { status: 400 });
    }

    // Option 2: Mark as REVOKED instead of deleting
     const updatedInvitation = await prisma.workspaceInvitation.update({
         where: { id: invitationId },
         data: { status: InvitationStatus.REVOKED }
     });

    return NextResponse.json({ message: "Invitation revoked successfully", data: updatedInvitation }, { status: 200 });
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
    const { id: workspaceId, invitationId } = params;
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has admin permission for this workspace
    const hasPermission = await checkPermission(workspaceId, user.id, 'ADMIN');
    
    if (!hasPermission) {
      return NextResponse.json(
        { message: 'You do not have permission to resend invitations' },
        { status: 403 }
      );
    }

    // <<< Buscar convite com nome do workspace e token >>>
    const invitation = await prisma.workspaceInvitation.findFirst({
      where: {
        id: invitationId,
        workspace_id: workspaceId,
        // Opcional: Adicionar verificação se já não está ACCEPTED?
        // status: { not: 'ACCEPTED' }
      },
      include: { // Incluir nome do workspace para o email
        workspace: {
          select: { name: true }
        }
      }
    });

    if (!invitation || !invitation.workspace) {
      return NextResponse.json(
        { message: 'Invitation or associated workspace not found' },
        { status: 404 }
      );
    }

    // Update expiration date (extend by 7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // <<< Manter o update simples, já temos os dados do convite >>>
    await prisma.workspaceInvitation.update({
      where: { id: invitationId },
      data: {
        expires_at: expiresAt,
        status: 'PENDING' // <<< Garantir que o status volte para PENDING caso tenha expirado
      },
    });

    // <<< Reenviar o email de convite >>>
    const emailSent = await sendInvitationEmail({
      to: invitation.email,
      token: invitation.token,
      workspaceName: invitation.workspace.name
    });

    if (!emailSent) {
      console.error(`[Resend Invite API] Convite ${invitation.id} atualizado, mas falha ao reenviar email para ${invitation.email}`);
      // Retornar erro indicando falha no reenvio do email
      return NextResponse.json(
        { message: 'Convite atualizado, mas falha ao reenviar o email de notificação.' },
        { status: 500 }
      );
    }

    // <<< Resposta de sucesso (sem dados sensíveis) >>>
    return NextResponse.json({
      message: 'Invitation resent successfully',
    });
  } catch (error) {
    console.error('Error resending invitation:', error);
    return NextResponse.json(
      { message: 'Failed to resend invitation' },
      { status: 500 }
    );
  }
}