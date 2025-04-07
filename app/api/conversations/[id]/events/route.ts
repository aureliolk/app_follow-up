// app/api/conversations/[conversationId]/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { redisConnection } from '@/lib/redis'; // Importamos a conexão principal
import Redis from 'ioredis'; // Precisamos do tipo Redis

export const dynamic = 'force-dynamic'; // Garante que a rota não seja estaticamente otimizada

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const awaitedParams = await params;
    const { id: conversationId } = awaitedParams;

    if (!conversationId) {
        return new NextResponse('Conversation ID is required', { status: 400 });
    }

    // É recomendado usar uma conexão separada para operações de subscrição (blocking)
    // Reutilizamos as opções de conexão, mas criamos uma nova instância
    const subscriber = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
    });

    const channel = `chat-updates:${conversationId}`;
    let streamController: ReadableStreamDefaultController<Uint8Array>;

    const stream = new ReadableStream({
        start(controller) {
            streamController = controller;
            console.log(`[SSE Route] Iniciando stream para ${channel}`);

            // Lidar com erros na conexão do subscriber
            subscriber.on('error', (error) => {
                console.error(`[SSE Route] Erro no subscriber Redis para ${channel}:`, error);
                try {
                    streamController.error(error);
                    streamController.close(); // Fecha o stream em caso de erro grave
                } catch (e) {
                    console.error("[SSE Route] Erro ao fechar stream após erro do Redis:", e);
                }
                subscriber.quit(); // Tenta fechar a conexão do subscriber
            });

            // Handler para mensagens recebidas no canal Redis
            subscriber.on('message', (ch, message) => {
                 if (ch === channel) {
                    console.log(`[SSE Route] Mensagem recebida no canal ${channel}`);
                    try {
                        // Tentar parsear a mensagem (assumindo que foi publicada como JSON string)
                        // Não precisamos necessariamente parsear aqui, podemos apenas encaminhar
                        // const parsedMessage = JSON.parse(message);

                        // Formata a mensagem para SSE: event e data
                        // Usamos 'new-message' como nome do evento
                        const sseMessage = `event: new-message\ndata: ${message}\n\n`;
                        streamController.enqueue(new TextEncoder().encode(sseMessage));
                    } catch (parseError) {
                        console.error(`[SSE Route] Falha ao processar/enviar mensagem SSE para ${channel}:`, parseError);
                        console.error(`[SSE Route] Mensagem original: ${message}`);
                        // Não fechar o stream por um erro de parse, apenas logar
                    }
                 }
            });

            // Subscreve ao canal
            subscriber.subscribe(channel, (err, count) => {
                if (err) {
                    console.error(`[SSE Route] Falha ao subscrever ao canal ${channel}:`, err);
                    streamController.error(err);
                    streamController.close();
                    subscriber.quit();
                } else {
                    console.log(`[SSE Route] Subscrito com sucesso ao canal ${channel}. Contagem: ${count}`);
                    // Envia uma mensagem inicial para confirmar a conexão (opcional)
                    const initMessage = `event: connected\ndata: {"message": "Conectado ao stream da conversa ${conversationId}"}\n\n`;
                    streamController.enqueue(new TextEncoder().encode(initMessage));
                }
            });
        },
        cancel(reason) {
            console.log(`[SSE Route] Stream cancelado para ${channel}. Razão:`, reason);
            // Quando o cliente desconecta, o stream é cancelado
            subscriber.unsubscribe(channel);
            subscriber.quit();
            console.log(`[SSE Route] Desinscrito e conexão Redis fechada para ${channel}.`);
        },
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            // Opcional: Headers CORS se seu frontend estiver em um domínio diferente
            // 'Access-Control-Allow-Origin': '*',
        },
    });
}