import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/auth-options';

// Create a workspace
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const schema = z.object({
      name: z.string().min(1, 'Workspace name is required'),
    });

    const { name } = schema.parse(body);
    
    // Generate a slug from the name
    const baseSlug = name.toLowerCase().replace(/\s+/g, '-');
    const timestamp = Date.now();
    const slug = `${baseSlug}-${timestamp}`.slice(0, 50);

    // Create the workspace
    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug,
        owner_id: session.user.id,
        members: {
          create: {
            user_id: session.user.id,
            role: 'ADMIN',
          },
        },
      },
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    console.error('Error creating workspace:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Failed to create workspace' },
      { status: 500 }
    );
  }
}

// Get all workspaces for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      console.log('Unauthorized access attempt to workspaces API');
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Fetching workspaces for user ID:', session.user.id);

    // Find all workspaces where the user is a member
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { owner_id: session.user.id },
          {
            members: {
              some: {
                user_id: session.user.id,
              },
            },
          },
        ],
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    console.log(`Found ${workspaces.length} workspaces for user ${session.user.id}`);
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    
    // Add more detailed error information
    let errorMessage = 'Failed to fetch workspaces';
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      { message: errorMessage },
      { status: 500 }
    );
  }
}