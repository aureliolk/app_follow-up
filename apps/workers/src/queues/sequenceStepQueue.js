"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequenceStepQueue = void 0;
// apps/workers/src/queues/sequenceStepQueue.ts
var bullmq_1 = require("bullmq");
var redis_1 = require("../../../../packages/shared-lib/src/redis");
var SEQUENCE_QUEUE_NAME = 'sequence-step';
exports.sequenceStepQueue = new bullmq_1.Queue(SEQUENCE_QUEUE_NAME, {
    connection: redis_1.redisConnection,
    defaultJobOptions: {
        attempts: 3, // Tentativas para enviar um passo da sequência
        backoff: { type: 'exponential', delay: 60000 }, // Backoff maior (1 min, 2 min, 4 min)
        removeOnComplete: true, // Remove jobs bem-sucedidos
        removeOnFail: 10000, // Mantém mais jobs falhos para análise
    }
});
console.log("\uD83D\uDE80 Fila BullMQ \"".concat(SEQUENCE_QUEUE_NAME, "\" inicializada."));
exports.sequenceStepQueue.on('error', function (error) {
    console.error("\u274C Erro na fila BullMQ \"".concat(SEQUENCE_QUEUE_NAME, "\":"), error);
});
