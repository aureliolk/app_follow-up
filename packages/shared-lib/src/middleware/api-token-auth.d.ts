import { NextRequest, NextResponse } from 'next/server';
/**
 * Middleware para verificar e validar tokens de API
 *
 * Este middleware pode ser usado para rotas que precisam suportar
 * autenticação via token de API, além da autenticação padrão por cookie.
 */
export declare function withApiTokenAuth(req: NextRequest, handler: (req: NextRequest, workspaceId?: string) => Promise<NextResponse>): Promise<NextResponse>;
//# sourceMappingURL=api-token-auth.d.ts.map