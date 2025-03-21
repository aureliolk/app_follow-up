import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions';

// Helper function to check workspace access
async function hasWorkspaceAccess(workspaceId: string, userId: string) {
  const count = await prisma.workspaceMember.count({
    where: {
      workspace_id: workspaceId,
      user_id: userId,
    },
  });
  
  const isOwner = await prisma.workspace.count({
    where: {
      id: workspaceId,
      owner_id: userId,
    },
  });
  
  return count > 0 || isOwner > 0;
}

// Get a single workspace
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
    const hasAccess = await hasWorkspaceAccess(workspaceId, session.user.id);
    
    if (!hasAccess) {
      return NextResponse.json(
        { message: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
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
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    return NextResponse.json(
      { message: 'Failed to fetch workspace' },
      { status: 500 }
    );
  }
}

// Update a workspace
export async function PATCH(
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
    
    // Check if user has admin permission for this workspace
    const hasPermission = await checkPermission(workspaceId, session.user.id, 'ADMIN');
    
    if (!hasPermission) {
      return NextResponse.json(
        { message: 'You do not have permission to update this workspace' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const schema = z.object({
      name: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
    });

    const { name, slug } = schema.parse(body);
    
    // If slug is being updated, check it's not already taken
    if (slug) {
      const existingWorkspace = await prisma.workspace.findUnique({
        where: { slug },
      });
      
      if (existingWorkspace && existingWorkspace.id !== workspaceId) {
        return NextResponse.json(
          { message: 'Workspace slug is already taken' },
          { status: 409 }
        );
      }
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
      },
    });

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Error updating workspace:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Failed to update workspace' },
      { status: 500 }
    );
  }
}

// Delete a workspace
export async function DELETE(
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
    
    // Check if user is the owner of this workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    
    if (!workspace) {
      return NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      );
    }
    
    if (workspace.owner_id !== session.user.id) {
      return NextResponse.json(
        { message: 'Only the workspace owner can delete it' },
        { status: 403 }
      );
    }

    // Delete workspace (cascade will handle members and invitations)
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json(
      { message: 'Workspace deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return NextResponse.json(
      { message: 'Failed to delete workspace' },
      { status: 500 }
    );
  }
}