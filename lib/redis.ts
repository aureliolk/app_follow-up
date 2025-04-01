// lib/redis.ts
import * as IORedisModule from 'ioredis'; // <<< Importar TUDO como um namespace

// Acessar tipos e a classe através do namespace importado
const Redis = IORedisModule.default // Tenta acessar o export default DENTRO do namespace
           || (IORedisModule as any).Redis // Fallback se não houver default, tenta acessar uma propriedade 'Redis'
           || IORedisModule; // Fallback final para o próprio namespace (menos provável)

type RedisOptions = IORedisModule.RedisOptions; // Acessa o tipo do namespace
type RedisInstanceType = IORedisModule.Redis;    // Acessa o tipo da instância do namespace

let redisInstance: RedisInstanceType;

if (process.env.REDIS_URL) {
    console.log('INFO: Usando REDIS_URL para conexão Redis.');
    try {
        // Tenta instanciar usando o 'Redis' que encontramos
        redisInstance = new (Redis as any)(process.env.REDIS_URL, {
            maxRetriesPerRequest: null,
        });
    } catch (e) {
        console.error("Falha ao instanciar Redis com URL, tentando fallback do namespace:", e);
        // Se new Redis() falhar, pode ser que o próprio namespace seja o construtor (menos comum)
         try {
            redisInstance = new (IORedisModule as any)(process.env.REDIS_URL, {
                 maxRetriesPerRequest: null,
            });
         } catch (e2) {
             console.error("Falha no fallback do namespace para URL.");
             throw e2; // Relança o erro original ou o segundo
         }
    }
} else {
    console.log('INFO: Usando REDIS_HOST/PORT para conexão Redis.');
    const connectionOptions: RedisOptions = {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
    };
     try {
        redisInstance = new (Redis as any)(connectionOptions);
     } catch (e) {
        console.error("Falha ao instanciar Redis com Opções, tentando fallback do namespace:", e);
         try {
             redisInstance = new (IORedisModule as any)(connectionOptions);
         } catch (e2) {
            console.error("Falha no fallback do namespace para Opções.");
            throw e2;
         }
     }
}

// Conexão usada pelo BullMQ
export const redisConnection: RedisInstanceType = redisInstance;

redisConnection.on('connect', () => console.log('🔌 Conectado ao Redis'));
redisConnection.on('error', (err: Error) => console.error('❌ Erro de conexão Redis:', err));

export default redisConnection;