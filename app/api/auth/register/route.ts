import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  inviteToken: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, inviteToken } = userSchema.parse(body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 10);

    // Check if this is the first user (who will be super admin)
    const usersCount = await prisma.user.count();
    const isSuperAdmin = usersCount === 0;
    
    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        is_super_admin: isSuperAdmin,
      },
    });
    
    // Log super admin creation if applicable
    if (isSuperAdmin) {
      console.log(`Super admin created: ${email}`);
    }

    // Create a default workspace for the user
    const workspaceName = `${name}'s Workspace`;
    const workspaceSlug = `${name.toLowerCase().replace(/\s+/g, '-')}-workspace-${Date.now()}`.slice(0, 50);

    await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug: workspaceSlug,
        owner_id: user.id,
        members: {
          create: {
            user_id: user.id,
            role: 'ADMIN',
          },
        },
      },
    });

    // Process invite if token exists
    let inviteProcessed = false;
    if (inviteToken) {
      console.log(`[Register API] Tentando processar inviteToken ${inviteToken} para User ${user.id}`);
      try {
        const invitation = await prisma.workspaceInvitation.findUnique({
          where: { token: inviteToken, status: 'PENDING' },
        });

        if (!invitation) {
          console.warn(`[Register API] Convite não encontrado ou não pendente para token: ${inviteToken}`);
        } else if (invitation.expires_at < new Date()) {
          console.warn(`[Register API] Convite expirado para token: ${inviteToken}`);
          await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
        } else {
          // Convite válido!
          console.log(`[Register API] Convite válido para Workspace ${invitation.workspace_id}. Adicionando membro...`);
          await prisma.workspaceMember.upsert({
            where: { workspace_id_user_id: { workspace_id: invitation.workspace_id, user_id: user.id } },
            update: { role: invitation.role },
            create: { workspace_id: invitation.workspace_id, user_id: user.id, role: invitation.role },
          });
          await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } });
          console.log(`[Register API] Usuário ${user.id} adicionado ao workspace ${invitation.workspace_id}. Convite ${invitation.id} aceito.`);
          inviteProcessed = true;
        }
      } catch (inviteError) {
        console.error(`[Register API] Erro ao processar convite ${inviteToken}:`, inviteError);
        // Não falhar o registro por causa do convite
      }
    }

    return NextResponse.json(
      { message: 'User created successfully' + (inviteProcessed ? ' and invitation accepted.' : '.') },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request', errors: error.errors },
        { status: 400 }
      );
    }

    console.error('Error registering user:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}