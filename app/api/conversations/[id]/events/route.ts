// app/api/conversations/[id]/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
// <<< REMOVER importação direta do redisConnection e do tipo Redis daqui (se não usados mais) >>>
// import { redisConnection } from '@/lib/redis'; 
// import Redis from 'ioredis'; 
// <<< IMPORTAR funções do novo módulo >>>
import { 
    subscribeToChannel, 
    unsubscribeFromChannel, 
    registerControllerForChannel, 
    unregisterControllerForChannel 
} from '@/lib/redis-subscriber';
import { TextEncoder } from 'util'; // Garantir que TextEncoder está importado

export const dynamic = 'force-dynamic'; // Garante que a rota não seja estaticamente otimizada

// <<< REMOVER a função local createRedisSubscriber >>>
/*
function createRedisSubscriber() {
    // ... implementação antiga ...
}
*/

// GET Handler for Server-Sent Events
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id: conversationId } = await params;

    if (!conversationId) {
        return new NextResponse('Conversation ID is required', { status: 400 });
    }

    // <<< REMOVER criação da instância local do subscriber >>>
    // const subscriber = createRedisSubscriber();
    
    // Canal ainda é necessário para identificar a conversa
    const channel = `chat-updates:${conversationId}`; 
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder(); // Pode instanciar aqui ou usar um global

    const stream = new ReadableStream({
        start(controller) {
            streamController = controller;
            console.log(`[SSE Route] Iniciando stream para cliente no canal ${channel}`);

            // <<< REGISTRAR controller e INSCREVER no canal via módulo compartilhado >>>
            registerControllerForChannel(channel, streamController);
            subscribeToChannel(channel);

            // <<< REMOVER listener local 'message' >>>
            /*
            subscriber.on('message', (ch, message) => {
                // ... lógica antiga ...
            });
            */

            // <<< REMOVER subscrição local >>>
            /*
            subscriber.subscribe(channel, (err) => {
                // ... lógica antiga ...
            });
            */

            // Enviar mensagem inicial de confirmação (manter)
            try {
                 const initMessage = `event: connection_ready\ndata: ${JSON.stringify({"channel":channel})}\n\n`;
                 streamController.enqueue(encoder.encode(initMessage));
                 console.log(`[SSE Route] Mensagem connection_ready enviada para ${channel}`);
            } catch (e: any) {
                 console.error(`[SSE Route] Erro ao enviar connection_ready para ${channel}:`, e.message);
                 // Considerar fechar a stream se a mensagem inicial falhar?
                 // controller.error(e); 
            }


            // <<< REMOVER listener local de erro do subscriber >>>
            /*
            subscriber.on('error', (error) => {
                // ... lógica antiga ...
            });
            */
        },

        cancel(reason) {
            console.log(`[SSE Route] Stream cancelado para cliente no canal ${channel}. Razão:`, reason);
            
            // <<< DESREGISTRAR controller e DESINSCREVER do canal via módulo compartilhado >>>
            if (streamController) { // Garante que o controller existe antes de desregistrar
                 unregisterControllerForChannel(channel, streamController);
            } else {
                 console.warn(`[SSE Route] Tentativa de cancelamento, mas streamController não estava definido para ${channel}`);
            }
            unsubscribeFromChannel(channel);

            // <<< REMOVER chamadas locais de unsubscribe/quit >>>
            /*
            subscriber.unsubscribe(channel).catch(err => 
                console.error(`[SSE Route] Erro ao desinscrever do canal ${channel}:`, err)
            );
            subscriber.quit().catch(err => 
                console.error(`[SSE Route] Erro ao fechar conexão Redis para ${channel}:`, err)
            );
            */
            console.log(`[SSE Route] Cliente desconectado de ${channel}. Gerenciamento via shared subscriber.`);
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