import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Se não estiver autenticado e tentar acessar rotas protegidas
  if (!session && (
    req.nextUrl.pathname.startsWith('/workspace') ||
    req.nextUrl.pathname.startsWith('/workspaces') ||
    req.nextUrl.pathname.startsWith('/account')
  )) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Se estiver autenticado e tentar acessar páginas de auth
  if (session && (
    req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/register')
  )) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/workspaces';
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    '/workspace/:path*',
    '/workspaces',
    '/account/:path*',
    '/login',
    '/register',
  ],
};