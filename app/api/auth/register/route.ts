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

    // <<< Validar convite ANTES de criar usuário e workspace padrão >>>
    let validInvitation: Awaited<ReturnType<typeof prisma.workspaceInvitation.findUnique>> | null = null;
    if (inviteToken) {
      console.log(`[Register API] Verificando inviteToken ${inviteToken} antes de criar usuário...`);
      validInvitation = await prisma.workspaceInvitation.findUnique({
        where: { 
          token: inviteToken, 
          status: 'PENDING',
          expires_at: { gt: new Date() } // Já verifica expiração aqui
        },
      });
      if (validInvitation) {
        console.log(`[Register API] Convite válido encontrado para Workspace ${validInvitation.workspace_id}.`);
      } else {
        console.warn(`[Register API] Convite inválido, expirado ou não pendente para token: ${inviteToken}. Registro procederá normalmente.`);
      }
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

    // <<< Lógica Condicional: Processar Convite OU Criar Workspace Padrão >>>
    let message = 'User created successfully.';

    if (validInvitation) {
      // Processar o convite válido encontrado anteriormente
      try {
         console.log(`[Register API] Adicionando membro ${user.id} ao Workspace ${validInvitation.workspace_id} via convite...`);
        await prisma.workspaceMember.create({ // Usar create aqui, pois o usuário é novo
          data: {
            workspace_id: validInvitation.workspace_id,
            user_id: user.id,
            role: validInvitation.role,
          },
        });
        await prisma.workspaceInvitation.update({
          where: { id: validInvitation.id },
          data: { status: 'ACCEPTED' },
        });
        console.log(`[Register API] Convite ${validInvitation.id} aceito e membro adicionado.`);
        message = 'User created successfully and invitation accepted.';
      } catch (inviteProcessingError) {
         console.error(`[Register API] Erro ao processar convite ${validInvitation.id} APÓS criar usuário ${user.id}:`, inviteProcessingError);
         message = 'User created, but failed to process invitation acceptance.';
      }
    } else {
      // Nenhum convite válido, criar workspace padrão
      console.log(`[Register API] Nenhum convite válido. Criando workspace padrão para ${user.email}`);
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
      console.log(`[Register API] Workspace padrão criado para ${user.email}`);
    }
    // <<< Fim Lógica Condicional >>>

    return NextResponse.json(
      { message: message },
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