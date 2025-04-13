// lib/redis-subscriber.ts
import Redis from 'ioredis';
import { TextEncoder } from 'util'; // Import TextEncoder

// Tipagem para o controller (importar se não estiver globalmente disponível)
type SSEController = ReadableStreamDefaultController<Uint8Array>;

// --- Configuração e Instância Compartilhada ---

const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Importante para pub/sub não desistir fácil
    retryStrategy(times: number): number | null {
        const delay = Math.min(times * 100, 3000); // Aumenta delay máximo
        console.log(`[Shared Redis Subscriber] Tentando reconectar ao Redis (tentativa ${times}). Próxima em ${delay}ms`);
        return delay;
    },
    // Evitar que a conexão feche rapidamente em caso de idle (ajustar se necessário)
    // keepAlive: 30000, // Envia PING a cada 30s
    // enableReadyCheck: false, // Considerar se houver problemas com 'ready' check
};

const sharedSubscriber = new Redis(redisOptions);

sharedSubscriber.on('connect', () => console.log('[Shared Redis Subscriber] Conectado.'));
sharedSubscriber.on('error', (err) => console.error('[Shared Redis Subscriber] Erro:', err));
sharedSubscriber.on('reconnecting', (info) => console.log(`[Shared Redis Subscriber] Reconectando... Tentativa: ${info.attempt}, Delay: ${info.delay}ms`));
sharedSubscriber.on('close', () => console.warn('[Shared Redis Subscriber] Conexão fechada.'));
sharedSubscriber.on('end', () => console.warn('[Shared Redis Subscriber] Conexão terminada (end).')); // Adicionado

// --- Gerenciamento de Inscrições e Controllers ---

// Rastreia quantos clientes estão ouvindo cada canal
const activeSubscriptions = new Map<string, number>();
// Mapeia canais para os controllers dos clientes ouvindo
const channelControllers = new Map<string, Set<SSEController>>();
// Codificador reutilizável
const encoder = new TextEncoder();

export function subscribeToChannel(channel: string): void {
    const currentCount = activeSubscriptions.get(channel) || 0;
    if (currentCount === 0) {
        console.log(`[Shared Redis Subscriber] Primeiro cliente para ${channel}. Inscrevendo...`);
        sharedSubscriber.subscribe(channel).catch(err => {
            console.error(`[Shared Redis Subscriber] Falha ao inscrever em ${channel}:`, err);
        });
    } else {
        console.log(`[Shared Redis Subscriber] Cliente adicional para ${channel}. Contagem: ${currentCount + 1}`);
    }
    activeSubscriptions.set(channel, currentCount + 1);
}

export function unsubscribeFromChannel(channel: string): void {
    const currentCount = activeSubscriptions.get(channel);
    if (currentCount === undefined) {
        console.warn(`[Shared Redis Subscriber] Tentativa de desinscrever de ${channel}, mas não estava inscrito.`);
        return;
    }

    if (currentCount === 1) {
        console.log(`[Shared Redis Subscriber] Último cliente para ${channel}. Desinscrevendo...`);
        sharedSubscriber.unsubscribe(channel).catch(err => {
            console.error(`[Shared Redis Subscriber] Falha ao desinscrever de ${channel}:`, err);
        });
        activeSubscriptions.delete(channel);
        channelControllers.delete(channel); // Limpa controllers também
    } else {
        console.log(`[Shared Redis Subscriber] Cliente desconectado de ${channel}. Contagem restante: ${currentCount - 1}`);
        activeSubscriptions.set(channel, currentCount - 1);
    }
}

export function registerControllerForChannel(channel: string, controller: SSEController): void {
    if (!channelControllers.has(channel)) {
        channelControllers.set(channel, new Set());
    }
    const controllers = channelControllers.get(channel);
    if (controllers) {
         // Verificar se o controller já existe pode ser complexo/impossível, Set lida com isso
        controllers.add(controller);
        console.log(`[Shared Redis Subscriber] Controller registrado para ${channel}. Total: ${controllers.size}`);
    } else {
         console.error(`[Shared Redis Subscriber] Falha ao obter Set de controllers para ${channel} durante registro.`);
    }
}

export function unregisterControllerForChannel(channel: string, controller: SSEController): void {
    const controllers = channelControllers.get(channel);
    if (controllers) {
        controllers.delete(controller);
        console.log(`[Shared Redis Subscriber] Controller desregistrado de ${channel}. Restantes: ${controllers.size}`);
        if (controllers.size === 0) {
            // Se não há mais controllers, podemos remover o canal do Map
            // A desinscrição do Redis é tratada por unsubscribeFromChannel quando a contagem chega a 0
            console.log(`[Shared Redis Subscriber] Nenhum controller restante para ${channel}. Removendo entrada do Map.`);
            channelControllers.delete(channel);
        }
    } else {
        // Isso pode acontecer se unsubscribeFromChannel já limpou
         console.warn(`[Shared Redis Subscriber] Tentativa de desregistrar controller de ${channel}, mas canal não encontrado no Map.`);
    }
}

// --- Listener Central ---

sharedSubscriber.on('message', (channel, message) => {
    console.log(`[Shared Redis Subscriber] Mensagem recebida em ${channel}`); // Log geral
    const controllers = channelControllers.get(channel);

    if (!controllers || controllers.size === 0) {
        console.warn(`[Shared Redis Subscriber] Mensagem recebida em ${channel}, mas não há controllers registrados. Verifique se a desinscrição ocorreu corretamente.`);
        return;
    }

    console.log(`[Shared Redis Subscriber] Encaminhando mensagem de ${channel} para ${controllers.size} controller(s).`);
    console.log(`[Shared Redis Subscriber] Raw message from Redis: ${message}`); // Log da mensagem bruta

    try {
        const parsedMessage = JSON.parse(message);
        console.log(`[Shared Redis Subscriber] Parsed message:`, parsedMessage);

        let eventType: string | null = null;
        let eventPayload: any = null;

        // Lógica para determinar o tipo e payload (baseada na estrutura enviada pelo worker)
        if (parsedMessage && typeof parsedMessage === 'object') {
             if (parsedMessage.type && parsedMessage.payload) {
                 console.log(`[Shared Redis Subscriber] Message has type/payload. Type: ${parsedMessage.type}`);
                 eventType = parsedMessage.type;
                 eventPayload = parsedMessage.payload;
             } else {
                 // Se não tem type/payload, assumir new_message? Rever se necessário.
                 // Por enquanto, o worker envia type/payload, então este else não deve ser atingido para eventos conhecidos.
                 console.warn(`[Shared Redis Subscriber] Message does NOT have type/payload. Assuming 'unknown_event'. Original parsed:`, parsedMessage);
                 eventType = 'unknown_event'; // Ou poderia ser 'new_message' se essa for a regra
                 eventPayload = parsedMessage;
             }
        } else {
             console.error(`[Shared Redis Subscriber] Mensagem recebida não é um JSON object válido:`, message);
             eventType = 'error';
             eventPayload = { error: 'Invalid message format received from Redis' };
        }

        if (eventType && eventPayload) {
            const sseFormattedMessage = `event: ${eventType}\ndata: ${JSON.stringify(eventPayload)}\n\n`;
            const encodedMessage = encoder.encode(sseFormattedMessage);
            console.log(`[Shared Redis Subscriber] Sending SSE Event: Type=${eventType}`);

            // Envia para todos os controllers registrados para este canal
            controllers.forEach(controller => {
                try {
                    console.log(`[Shared Redis Subscriber SENDING] Attempting to enqueue for controller on channel ${channel}. Event type: ${eventType}`);
                    controller.enqueue(encodedMessage);
                } catch (enqueueError: any) {
                    console.error(`[Shared Redis Subscriber] Erro ao enfileirar mensagem para um controller de ${channel}:`, enqueueError.message);
                    // Considerar remover o controller problemático?
                    // controller.error(enqueueError); // Isso fecharia a stream do cliente
                    // unregisterControllerForChannel(channel, controller); // Desregistra
                    // unsubscribeFromChannel(channel); // Tenta desinscrever se necessário
                }
            });
        }

    } catch (parseError) {
        console.error(`[Shared Redis Subscriber] Falha ao processar mensagem SSE de ${channel}:`, parseError);
        console.error(`[Shared Redis Subscriber] Mensagem original: ${message}`);
        // Enviar mensagem de erro para os clientes conectados a este canal?
        const errorFormatted = `event: error\ndata: ${JSON.stringify({ error: "Failed to process message from Redis" })}\n\n`;
        const encodedError = encoder.encode(errorFormatted);
         controllers.forEach(controller => {
             try { controller.enqueue(encodedError); } catch (e) {}
         });
    }
});

// Opcional: Lidar com fechamento gracioso da aplicação
// process.on('SIGTERM', () => {
//   console.log('[Shared Redis Subscriber] Recebido SIGTERM. Fechando conexão Redis...');
//   sharedSubscriber.quit();
// });
// process.on('SIGINT', () => {
//     console.log('[Shared Redis Subscriber] Recebido SIGINT. Fechando conexão Redis...');
//     sharedSubscriber.quit();
// });

console.log('[Shared Redis Subscriber] Módulo inicializado.');

// Exportar a instância pode ser útil para outros usos, mas não é necessário para a API Route SSE
// export { sharedSubscriber };