import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

// Create a workspace
export async function POST(req: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
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
        owner_id: user.id,
        members: {
          create: {
            user_id: user.id,
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
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.log('Unauthorized access attempt to workspaces API');
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 }
    );
  }

  console.log('Fetching workspaces for user ID:', user.id);

  try {
    const workspaces = await prisma.workspaceMember.findMany({
      where: { user_id: user.id },
      include: {
        workspace: true,
      },
    });

    const userWorkspaces = workspaces.map((member) => member.workspace);

    console.log(`Found ${userWorkspaces.length} workspaces for user ${user.id}`);
    return NextResponse.json(userWorkspaces);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    
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