// /api/google-auth/disconnect
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption'; // Importar função de descriptografia

export async function POST(request: NextRequest) {
  try {
    // Verificar se temos parâmetros na URL
    const url = new URL(request.url);
    const workspaceIdFromQuery = url.searchParams.get('workspaceId');
    const reconnectFromQuery = url.searchParams.get('force') === 'true';
    
    // Tentar pegar parâmetros do corpo, se houver
    let workspaceIdFromBody: string | undefined;
    let reconnectFromBody: boolean | undefined;
    
    try {
      const body = await request.json();
      workspaceIdFromBody = body.workspaceId;
      reconnectFromBody = body.reconnect;
    } catch (e) {
      // Ignora erro de parse se não houver corpo JSON
    }
    
    // Priorizar parâmetros do corpo, senão usar os da query
    const workspaceId = workspaceIdFromBody || workspaceIdFromQuery;
    const reconnect = reconnectFromBody !== undefined ? reconnectFromBody : reconnectFromQuery;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

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
        google_calendar_scopes: [],
        google_account_email: null
      }
    });

    console.log(`Successfully disconnected Google account for workspace ${workspaceId}`);

    // Se foi solicitada reconexão imediata, redirecionar para o endpoint de conexão
    if (reconnect) {
      const connectUrl = `/api/google-auth/connect?workspaceId=${encodeURIComponent(workspaceId)}`;
      return NextResponse.json({
        success: true,
        message: 'Google account disconnected successfully and ready for reconnection',
        redirectUrl: connectUrl
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Google account disconnected successfully'
    });
  } catch (error: any) {
    console.error('Error disconnecting Google account:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Google account', details: error.message },
      { status: 500 }
    );
  }
}


