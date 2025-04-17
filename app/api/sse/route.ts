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

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        streamController = controller;
        channelName = `workspace-updates:${workspaceId}`;
        registerControllerForChannel(channelName, controller);
        subscribeToChannel(channelName);
        controller.enqueue(
          encoder.encode(`event: connection_ready\ndata: {"channel":"${channelName}"}\n\n`)
        );
      },
      cancel(reason) {
        if (channelName && streamController) {
          unregisterControllerForChannel(channelName, streamController);
          unsubscribeFromChannel(channelName);
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
