//  /api/sse
import { NextRequest, NextResponse } from 'next/server';
import { TextEncoder } from 'util';

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
        console.log(`[SSE Route] Iniciando stream para cliente no canal ${channelName}`);

        // COMMENTED OUT Redis logic
        // registerControllerForChannel(channelName, controller);
        // subscribeToChannel(channelName);
        console.log(`[SSE Route] TODO: Implement Supabase Realtime subscription for channel: ${channelName}`);

        // Keep initial connection message
        try {
          const initMessage = `event: connection_ready\ndata: ${JSON.stringify({ channel: channelName })}\n\n`;
          controller.enqueue(encoder.encode(initMessage));
          console.log(`[SSE Route] Mensagem connection_ready enviada para ${channelName}`);
        } catch (e: any) {
          console.error(`[SSE Route] Erro ao enviar connection_ready para ${channelName}:`, e.message);
        }
      },
      cancel(reason) {
        console.log(`[SSE Route] Stream cancelado para cliente no canal ${channelName}. Razão:`, reason);
        // COMMENTED OUT Redis logic
        // if (streamController) {
        //   unregisterControllerForChannel(channelName, streamController);
        // }
        // unsubscribeFromChannel(channelName);
        console.log(`[SSE Route] TODO: Implement Supabase Realtime unsubscription for channel: ${channelName}`);
        console.log(`[SSE Route] Cliente desconectado de ${channelName}. Gerenciamento será via Supabase Realtime.`);
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
