// lib/redis.ts (VERSÃO DE TESTE SIMPLIFICADA)
import Redis, { RedisOptions } from 'ioredis';

console.log('INFO: Forçando conexão Redis via HOST/PORT.');
const connectionOptions: RedisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1', // Garanta que REDIS_HOST=127.0.0.1 no .env
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};
const redisInstance = new Redis(connectionOptions);

export const redisConnection: Redis = redisInstance;

redisConnection.on('connect', () => console.log('🔌 Conectado ao Redis'));
redisConnection.on('error', (err: Error) => console.error('❌ Erro de conexão Redis:', err));

export default redisConnection;