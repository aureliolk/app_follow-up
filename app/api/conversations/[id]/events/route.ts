// app/api/conversations/[id]/events/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { TextEncoder } from 'util'; // Garantir que TextEncoder está importado

export const dynamic = 'force-dynamic'; // Garante que a rota não seja estaticamente otimizada


// GET Handler for Server-Sent Events
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id: conversationId } = await params;

    if (!conversationId) {
        return new NextResponse('Conversation ID is required', { status: 400 });
    }

   
    const channel = `chat-updates:${conversationId}`; 
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder(); // Pode instanciar aqui ou usar um global

    const stream = new ReadableStream({
        start(controller) {
            streamController = controller;
            console.log(`[SSE Route] Iniciando stream para cliente no canal ${channel}`);

            console.log(`[SSE Route] TODO: Implement Supabase Realtime subscription for channel: ${channel}`);

            try {
                 const initMessage = `event: connection_ready\ndata: ${JSON.stringify({"channel":channel})}\n\n`;
                 streamController.enqueue(encoder.encode(initMessage));
                 console.log(`[SSE Route] Mensagem connection_ready enviada para ${channel}`);
            } catch (e: any) {
                 console.error(`[SSE Route] Erro ao enviar connection_ready para ${channel}:`, e.message);              
            }
        },

        cancel(reason) {
            console.log(`[SSE Route] Stream cancelado para cliente no canal ${channel}. Razão:`, reason);
        
            console.log(`[SSE Route] TODO: Implement Supabase Realtime unsubscription for channel: ${channel}`);
            
            console.log(`[SSE Route] Cliente desconectado de ${channel}. Gerenciamento será via Supabase Realtime.`); // Updated log
        }
    });

    // Configurar headers da resposta SSE (manter)
    const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        // 'X-Accel-Buffering': 'no' // Adicionar se estiver atrás de Nginx ou similar
    });

    // Adicionar CORS headers se necessário (manter)
    const origin = request.headers.get('origin');
    // <<< Ser mais explícito sobre origens permitidas em produção >>>
    const allowedOrigin = process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_SSE_ORIGIN // Ler de variável de ambiente
        : origin; // Permitir qualquer origem em dev (ou especificar localhost)

    if (allowedOrigin) {
        headers.set('Access-Control-Allow-Origin', allowedOrigin);
        headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return new Response(stream, { headers });
}