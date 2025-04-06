import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";

// Get all workspaces for super admin
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      console.log('Unauthorized access attempt to workspaces/all API');
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is super admin
    // First try to get from session
    const isSuperAdminFromSession = session.user.isSuperAdmin === true;
    
    // Double check with database if needed
    let isSuperAdmin = isSuperAdminFromSession;
    
    if (!isSuperAdminFromSession) {
      console.log('Super admin not found in session, checking database:', session.user.id);
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { is_super_admin: true }
      });
      
      isSuperAdmin = user?.is_super_admin === true;
    }

    if (!isSuperAdmin) {
      console.log('Non-admin user attempted to access all workspaces:', session.user.id);
      return NextResponse.json(
        { message: 'Proibido: Apenas administradores super podem acessar este recurso' },
        { status: 403 }
      );
    }
    
    console.log('Super admin verification successful for:', session.user.id);

    console.log('Super admin fetching all workspaces:', session.user.id);

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