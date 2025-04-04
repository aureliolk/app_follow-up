type Role = 'ADMIN' | 'MEMBER' | 'VIEWER';
/**
 * Checks if a user has at least the specified role in a workspace
 */
export declare function checkPermission(workspaceId: string, userId: string, requiredRole: Role): Promise<boolean>;
/**
 * Gets a user's role in a workspace
 */
export declare function getUserRole(workspaceId: string, userId: string): Promise<Role | null>;
/**
 * API route middleware to check permissions
 */
export declare function withPermission(context: {
    params: {
        id: string;
    };
    userId: string;
}, requiredRole: Role, handler: () => Promise<Response>): Promise<Response>;
export declare function hasWorkspaceAccess(workspaceId: string, userId: string): Promise<boolean>;
export {};
//# sourceMappingURL=permissions.d.ts.map