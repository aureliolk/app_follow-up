// app/api/workspaces/[id]/subscribe/route.ts
import { type NextRequest } from 'next/server';
import { redisConnection } from '@/lib/redis'; // Importar conexão principal
import Redis from 'ioredis'; // Importar tipo Redis para criar subscriber

// Função para criar uma conexão Redis dedicada para subscrição
function createRedisSubscriber() {
    // Use as mesmas configurações da conexão principal ou ajuste se necessário
    const redisOptions = {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null, // Requerido pelo ioredis
        // Adicionar retryStrategy para reconexão robusta
        retryStrategy(times: number): number | null {
            const delay = Math.min(times * 50, 2000); // Ex: 50ms, 100ms, ..., 2000ms
            console.log(`[SSE Workspace Sub] Tentando reconectar ao Redis (tentativa ${times}). Próxima em ${delay}ms`);
            return delay;
        },
    };
    const subscriber = new Redis(redisOptions);

    subscriber.on('connect', () => console.log('[SSE Workspace Sub] Cliente Redis Subscriber conectado.'));
    subscriber.on('error', (err) => console.error('[SSE Workspace Sub] Erro no Cliente Redis Subscriber:', err));
    subscriber.on('reconnecting', () => console.log('[SSE Workspace Sub] Cliente Redis Subscriber reconectando...'));
    subscriber.on('close', () => console.log('[SSE Workspace Sub] Conexão Redis Subscriber fechada.'));

    return subscriber;
}

export function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const redisSubscriber = createRedisSubscriber();
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<any>;

    const stream = new ReadableStream({
        async start(controller) {
            streamController = controller;
            let channelName: string | null = null; // Initialize channelName

            try {
                const { id: workspaceId } = await params;

                if (!workspaceId) {
                    console.error('[SSE Workspace] Erro: Workspace ID ausente após await params.');
                    controller.error(new Error('Workspace ID ausente'));
                    redisSubscriber.quit().catch(e => console.error(`[SSE Workspace] Erro ao fechar Redis sub após erro de ID:`));
                    return; // Aborta o start
                }
                channelName = `workspace-updates:${workspaceId}`; // Assign channelName here
                console.log(`[SSE Workspace] Iniciando stream para canal: ${channelName}`);

                // Listener para mensagens do Redis
                const messageListener = (channel: string, message: string) => {
                    if (channel === channelName) {
                        try {
                            // Tenta fazer parse, mas envia como string mesmo se falhar
                            const parsedMessage = JSON.parse(message);
                            console.log(`[SSE Workspace] Mensagem recebida do Redis (${channelName}):`, parsedMessage);
                            // Formato SSE: data: {json string}\n\n
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsedMessage)}\n\n`));
                        } catch (e) {
                            console.warn(`[SSE Workspace] Mensagem recebida do Redis (${channelName}) não é JSON válido, enviando como string:`, message);
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({raw: message})}\n\n`)); // Envia raw em caso de erro de parse
                        }
                    }
                };

                // Lida com a desconexão do cliente
                request.signal.onabort = () => {
                    console.log(`[SSE Workspace] Cliente desconectado do canal ${channelName || 'desconhecido'}. Fechando stream e Redis sub.`);
                    if (redisSubscriber.status === 'ready' || redisSubscriber.status === 'connecting') {
                        if (channelName) { // Only unsubscribe if channelName was set
                           redisSubscriber.unsubscribe(channelName)
                              .then(() => redisSubscriber.quit())
                              .catch(err => console.error(`[SSE Workspace] Erro ao fechar Redis subscriber para ${channelName}:`, err));
                        } else {
                           redisSubscriber.quit().catch(err => console.error(`[SSE Workspace] Erro ao fechar Redis subscriber (no channelName):`, err));
                        }
                    } else {
                         redisSubscriber.quit().catch(err => console.error(`[SSE Workspace] Erro ao fechar Redis subscriber (não conectado):`, err));
                    }
                     try {
                         if(streamController) streamController.close();
                     } catch (e) {
                        console.error(`[SSE Workspace] Erro ao fechar stream controller para ${channelName || 'desconhecido'}:`, e);
                     }
                };

                // Subscrever ao canal Redis
                await redisSubscriber.subscribe(channelName);
                redisSubscriber.on('message', messageListener);
                console.log(`[SSE Workspace] Subscrito com sucesso ao canal Redis: ${channelName}`);
                // Enviar uma mensagem inicial de confirmação (opcional)
                controller.enqueue(encoder.encode(`event: connection_ready\ndata: {"channel":"${channelName}"}\n\n`));

            } catch (err) {
                console.error(`[SSE Workspace] Erro crítico durante o start do stream:`, err);
                controller.error(new Error(`Falha ao iniciar stream: ${err instanceof Error ? err.message : String(err)}`));
                 redisSubscriber.quit().catch(e => console.error(`[SSE Workspace] Erro ao fechar Redis sub após erro crítico no start:`));
            }
        },
        cancel(reason) {
            console.log(`[SSE Workspace] Stream cancelado. Razão:`, reason);
             if (redisSubscriber.status === 'ready' || redisSubscriber.status === 'connecting') {
                 redisSubscriber.quit()
                     .catch(err => console.error(`[SSE Workspace] Erro ao fechar Redis subscriber (cancel):`, err));
             } else {
                 redisSubscriber.quit().catch(err => console.error(`[SSE Workspace] Erro ao fechar Redis subscriber (cancel/não conectado):`, err));
             }
        }
    });

    // Retornar a resposta com o stream SSE
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            // Opcional: CORS headers se a UI estiver em domínio diferente
            // 'Access-Control-Allow-Origin': '*',
        },
    });
}

// Garantir que a rota seja tratada como dinâmica
export const dynamic = 'force-dynamic';