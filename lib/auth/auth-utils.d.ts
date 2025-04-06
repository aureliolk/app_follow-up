import { NextRequest, NextResponse } from 'next/server';
export declare function withAuth(req: NextRequest, handler: (req: NextRequest) => Promise<NextResponse>): Promise<NextResponse>;
export declare function withSuperAdminCheck(req: NextRequest, handler: (req: NextRequest) => Promise<NextResponse>): Promise<NextResponse>;
export declare function getCurrentUserId(req: NextRequest): Promise<string | null>;
//# sourceMappingURL=auth-utils.d.ts.map