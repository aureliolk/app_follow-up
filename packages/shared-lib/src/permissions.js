"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPermission = checkPermission;
exports.getUserRole = getUserRole;
exports.withPermission = withPermission;
exports.hasWorkspaceAccess = hasWorkspaceAccess;
const db_1 = require("../../../packages/shared-lib/src/db");
// Hierarchy of roles for permission checks
const roleHierarchy = {
    'ADMIN': 3,
    'MEMBER': 2,
    'VIEWER': 1
};
/**
 * Checks if a user has at least the specified role in a workspace
 */
async function checkPermission(workspaceId, userId, requiredRole) {
    try {
        // Check if user is a superadmin first
        const user = await db_1.prisma.user.findUnique({
            where: { id: userId },
            select: { is_super_admin: true }
        });
        if (user === null || user === void 0 ? void 0 : user.is_super_admin) {
            return true; // Superadmins have access to everything
        }
        // Check if user is the workspace owner (always has admin rights)
        const workspace = await db_1.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { owner_id: true }
        });
        if ((workspace === null || workspace === void 0 ? void 0 : workspace.owner_id) === userId) {
            return true;
        }
        // Check user's role in the workspace
        const member = await db_1.prisma.workspaceMember.findFirst({
            where: {
                workspace_id: workspaceId,
                user_id: userId,
            },
        });
        if (!member) {
            return false;
        }
        const userRoleLevel = roleHierarchy[member.role] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole];
        return userRoleLevel >= requiredRoleLevel;
    }
    catch (error) {
        console.error('Error checking permission:', error);
        return false;
    }
}
/**
 * Gets a user's role in a workspace
 */
async function getUserRole(workspaceId, userId) {
    try {
        // Check if user is a superadmin
        const user = await db_1.prisma.user.findUnique({
            where: { id: userId },
            select: { is_super_admin: true }
        });
        if (user === null || user === void 0 ? void 0 : user.is_super_admin) {
            return 'ADMIN'; // Superadmins have admin access
        }
        // Check if user is the workspace owner
        const workspace = await db_1.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { owner_id: true }
        });
        if ((workspace === null || workspace === void 0 ? void 0 : workspace.owner_id) === userId) {
            return 'ADMIN';
        }
        // Get user's role from workspace members
        const member = await db_1.prisma.workspaceMember.findFirst({
            where: {
                workspace_id: workspaceId,
                user_id: userId,
            },
        });
        if (!member) {
            return null;
        }
        return member.role;
    }
    catch (error) {
        console.error('Error getting user role:', error);
        return null;
    }
}
/**
 * API route middleware to check permissions
 */
async function withPermission(context, requiredRole, handler) {
    const hasPermission = await checkPermission(context.params.id, context.userId, requiredRole);
    if (!hasPermission) {
        return new Response(JSON.stringify({ message: 'Permission denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    return handler();
}
// Check if user has any access to workspace
async function hasWorkspaceAccess(workspaceId, userId) {
    return checkPermission(workspaceId, userId, 'VIEWER');
}
//# sourceMappingURL=permissions.js.map