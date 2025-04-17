import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

// Get all workspaces for super admin
export async function GET() {
  // const session = await getServerSession(authOptions);
  const cookieStore = cookies();
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Only allow super admins to access this route
  // TODO: Implement proper Super Admin check with Supabase user roles/metadata
  // if (!session?.user || !session.user.isSuperAdmin) {
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // TEMPORARY: Assume user is NOT super admin until check is implemented
  const isSuperAdmin = false; // Replace with actual check later
  if (!isSuperAdmin) {
    console.warn(`User ${user.id} attempted to access super admin route /api/workspaces/all`);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    console.log('Super admin fetching all workspaces:', user.id);

    // Find all workspaces (for super admin)
    const workspaces = await prisma.workspace.findMany({
      orderBy: {
        created_at: 'desc',
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            members: true
          }
        }
      }
    });

    console.log(`Found ${workspaces.length} total workspaces for super admin`);
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Error fetching all workspaces:', error);
    
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