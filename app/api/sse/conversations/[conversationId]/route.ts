import { NextRequest } from 'next/server';
import {
  subscribeToChannel,
  unsubscribeFromChannel,
  registerControllerForChannel,
  unregisterControllerForChannel
} from '@/lib/redis-subscriber'; // Assuming the subscriber library is correctly referenced

// Define interface for route parameters
interface RouteParams {
  params: {
      conversationId: string;
  }
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: RouteParams) {
    const { conversationId } = await params;

    if (!conversationId) {
        // This case should technically not happen with file-based routing, but good practice
        return new Response('Missing conversationId parameter', { status: 400 });
    }

    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    let channelName: string | null = null;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        streamController = controller;
        // <<< Subscribe to the specific conversation channel >>>
        channelName = `chat-updates:${conversationId}`; 
        console.log(`[SSE Conversation] Registering controller for channel: ${channelName}`);
        registerControllerForChannel(channelName, controller);
        console.log(`[SSE Conversation] Subscribing to channel: ${channelName}`);
        subscribeToChannel(channelName);
        
        // Send a connection ready event (optional but helpful for client)
        controller.enqueue(
          encoder.encode(`event: connection_ready\ndata: {"channel":"${channelName}"}\n\n`)
        );
        console.log(`[SSE Conversation] Connection ready event sent for channel: ${channelName}`);
      },
      cancel(reason) {
        console.log(`[SSE Conversation] Stream canceled for channel ${channelName}. Reason: ${reason}`);
        if (channelName && streamController) {
          console.log(`[SSE Conversation] Unregistering controller and unsubscribing from channel: ${channelName}`);
          unregisterControllerForChannel(channelName, streamController);
          unsubscribeFromChannel(channelName);
        }
      }
    });

    // Return the response with the stream and correct SSE headers
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
} 