"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = void 0;
// lib/redis.ts
const ioredis_1 = __importDefault(require("ioredis")); // Use a importação que funcionou na compilação CommonJS
console.log('INFO: Forçando conexão Redis via HOST/PORT.');
const connectionOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    // maxRetriesPerRequest: null, // MANTENHA COMO null (se já estava assim) ou MUDE PARA null
    // Certifique-se de que está EXATAMENTE assim:
    maxRetriesPerRequest: null, // <--- CORREÇÃO AQUI (garanta que é null)
};
const redisInstance = new ioredis_1.default(connectionOptions);
exports.redisConnection = redisInstance;
exports.redisConnection.on('connect', () => console.log('🔌 Conectado ao Redis'));
exports.redisConnection.on('error', (err) => console.error('❌ Erro de conexão Redis:', err));
//# sourceMappingURL=redis.js.map