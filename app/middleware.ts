import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // CORS handling
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set('Access-Control-Allow-Origin', request.headers.get('origin') || '*');
  response.headers.set('Access-Control-Allow-Credentials', 'true');

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: response.headers,
    });
  }

  // Auth protection for specific routes
  const { pathname } = request.nextUrl;

  // Public routes that don't need authentication
  const isPublicRoute =
    pathname.startsWith('/auth') ||
    pathname === '/' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/fonts');

  if (isPublicRoute) {
    return response;
  }

  // Protected routes
  const token = await getToken({ req: request });

  // If the user is not authenticated, redirect to login
  if (!token) {
    const url = new URL('/auth/login', request.url);
    url.searchParams.set('callbackUrl', encodeURI(pathname));
    return NextResponse.redirect(url);
  }

  // Special protection for workspace routes
  if (pathname.startsWith('/workspace/')) {
    // Let the workspace context handle the permission check
    // If user doesn't have access, they'll be redirected from the client side
    return response;
  }

  // Special handling for follow-up routes outside workspace context
  if (pathname.startsWith('/follow-up') && !pathname.includes('/workspace/')) {
    // Check if user is super admin - super admins can access follow-up directly
    const isSuperAdmin = token?.isSuperAdmin;

    if (!isSuperAdmin) {
      // Regular users should only access follow-ups through a workspace
      const url = new URL('/workspaces', request.url);
      return NextResponse.redirect(url);
    }
  }

  // User is authenticated - allow access to other protected routes
  return response;
}

export const config = {
  matcher: [
    // Protect routes requiring authentication
    '/((?!auth|_next|images|fonts|api/auth).*)',
    '/api/((?!auth).*)',
  ],
};