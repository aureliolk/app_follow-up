import { prisma } from "@/lib/db";

type Role = 'ADMIN' | 'MEMBER' | 'VIEWER';

// Hierarchy of roles for permission checks
const roleHierarchy: Record<Role, number> = {
  'ADMIN': 3,
  'MEMBER': 2,
  'VIEWER': 1
};

/**
 * Checks if a user has at least the specified role in a workspace
 */
export async function checkPermission(
  workspaceId: string,
  userId: string,
  requiredRole: Role
): Promise<boolean> {
  try {
    // Check if user is a superadmin first
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { is_super_admin: true }
    });

    if (user?.is_super_admin) {
      return true; // Superadmins have access to everything
    }
    
    // Check if user is the workspace owner (always has admin rights)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true }
    });
    
    if (workspace?.owner_id === userId) {
      return true;
    }
    
    // Check user's role in the workspace
    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: workspaceId,
        user_id: userId,
      },
    });
    
    if (!member) {
      return false;
    }
    
    const userRoleLevel = roleHierarchy[member.role as Role] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole];
    
    return userRoleLevel >= requiredRoleLevel;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Gets a user's role in a workspace
 */
export async function getUserRole(
  workspaceId: string,
  userId: string
): Promise<Role | null> {
  try {
    // Check if user is a superadmin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { is_super_admin: true }
    });

    if (user?.is_super_admin) {
      return 'ADMIN'; // Superadmins have admin access
    }
    
    // Check if user is the workspace owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { owner_id: true }
    });
    
    if (workspace?.owner_id === userId) {
      return 'ADMIN';
    }
    
    // Get user's role from workspace members
    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: workspaceId,
        user_id: userId,
      },
    });
    
    if (!member) {
      return null;
    }
    
    return member.role as Role;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

/**
 * API route middleware to check permissions
 */
export async function withPermission(
  context: {
    params: { id: string };
    userId: string;
  },
  requiredRole: Role,
  handler: () => Promise<Response>
): Promise<Response> {
  const hasPermission = await checkPermission(
    context.params.id,
    context.userId,
    requiredRole
  );
  
  if (!hasPermission) {
    return new Response(
      JSON.stringify({ message: 'Permission denied' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return handler();
}

// Check if user has any access to workspace
export async function hasWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  return checkPermission(workspaceId, userId, 'VIEWER');
}