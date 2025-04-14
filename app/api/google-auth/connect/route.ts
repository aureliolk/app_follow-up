// /api/google-auth/connect

import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId'); // <<< Mudar de clientId para workspaceId

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'Workspace ID is required' }, // <<< Atualizar mensagem de erro
      { status: 400 }
    );
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    console.error('Missing GOOGLE_CLIENT_ID environment variable');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  // Certifique-se que esta URI corresponde EXATAMENTE à configurada no Google Cloud Console
  // Para desenvolvimento local, use http://localhost:PORTA/api/google-auth/callback
  // Para produção, use https://SEU_DOMINIO/api/google-auth/callback
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-auth/callback';

  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    // Adicione outros escopos se necessário (openid, email, profile)
    // 'openid',
    // 'email',
    // 'profile',
  ];

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', googleClientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('access_type', 'offline'); // Necessário para obter o refresh_token
  authUrl.searchParams.set('prompt', 'consent'); // Força a tela de consentimento (bom para primeira vez e re-autenticação)
  authUrl.searchParams.set('state', workspaceId); // <<< Passa o workspaceId no state

  return NextResponse.redirect(authUrl.toString());
}


