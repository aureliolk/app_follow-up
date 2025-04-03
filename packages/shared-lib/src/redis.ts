// lib/redis.ts
import Redis from 'ioredis'; // Use a importação que funcionou na compilação CommonJS
// Se 'import Redis from ...' deu erro na compilação, use:
// import ioredis = require('ioredis');
// const Redis = ioredis;
import type { RedisOptions } from 'ioredis';

console.log('INFO: Forçando conexão Redis via HOST/PORT.');
const connectionOptions: RedisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    // maxRetriesPerRequest: null, // MANTENHA COMO null (se já estava assim) ou MUDE PARA null
    // Certifique-se de que está EXATAMENTE assim:
    maxRetriesPerRequest: null,   // <--- CORREÇÃO AQUI (garanta que é null)
};

const redisInstance = new Redis(connectionOptions);

export const redisConnection = redisInstance;

redisConnection.on('connect', () => console.log('🔌 Conectado ao Redis'));
redisConnection.on('error', (err: Error) => console.error('❌ Erro de conexão Redis:', err));