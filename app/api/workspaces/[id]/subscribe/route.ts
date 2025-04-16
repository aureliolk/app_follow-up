// app/api/workspaces/[id]/subscribe/route.ts
import { type NextRequest } from 'next/server';

// Garantir que a rota seja tratada como dinâmica
export const dynamic = 'force-dynamic';

export function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  let channelName: string | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      streamController = controller;
      const { id: workspaceId } = await params;
      if (!workspaceId) {
        controller.error(new Error('Workspace ID ausente'));
        return;
      }
      channelName = `workspace-updates:${workspaceId}`;
     
      controller.enqueue(
        encoder.encode(`event: connection_ready\ndata: {"channel":"${channelName}"}\n\n`)
      );
    },
    
  });

  // Retornar a resposta com o stream SSE
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
