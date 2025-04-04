"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageProcessingQueue = void 0;
// lib/queues/messageProcessingQueue.ts
var bullmq_1 = require("bullmq");
var redis_1 = require("../../../../packages/shared-lib/src/redis");
var QUEUE_NAME = 'message-processing';
// Exporta a instância da fila
exports.messageProcessingQueue = new bullmq_1.Queue(QUEUE_NAME, {
    connection: redis_1.redisConnection,
    defaultJobOptions: {
        attempts: 3, // Tenta reprocessar 3 vezes em caso de falha
        backoff: {
            type: 'exponential',
            delay: 1000, // Espera 1s, depois 2s, depois 4s
        },
        removeOnComplete: true, // Remove jobs bem-sucedidos
        removeOnFail: 1000, // Mantém jobs falhos por 1000 jobs
    }
});
console.log("\uD83D\uDE80 Fila BullMQ \"".concat(QUEUE_NAME, "\" inicializada."));
// Opcional: Event listeners para a fila
exports.messageProcessingQueue.on('error', function (error) {
    console.error("\u274C Erro na fila BullMQ \"".concat(QUEUE_NAME, "\":"), error);
});
