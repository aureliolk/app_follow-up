// /api/google-auth/disconnect
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption'; // Importar função de descriptografia

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId');

  if (!workspaceId) {
    return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
  }

  try {
    // 1. Buscar o workspace para obter o token (se existir)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { google_refresh_token: true },
    });

    if (!workspace) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const encryptedToken = workspace.google_refresh_token;

    // 2. (Opcional mas recomendado) Tentar revogar o token no Google
    if (encryptedToken) {
      try {
        if (!process.env.ENCRYPTION_KEY) {
           console.error('Missing ENCRYPTION_KEY, cannot decrypt token for revocation.');
           // Não impede a desconexão do nosso lado, mas loga o erro.
        } else {
            const refreshToken = decrypt(encryptedToken);
            if (refreshToken) {
              console.log(`Attempting to revoke Google token for workspace ${workspaceId}`);
              const revokeResponse = await fetch('https://oauth2.googleapis.com/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ token: refreshToken }),
              });
              if (!revokeResponse.ok) {
                // Loga o erro, mas não impede a desconexão do nosso DB
                const errorBody = await revokeResponse.text();
                console.warn(`Failed to revoke Google token for workspace ${workspaceId}. Status: ${revokeResponse.status}. Body: ${errorBody}`);
              } else {
                 console.log(`Successfully revoked Google token for workspace ${workspaceId}`);
              }
            }
        }
      } catch (decryptionError) {
        console.error(`Error decrypting or revoking token for workspace ${workspaceId}:`, decryptionError);
        // Continua mesmo se a descriptografia/revogação falhar
      }
    }

    // 3. Limpar os campos no banco de dados
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        google_refresh_token: null,
        google_access_token_expires_at: null,
        google_calendar_scopes: [], // Define como array vazio
        google_account_email: null,
      },
    });

    console.log(`Successfully disconnected Google account for workspace ${workspaceId}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error(`Error disconnecting Google account for workspace ${workspaceId}:`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}


