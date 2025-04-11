// app/api/conversations/[conversationId]/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { redisConnection } from '@/lib/redis'; // Importamos a conexão principal
import Redis from 'ioredis'; // Precisamos do tipo Redis

export const dynamic = 'force-dynamic'; // Garante que a rota não seja estaticamente otimizada

// Função para criar uma conexão Redis dedicada para subscrição
function createRedisSubscriber() {
    const redisOptions = {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        retryStrategy(times: number): number | null {
            const delay = Math.min(times * 50, 2000);
            console.log(`[SSE Route] Tentando reconectar ao Redis (tentativa ${times}). Próxima em ${delay}ms`);
            return delay;
        },
    };
    const subscriber = new Redis(redisOptions);

    subscriber.on('connect', () => console.log('[SSE Route] Cliente Redis Subscriber conectado.'));
    subscriber.on('error', (err) => console.error('[SSE Route] Erro no Cliente Redis Subscriber:', err));
    subscriber.on('reconnecting', () => console.log('[SSE Route] Cliente Redis Subscriber reconectando...'));
    subscriber.on('close', () => console.log('[SSE Route] Conexão Redis Subscriber fechada.'));

    return subscriber;
}

// GET Handler for Server-Sent Events
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const { id: conversationId } = await params;

    if (!conversationId) {
        return new NextResponse('Conversation ID is required', { status: 400 });
    }

    const subscriber = createRedisSubscriber();
    const channel = `chat-updates:${conversationId}`;
    let streamController: ReadableStreamDefaultController<Uint8Array>;

    const stream = new ReadableStream({
        start(controller) {
            streamController = controller;
            console.log(`[SSE Route] Iniciando stream para ${channel}`);

            // Handler para mensagens recebidas no canal Redis
            subscriber.on('message', (ch, message) => {
                if (ch === channel) {
                    console.log(`[SSE Route] Mensagem recebida no canal ${channel}`);
                    try {
                        // Tenta fazer parse da mensagem
                        const parsedMessage = JSON.parse(message);
                        
                        // Padroniza o formato da mensagem
                        let formattedMessage;
                        if (parsedMessage.type && parsedMessage.payload) {
                            // Já está no formato correto { type, payload }
                            formattedMessage = parsedMessage;
                        } else {
                            // Converte para o formato padrão
                            formattedMessage = {
                                type: 'new_message',
                                payload: parsedMessage
                            };
                        }

                        // Envia no formato SSE
                        const sseMessage = `event: ${formattedMessage.type}\ndata: ${JSON.stringify(formattedMessage.payload)}\n\n`;
                        streamController.enqueue(new TextEncoder().encode(sseMessage));
                    } catch (parseError) {
                        console.error(`[SSE Route] Falha ao processar mensagem SSE para ${channel}:`, parseError);
                        console.error(`[SSE Route] Mensagem original: ${message}`);
                        // Envia mensagem de erro para o cliente
                        const errorMessage = `event: error\ndata: {"error": "Failed to process message"}\n\n`;
                        streamController.enqueue(new TextEncoder().encode(errorMessage));
                    }
                }
            });

            // Subscrever ao canal
            subscriber.subscribe(channel, (err) => {
                if (err) {
                    console.error(`[SSE Route] Erro ao subscrever ao canal ${channel}:`, err);
                    controller.error(err);
                    return;
                }
                console.log(`[SSE Route] Subscrito com sucesso ao canal ${channel}`);
                // Enviar mensagem inicial de confirmação
                const initMessage = `event: connection_ready\ndata: {"channel":"${channel}"}\n\n`;
                controller.enqueue(new TextEncoder().encode(initMessage));
            });

            // Lidar com erros na conexão do subscriber
            subscriber.on('error', (error) => {
                console.error(`[SSE Route] Erro no subscriber Redis para ${channel}:`, error);
                try {
                    const errorMessage = `event: error\ndata: {"error": "Redis connection error"}\n\n`;
                    streamController.enqueue(new TextEncoder().encode(errorMessage));
                } catch (e) {
                    console.error("[SSE Route] Erro ao enviar mensagem de erro:", e);
                }
            });
        },

        cancel(reason) {
            console.log(`[SSE Route] Stream cancelado para ${channel}. Razão:`, reason);
            // Quando o cliente desconecta, o stream é cancelado
            subscriber.unsubscribe(channel).catch(err => 
                console.error(`[SSE Route] Erro ao desinscrever do canal ${channel}:`, err)
            );
            subscriber.quit().catch(err => 
                console.error(`[SSE Route] Erro ao fechar conexão Redis para ${channel}:`, err)
            );
            console.log(`[SSE Route] Desinscrito e conexão Redis fechada para ${channel}.`);
        }
    });

    // Configurar headers da resposta SSE
    const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
    });

    // Adicionar CORS headers se necessário
    const origin = request.headers.get('origin');
    if (origin) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return new Response(stream, { headers });
}