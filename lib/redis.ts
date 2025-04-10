// lib/redis.ts
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

console.log('INFO: Iniciando conexão Redis...');

const connectionOptions: RedisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis: Tentando reconectar... Tentativa ${times}, delay ${delay}ms`);
        return delay;
    },
    reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
            console.log('Redis: Erro READONLY detectado, tentando reconectar...');
            return true;
        }
        return false;
    }
};

class RedisManager {
    private static instance: Redis | null = null;

    static getInstance(): Redis {
        if (!RedisManager.instance) {
            console.log('Redis: Criando nova instância...');
            RedisManager.instance = new Redis(connectionOptions);
            
            RedisManager.instance.on('connect', () => {
                console.log('🔌 Redis conectado');
            });

            RedisManager.instance.on('error', (err: Error) => {
                console.error('❌ Erro Redis:', err);
            });

            RedisManager.instance.on('ready', () => {
                console.log('✅ Redis pronto para receber comandos');
            });

            RedisManager.instance.on('reconnecting', () => {
                console.log('🔄 Redis reconectando...');
            });

            RedisManager.instance.on('end', () => {
                console.log('🔌 Redis desconectado');
            });
        }

        return RedisManager.instance;
    }

    static async cleanup() {
        if (RedisManager.instance) {
            console.log('Redis: Limpando conexão...');
            await RedisManager.instance.quit();
            RedisManager.instance = null;
            console.log('Redis: Conexão limpa com sucesso');
        }
    }
}

export const redisConnection = RedisManager.getInstance();

// Garantir limpeza adequada em desenvolvimento
if (process.env.NODE_ENV === 'development') {
    process.on('SIGTERM', () => RedisManager.cleanup());
    process.on('SIGINT', () => RedisManager.cleanup());
}

// Testar conexão inicial
redisConnection.ping().then(() => {
    console.log('✅ Redis: Teste de conexão bem sucedido (PING)');
}).catch((err) => {
    console.error('❌ Redis: Teste de conexão falhou:', err);
});