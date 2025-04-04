"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inactiveFollowUpQueue = void 0;
// Exemplo em lib/queues/inactiveFollowUpQueue.ts
var bullmq_1 = require("bullmq");
var redis_1 = require("../../../../packages/shared-lib/src/redis");
var INACTIVE_QUEUE_NAME = 'inactive-follow-up';
exports.inactiveFollowUpQueue = new bullmq_1.Queue(INACTIVE_QUEUE_NAME, {
    connection: redis_1.redisConnection,
    // Default options podem ser ajustados se necessário para esta fila
    defaultJobOptions: {
        attempts: 2, // Talvez menos tentativas para follow-up?
        backoff: { type: 'exponential', delay: 5000 }, // Backoff maior?
        removeOnComplete: true,
        removeOnFail: 5000, // Manter mais falhas para análise?
    }
});
console.log("\uD83D\uDE80 Fila BullMQ \"".concat(INACTIVE_QUEUE_NAME, "\" inicializada."));
exports.inactiveFollowUpQueue.on('error', function (error) {
    console.error("\u274C Erro na fila BullMQ \"".concat(INACTIVE_QUEUE_NAME, "\":"), error);
});
