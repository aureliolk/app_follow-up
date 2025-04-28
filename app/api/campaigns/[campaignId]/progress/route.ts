import { NextRequest } from 'next/server';
import {
  subscribeToChannel,
  unsubscribeFromChannel,
  registerControllerForChannel,
  unregisterControllerForChannel
} from '@/lib/redis-subscriber';

interface RouteParams {
  params: {
    campaignId: string;
  };
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { campaignId } = params;
  if (!campaignId) {
    return new Response('Missing campaignId', { status: 400 });
  }

  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let channelName = `campaign-progress:${campaignId}`;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      registerControllerForChannel(channelName, controller);
      subscribeToChannel(channelName);
      // initial event
      controller.enqueue(
        encoder.encode(`event: connection_ready\ndata: {"channel":"${channelName}"}\n\n`)
      );
    },
    cancel() {
      unregisterControllerForChannel(channelName, streamController);
      unsubscribeFromChannel(channelName);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}