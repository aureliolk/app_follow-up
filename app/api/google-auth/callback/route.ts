// /api/google-auth/callback

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db'; // Importar o Prisma Client
import { encrypt } from '@/lib/encryption'; // Importar a função de criptografia

// Variáveis de ambiente necessárias
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
// A redirect URI DEVE ser EXATAMENTE a mesma usada na rota /connect e configurada no Google Cloud
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-auth/callback';

// URL de destino após sucesso ou falha (ajustar conforme necessário)
const successRedirectUrl = process.env.NEXT_PUBLIC_APP_URL || '/';
const errorRedirectUrl = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}?googleAuthError=true` : '/?googleAuthError=true';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // Este agora é o nosso workspaceId
  const error = searchParams.get('error');

  // 1. Verificar erro retornado pelo Google
  if (error) {
    console.error(`Google OAuth Error: ${error}`);
    return NextResponse.redirect(errorRedirectUrl + `&error=${encodeURIComponent(error)}`);
  }

  // 2. Validar state (workspaceId) e code
  if (!code || !state) {
    console.error('Missing code or state (workspaceId) in Google OAuth callback');
    return NextResponse.redirect(errorRedirectUrl + '&error=missing_params');
  }

  const workspaceId = state; // Renomear state para clareza

  // 3. Verificar se as variáveis de ambiente essenciais estão configuradas
  if (!googleClientId || !googleClientSecret) {
    console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables');
    return NextResponse.redirect(errorRedirectUrl + '&error=server_config');
  }

  // 4. Verificar se a chave de criptografia está configurada
  if (!process.env.ENCRYPTION_KEY) {
    console.error('Missing ENCRYPTION_KEY environment variable');
     return NextResponse.redirect(errorRedirectUrl + '&error=server_config_encryption');
  }

  try {
    // 5. Trocar o code por tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
      console.error('Failed to exchange code for tokens:', tokens);
      const errorDesc = tokens.error_description || 'token_exchange_failed';
      return NextResponse.redirect(errorRedirectUrl + `&error=${encodeURIComponent(errorDesc)}`);
    }

    const { access_token, refresh_token, expires_in, scope } = tokens;

    // 6. Criptografar o refresh token
    const encryptedRefreshToken = encrypt(refresh_token);

    // 7. Calcular data de expiração do access token
    const accessTokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // 8. Salvar no banco de dados (no Workspace)
    // Obter email da conta Google
    let googleAccountEmail: string | null = null;
    
    console.log(`Escopos recebidos: ${scope}`);
    
    if (scope.includes('email')) {
      try {
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json();
          googleAccountEmail = userInfo.email;
          console.log(`Email da conta Google obtido: ${googleAccountEmail}`);
        } else {
          console.warn('Failed to fetch Google user info:', await userInfoResponse.text());
        }
      } catch (userInfoError) {
        console.warn('Error fetching Google user info:', userInfoError);
      }
    } else {
      console.warn('Escopo de email não concedido. Escopos disponíveis:', scope);
    }

    // Testar acesso ao Google Calendar com o token recebido
    try {
      console.log('Testando acesso ao Google Calendar...');
      const calendarTestResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      
      if (calendarTestResponse.ok) {
        const calendarData = await calendarTestResponse.json();
        console.log(`Acesso ao Calendar confirmado! Calendários encontrados: ${calendarData.items?.length || 0}`);
      } else {
        console.warn('AVISO: Falha ao acessar o Google Calendar:', await calendarTestResponse.text());
      }
    } catch (calendarError) {
      console.warn('ERRO ao testar acesso ao Calendar:', calendarError);
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        google_refresh_token: encryptedRefreshToken,
        google_access_token_expires_at: accessTokenExpiresAt,
        google_calendar_scopes: scope.split(' '),
        google_account_email: googleAccountEmail,
      },
    });

    // 9. Redirecionar para página de sucesso
    return NextResponse.redirect(successRedirectUrl + '?googleAuthSuccess=true');

  } catch (err) {
    console.error('Error processing Google OAuth callback:', err);
    const errorMessage = err instanceof Error ? err.message : 'internal_error';
     return NextResponse.redirect(errorRedirectUrl + `&error=${encodeURIComponent(errorMessage)}`);
  }
}


