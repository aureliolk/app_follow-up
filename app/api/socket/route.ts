import { NextRequest, NextResponse } from 'next/server';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { redisConnection } from '@/lib/redis'; // Assumindo que a conexão normal funciona para sub
import Redis from 'ioredis';

// --- Tipagem para resposta HTTP (embora não seja usada diretamente para sockets) ---
type SocketIOResponse = NextResponse & {
  socket: {
    server: HttpServer & {
      io?: SocketIOServer;
    };
  };
};

// --- Instância do Redis Subscriber (Reutilizar ou criar nova?) ---
// Tentar reutilizar a instância existente para simplicidade inicial
// Se der conflito, precisaremos de uma instância separada ou adaptar o sharedSubscriber
let subscriberRedis: Redis | null = null;
const channelHandlers = new Map<string, (message: string) => void>();

function ensureRedisSubscriber() {
    if (!subscriberRedis || subscriberRedis.status !== 'ready') {
        console.log('[Socket API] Criando ou recriando conexão Redis Subscriber...');
        // Usar as mesmas opções do sharedSubscriber, mas instância separada
         const redisOptions = {
             host: process.env.REDIS_HOST || '127.0.0.1',
             port: parseInt(process.env.REDIS_PORT || '6379', 10),
             password: process.env.REDIS_PASSWORD || undefined,
             maxRetriesPerRequest: null,
             retryStrategy(times: number): number | null {
                 const delay = Math.min(times * 100, 3000);
                 console.log(`[Socket API Redis] Tentando reconectar (tentativa ${times}). Próxima em ${delay}ms`);
                 return delay;
             },
         };
        subscriberRedis = new Redis(redisOptions);

        subscriberRedis.on('connect', () => console.log('[Socket API Redis] Subscriber Conectado.'));
        subscriberRedis.on('error', (err) => console.error('[Socket API Redis] Subscriber Erro:', err));
        subscriberRedis.on('reconnecting', (info) => console.log(`[Socket API Redis] Subscriber Reconectando... Tentativa: ${info.attempt}, Delay: ${info.delay}ms`));
        subscriberRedis.on('close', () => console.warn('[Socket API Redis] Subscriber Conexão fechada.'));
        subscriberRedis.on('end', () => console.warn('[Socket API Redis] Subscriber Conexão terminada (end).'));

        subscriberRedis.on('message', (channel, message) => {
            console.log(`[Socket API Redis] Mensagem recebida em ${channel}`);
            const handler = channelHandlers.get(channel);
            if (handler) {
                handler(message);
            } else {
                 // Tentar handler genérico com wildcard?
                 const wildcardChannel = channel.substring(0, channel.indexOf(':') + 1) + '*'; // Ex: workspace-updates:*
                 const wildcardHandler = channelHandlers.get(wildcardChannel);
                 if (wildcardHandler) {
                    wildcardHandler(message); // Passar a mensagem para o handler genérico
                 } else {
                    console.warn(`[Socket API Redis] Nenhuma handler encontrada para canal ${channel} ou wildcard ${wildcardChannel}`);
                 }
            }
        });

        // Re-inscrever nos canais existentes ao reconectar
        subscriberRedis.on('ready', () => {
             console.log('[Socket API Redis] Subscriber pronto. Reinscrevendo em canais ativos...');
             if (channelHandlers.size > 0) {
                 const channels = Array.from(channelHandlers.keys());
                 console.log(`[Socket API Redis] Reinscrevendo em: ${channels.join(', ')}`);
                 subscriberRedis?.subscribe(...channels).catch(err => {
                     console.error('[Socket API Redis] Erro ao reinscrever em canais:', err);
                 });
             }
        });
    }
    return subscriberRedis;
}


// --- Função Principal da API Route ---
export async function GET(req: NextRequest, res: SocketIOResponse) {
    console.log('[Socket API] GET request recebido - Inicializando Socket.IO...');

    // @ts-ignore - Acessando propriedade não padrão para o servidor HTTP
    const httpServer = res.socket?.server as HttpServer;
    if (!httpServer) {
        console.error('[Socket API] Servidor HTTP não encontrado no objeto de resposta.');
        // Retornar um erro HTTP normal aqui, pois a conexão WebSocket falhará
        return new NextResponse('Socket server setup failed', { status: 500 });
    }

    // @ts-ignore - Acessando propriedade não padrão para o servidor HTTP
    let io = httpServer.io as SocketIOServer | undefined;

    if (!io) {
        console.log('[Socket API] Servidor Socket.IO não existe, criando um novo...');
        // @ts-ignore
        io = new SocketIOServer(httpServer, {
            path: '/api/socket', // Garante que o path corresponde à rota
            addTrailingSlash: false,
             cors: {
                 origin: "*", // <<< CUIDADO: Permitir todas as origens (ajustar para produção!)
                 methods: ["GET", "POST"]
             }
        });
        // @ts-ignore
        httpServer.io = io; // Anexa o servidor io ao servidor http para reutilização

        // Garantir que o subscriber Redis está pronto
        ensureRedisSubscriber();

        // --- Lógica Central de Conexão Socket.IO ---
        io.on('connection', (socket) => {
            console.log(`[Socket API] Cliente conectado: ${socket.id}`);

            // Handler para o cliente se juntar a uma sala de workspace
            socket.on('join_workspace', (workspaceId: string) => {
                if (!workspaceId) {
                    console.warn(`[Socket API] Cliente ${socket.id} tentou entrar em workspace sem ID.`);
                    socket.emit('error', 'Workspace ID é necessário.'); // Envia erro de volta
                    return;
                }
                console.log(`[Socket API] Cliente ${socket.id} entrando na sala do workspace: ${workspaceId}`);
                socket.join(workspaceId); // Coloca o socket na sala do workspace

                // Lógica para se inscrever no canal Redis do workspace se ainda não estiver inscrito
                const workspaceChannel = `workspace-updates:${workspaceId}`;
                if (!channelHandlers.has(workspaceChannel)) {
                    console.log(`[Socket API] Primeiro cliente para ${workspaceChannel}. Configurando handler Redis.`);
                    channelHandlers.set(workspaceChannel, (message) => {
                        console.log(`[Socket API Handler] Processando mensagem para ${workspaceChannel}`);
                         try {
                             const parsed = JSON.parse(message);
                             const eventType = parsed.type || 'unknown_event';
                             const payload = parsed.payload || parsed; // Usar payload se existir, senão a mensagem inteira
                             console.log(`[Socket API Handler] Emitindo evento '${eventType}' para sala ${workspaceId}`);
                             io?.to(workspaceId).emit(eventType, payload); // Emite para a sala
                         } catch (e) {
                             console.error(`[Socket API Handler] Erro ao parsear/emitir mensagem de ${workspaceChannel}:`, e);
                             io?.to(workspaceId).emit('error', 'Erro processando atualização do servidor.');
                         }
                    });
                    // Tentar inscrever (se o subscriber estiver pronto)
                    subscriberRedis?.subscribe(workspaceChannel).catch(err => {
                         console.error(`[Socket API] Falha ao inscrever em ${workspaceChannel}:`, err);
                    });
                } else {
                     console.log(`[Socket API] Já existe handler para ${workspaceChannel}. Apenas adicionando socket à sala.`);
                }

                socket.emit('workspace_joined', workspaceId); // Confirma para o cliente
            });

            // Handler para desconexão
            socket.on('disconnect', (reason) => {
                console.log(`[Socket API] Cliente desconectado: ${socket.id}. Razão: ${reason}`);
                // Aqui, NÃO removemos a inscrição do Redis automaticamente
                // A inscrição só deve ser removida se NENHUM cliente estiver mais ouvindo
                // Isso é mais complexo de gerenciar sem um mapeamento socket -> workspaceId
                // TODO: Implementar lógica de contagem ou limpeza periódica de inscrições Redis órfãs se necessário
            });

            // Handler para erros do socket individual
            socket.on('error', (err) => {
                 console.error(`[Socket API] Erro no socket ${socket.id}:`, err);
            });

        });
        console.log('[Socket API] Servidor Socket.IO inicializado e ouvindo conexões.');
    } else {
        console.log('[Socket API] Servidor Socket.IO já está rodando.');
    }

    // A API Route em si precisa retornar algo, mesmo que não seja usado pelo cliente socket.io diretamente
    // Retornar um status 200 OK simples é suficiente.
    // O importante é que o servidor Socket.IO foi injetado no servidor HTTP.
    return new NextResponse(null, { status: 200 });
} 