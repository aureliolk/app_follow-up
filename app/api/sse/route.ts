//  /api/sse
import { NextRequest, NextResponse } from 'next/server';
import { redisConnection } from '@/lib/redis';
import type { Redis } from 'ioredis';

// Função para criar um novo cliente Redis para pub/sub (recomendado)
const createSubscriberClient = (): Redis => {
    // Reutiliza a configuração de conexão, mas cria uma instância separada
    // Isso evita conflitos com comandos normais do Redis na mesma conexão
    return redisConnection.duplicate();
};

export const dynamic = 'force-dynamic'; // Garante que a rota não seja estática

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return new NextResponse('Missing workspaceId parameter', { status: 400 });
    }

    console.log(`[SSE] Iniciando stream para Workspace: ${workspaceId}`);

    // Criar um cliente Redis dedicado para a subscrição desta conexão
    const subscriber = createSubscriberClient();
    let intervalId: NodeJS.Timeout | null = null;
    let streamClosed = false;

    const stream = new ReadableStream({
        async start(controller) {
            // Handler para mensagens recebidas do Redis (usando psubscribe para padrões)
            const messageHandler = (pattern: string, channel: string, message: string) => {
                if (streamClosed) return; // Não fazer nada se o stream já foi fechado
                console.log(`[SSE:${workspaceId}] Redis message received on channel ${channel} (Pattern: ${pattern}):`, message);
                try {
                    const parsedMessage = JSON.parse(message);
                    // Formatar mensagem para SSE
                    // O frontend espera um `type` e `payload` dentro do objeto JSON
                    const eventType = parsedMessage.type || 'message'; // Usar 'message' como padrão se não houver tipo
                    const eventData = JSON.stringify(parsedMessage); // Enviar o objeto inteiro
                    controller.enqueue(`event: ${eventType}\ndata: ${eventData}\n\n`);
                    console.log(`[SSE:${workspaceId}] Enqueued event: ${eventType}`);
                } catch (e) {
                    console.error(`[SSE:${workspaceId}] Error parsing Redis message or enqueuing:`, e, "Message:", message);
                    // Não fechar o stream por erro de parse, apenas logar
                }
            };

            subscriber.on('pmessage', messageHandler);

            // Inscrever-se nos canais Redis relevantes
            const chatUpdatesPattern = `chat-updates:*`; // Atualizações de mensagens/status IA
            const workspaceUpdatesChannel = `workspace-updates:${workspaceId}`; // Notificações gerais do workspace

            try {
                // Usar psubscribe para `chat-updates:*`
                await subscriber.psubscribe(chatUpdatesPattern);
                console.log(`[SSE:${workspaceId}] Subscribed to Redis pattern: ${chatUpdatesPattern}`);
                // Usar subscribe normal para o canal específico do workspace
                await subscriber.subscribe(workspaceUpdatesChannel);
                console.log(`[SSE:${workspaceId}] Subscribed to Redis channel: ${workspaceUpdatesChannel}`);

                // Keep-alive: Enviar um comentário a cada 20 segundos para manter a conexão aberta
                intervalId = setInterval(() => {
                    if (streamClosed) {
                        if (intervalId) clearInterval(intervalId);
                        return;
                    }
                    console.log(`[SSE:${workspaceId}] Sending keep-alive ping`);
                    controller.enqueue(':ping\n\n');
                }, 20000); // 20 segundos

            } catch (err) {
                console.error(`[SSE:${workspaceId}] Error subscribing to Redis:`, err);
                controller.error(err); // Sinaliza erro para o stream
                await cleanup(); // Tenta limpar mesmo em caso de erro na inscrição
            }
        },
        async cancel(reason) {
            console.log(`[SSE:${workspaceId}] Stream canceled. Reason:`, reason);
            streamClosed = true; // Marcar que o stream foi fechado
            await cleanup();
        },
    });

    // Função de cleanup para fechar conexões
    const cleanup = async () => {
        console.log(`[SSE:${workspaceId}] Cleaning up resources...`);
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            console.log(`[SSE:${workspaceId}] Keep-alive interval cleared.`);
        }
        if (subscriber) {
            try {
                 // Cancelar subscrições antes de desconectar
                await subscriber.punsubscribe();
                await subscriber.unsubscribe();
                console.log(`[SSE:${workspaceId}] Unsubscribed from Redis channels.`);
                // Fechar a conexão Redis
                subscriber.disconnect();
                console.log(`[SSE:${workspaceId}] Redis subscriber disconnected.`);
            } catch (subError) {
                console.error(`[SSE:${workspaceId}] Error during Redis cleanup:`, subError);
            }
        }
         console.log(`[SSE:${workspaceId}] Cleanup finished.`);
    };

    // Retornar a resposta com o stream e os cabeçalhos corretos para SSE
    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform', // no-transform é importante para proxies
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Desativa buffering no Nginx, se aplicável
        },
    });
}


