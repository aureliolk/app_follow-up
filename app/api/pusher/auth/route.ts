import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import pusher from '@/lib/pusher';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  console.log('[API /api/pusher/auth] Received authentication request');

  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.id) {
    console.warn('[API /api/pusher/auth] Unauthorized - No session found');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const isSuperAdmin = session.user.isSuperAdmin;

  try {
    const formData = await req.formData();
    const socketId = formData.get('socket_id') as string;
    const channelName = formData.get('channel_name') as string;

    console.log(`[API /api/pusher/auth] Authenticating user ${userId} for socket ${socketId} on channel ${channelName}`);

    // Basic validation
    if (!socketId || !channelName) {
      console.warn('[API /api/pusher/auth] Bad request - missing socket_id or channel_name');
      return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
    }

    // Expecting channel format: private-workspace-<workspaceId>
    const match = channelName.match(/^private-workspace-(.+)$/);
    if (!match || !match[1]) {
      console.warn(`[API /api/pusher/auth] Invalid channel name format: ${channelName}`);
      return NextResponse.json({ error: 'Invalid channel name' }, { status: 400 });
    }

    const workspaceId = match[1];
    console.log(`[API /api/pusher/auth] Extracted workspace ID ${workspaceId} from channel ${channelName}`);

    let isAuthorized = false;

    if (isSuperAdmin) {
      console.log(`[API /api/pusher/auth] Granting access to super admin ${userId} for workspace ${workspaceId}`);
      isAuthorized = true;
    } else {
      // Check if the user is a member of the workspace (only if not super admin)
      console.log(`[API /api/pusher/auth] User ${userId} is not super admin. Checking workspace membership...`);
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: workspaceId,
            user_id: userId,
          },
        },
      });

      if (membership) {
        console.log(`[API /api/pusher/auth] User ${userId} is a member of workspace ${workspaceId}`);
        isAuthorized = true;
      } else {
        console.warn(`[API /api/pusher/auth] Forbidden - User ${userId} is not a member of workspace ${workspaceId}`);
      }
    }

    // Final authorization check
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log(`[API /api/pusher/auth] User ${userId} authorized for channel ${channelName}`);

    // Prepare presence data if needed (optional, not used here)
    // const userData = {
    //   user_id: userId,
    //   user_info: {
    //     name: session.user.name,
    //     email: session.user.email,
    //   },
    // };

    // Authorize the channel subscription
    const authResponse = pusher.authorizeChannel(socketId, channelName);
    // If using presence channels, pass userData as the third argument:
    // const authResponse = pusher.authorizeChannel(socketId, channelName, userData);

    console.log('[API /api/pusher/auth] Pusher authorization successful');
    // Pusher client expects the response directly, not nested under JSON
    return new Response(JSON.stringify(authResponse), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[API /api/pusher/auth] Error during authentication:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 