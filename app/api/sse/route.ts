//  /api/sse
import { NextRequest } from 'next/server';
import {
  subscribeToChannel,
  unsubscribeFromChannel,
  registerControllerForChannel,
  unregisterControllerForChannel
} from '@/lib/redis-subscriber';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return new Response('Missing workspaceId parameter', { status: 400 });
    }

    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    let channelName: string | null = null;
    let pingIntervalId: NodeJS.Timeout | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        channelName = `workspace-updates:${workspaceId}`;
        console.log(`[SSE Route] Starting stream for ${channelName}`);
        // registerControllerForChannel(channelName, controller);
        // subscribeToChannel(channelName);
        
        controller.enqueue(
          encoder.encode(`event: connection_ready\ndata: {"message":"SSE Connected - Ping Only Mode"}\n\n`)
        );

        pingIntervalId = setInterval(() => {
          try {
            console.log(`[SSE Route PING ONLY] Sending periodic PING for ${channelName}`);
            controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
          } catch (e: any) {
            console.error(`[SSE Route PING ONLY] Error sending PING for ${channelName}: ${e.message}`);
            if (pingIntervalId) clearInterval(pingIntervalId);
          }
        }, 5000);
      },
      cancel(reason) {
        console.log(`[SSE Route PING ONLY] Stream canceled for ${channelName}. Reason: ${reason}`);
        if (pingIntervalId) clearInterval(pingIntervalId);
        if (channelName && streamController) {
          // Não precisa mais desregistrar/desinscrever do Redis aqui
          // console.log(`[SSE Route] Unregistering controller and unsubscribing from ${channelName}`);
          // unregisterControllerForChannel(channelName, streamController);
          // unsubscribeFromChannel(channelName);
        }
      }
    });

    // Retornar a resposta com o stream e os cabeçalhos corretos para SSE
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
