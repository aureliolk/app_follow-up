"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// lib/workers/inactiveFollowUpProcessor.ts
var bullmq_1 = require("bullmq");
var redis_1 = require("../../../packages/shared-lib/src/redis"); // <---  no final
var db_1 = require("../../../packages/shared-lib/src/db"); // <---  no final
var lumibotSender_1 = require("../../../packages/shared-lib/src/channel/lumibotSender"); // <--- .js no final
// Importar Enums e Tipos do Prisma Client
var client_1 = require("@prisma/client");
var INACTIVE_QUEUE_NAME = 'inactive-follow-up';
function processInactiveJob(job) {
    return __awaiter(this, void 0, void 0, function () {
        var jobId, _a, conversationId, aiMessageTimestamp, workspaceId, conversation, aiTimestamp, clientResponded, workspaceData, ruleToSend, lumibot_account_id, lumibot_api_token, messageToSend, sendResult, logTimestamp, logError_1, error_1;
        var _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    jobId = job.id || job.name || 'unknown-inactive-job';
                    _a = job.data, conversationId = _a.conversationId, aiMessageTimestamp = _a.aiMessageTimestamp, workspaceId = _a.workspaceId;
                    console.log("\n--- [InactiveWorker ".concat(jobId, "] IN\u00CDCIO ---"));
                    console.log("[InactiveWorker ".concat(jobId, "] Verificando inatividade para Conv: ").concat(conversationId, ", Timestamp Base IA: ").concat(aiMessageTimestamp, ", Workspace: ").concat(workspaceId));
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 9, , 10]);
                    // 1. Buscar a conversa ATUALIZADA do banco de dados
                    console.log("[InactiveWorker ".concat(jobId, "] Buscando dados da conversa ").concat(conversationId, "..."));
                    return [4 /*yield*/, db_1.prisma.conversation.findUnique({
                            where: { id: conversationId },
                            select: {
                                id: true,
                                status: true,
                                last_message_at: true,
                                channel_conversation_id: true,
                                workspace_id: true,
                                client: { select: { name: true } },
                                // Incluir as regras associadas ao workspace da conversa para pegar a correta
                                workspace: {
                                    select: {
                                        lumibot_account_id: true,
                                        lumibot_api_token: true,
                                        ai_follow_up_rules: {
                                            orderBy: { delay_milliseconds: 'asc' }, // Ordena para pegar a de menor delay
                                            select: { id: true, message_content: true, delay_milliseconds: true } // Seleciona dados da regra
                                        }
                                    }
                                }
                            },
                        })];
                case 2:
                    conversation = _g.sent();
                    if (!conversation) {
                        console.warn("[InactiveWorker ".concat(jobId, "] Conversa ").concat(conversationId, " n\u00E3o encontrada no DB. Ignorando job."));
                        return [2 /*return*/, { status: 'skipped', reason: 'Conversa não encontrada' }];
                    }
                    console.log("[InactiveWorker ".concat(jobId, "] Conversa encontrada: Status=").concat(conversation.status, ", LastMsgAt=").concat((_b = conversation.last_message_at) === null || _b === void 0 ? void 0 : _b.toISOString()));
                    // 2. Verificar se a conversa ainda está ATIVA
                    if (conversation.status !== client_1.ConversationStatus.ACTIVE) { // Usar Enum importado
                        console.log("[InactiveWorker ".concat(jobId, "] Conversa ").concat(conversationId, " n\u00E3o est\u00E1 mais ativa (Status: ").concat(conversation.status, "). Follow-up de inatividade cancelado."));
                        return [2 /*return*/, { status: 'skipped', reason: "Conversa n\u00E3o ativa (".concat(conversation.status, ")") }];
                    }
                    console.log("[InactiveWorker ".concat(jobId, "] Conversa est\u00E1 ATIVA."));
                    aiTimestamp = new Date(aiMessageTimestamp);
                    // <<< LOG DETALHADO DA COMPARAÇÃO DE DATAS >>>
                    console.log("[InactiveWorker ".concat(jobId, "] Comparando Timestamps:"));
                    console.log("  -> AI Msg Timestamp (Date): ".concat(aiTimestamp.toISOString(), ", Tipo: ").concat(typeof aiTimestamp));
                    console.log("  -> Conv Last Msg At (Date): ".concat(((_c = conversation.last_message_at) === null || _c === void 0 ? void 0 : _c.toISOString()) || 'N/A', ", Tipo: ").concat(typeof conversation.last_message_at));
                    clientResponded = !!conversation.last_message_at && conversation.last_message_at > aiTimestamp;
                    console.log("[InactiveWorker ".concat(jobId, "] Verificando resposta do cliente: Cliente respondeu ap\u00F3s ").concat(aiTimestamp.toISOString(), "? ").concat(clientResponded));
                    if (clientResponded) {
                        console.log("[InactiveWorker ".concat(jobId, "] Cliente respondeu (LastMsg: ").concat((_d = conversation.last_message_at) === null || _d === void 0 ? void 0 : _d.toISOString(), "). Follow-up de inatividade cancelado."));
                        return [2 /*return*/, { status: 'skipped', reason: 'Cliente respondeu' }];
                    }
                    console.log("[InactiveWorker ".concat(jobId, "] Cliente N\u00C3O respondeu. Prosseguindo para enviar follow-up."));
                    workspaceData = conversation.workspace;
                    if (!workspaceData) {
                        // Improvável, mas checa por segurança
                        console.error("[InactiveWorker ".concat(jobId, "] Dados do Workspace para a conversa ").concat(conversationId, " n\u00E3o encontrados. Imposs\u00EDvel enviar."));
                        throw new Error("Workspace para a conversa ".concat(conversationId, " n\u00E3o encontrado."));
                    }
                    ruleToSend = (_e = workspaceData.ai_follow_up_rules) === null || _e === void 0 ? void 0 : _e[0];
                    if (!ruleToSend) {
                        console.warn("[InactiveWorker ".concat(jobId, "] Nenhuma regra de AI Follow-Up encontrada para o workspace ").concat(workspaceId, ". N\u00E3o \u00E9 poss\u00EDvel enviar follow-up."));
                        return [2 /*return*/, { status: 'skipped', reason: "Nenhuma regra de AI Follow-Up encontrada" }];
                    }
                    console.log("[InactiveWorker ".concat(jobId, "] Usando regra ID: ").concat(ruleToSend.id, " (Delay: ").concat(ruleToSend.delay_milliseconds, "ms)"));
                    lumibot_account_id = workspaceData.lumibot_account_id, lumibot_api_token = workspaceData.lumibot_api_token;
                    if (!lumibot_account_id || !lumibot_api_token) {
                        console.warn("[InactiveWorker ".concat(jobId, "] Credenciais Lumibot ausentes para workspace ").concat(workspaceId, ". N\u00E3o \u00E9 poss\u00EDvel enviar."));
                        return [2 /*return*/, { status: 'skipped', reason: 'Credenciais Lumibot ausentes' }];
                    }
                    if (!conversation.channel_conversation_id) {
                        console.warn("[InactiveWorker ".concat(jobId, "] channel_conversation_id ausente para conversa ").concat(conversationId, ". N\u00E3o \u00E9 poss\u00EDvel enviar."));
                        return [2 /*return*/, { status: 'skipped', reason: 'channel_conversation_id ausente' }];
                    }
                    console.log("[InactiveWorker ".concat(jobId, "] Credenciais Lumibot e ID da conversa do canal OK."));
                    messageToSend = ruleToSend.message_content;
                    console.log("[InactiveWorker ".concat(jobId, "] Mensagem original da regra: \"").concat(messageToSend, "\""));
                    if ((_f = conversation.client) === null || _f === void 0 ? void 0 : _f.name) {
                        messageToSend = messageToSend.replace(/\[NomeCliente\]/gi, conversation.client.name);
                        console.log("[InactiveWorker ".concat(jobId, "] Placeholder [NomeCliente] substitu\u00EDdo."));
                    }
                    // Adicionar mais placeholders se necessário
                    console.log("[InactiveWorker ".concat(jobId, "] Mensagem final a ser enviada: \"").concat(messageToSend, "\""));
                    // ---------------------------------------------
                    // 6. Enviar a mensagem de acompanhamento via Lumibot
                    console.log("[InactiveWorker ".concat(jobId, "] Chamando enviarTextoLivreLumibot..."));
                    return [4 /*yield*/, (0, lumibotSender_1.enviarTextoLivreLumibot)(lumibot_account_id, conversation.channel_conversation_id, lumibot_api_token, messageToSend)];
                case 3:
                    sendResult = _g.sent();
                    console.log("[InactiveWorker ".concat(jobId, "] Resultado do envio Lumibot:"), JSON.stringify(sendResult)); // Log completo do resultado
                    if (!sendResult.success) {
                        // Lança erro para BullMQ tentar novamente se configurado
                        console.error("[InactiveWorker ".concat(jobId, "] Falha detalhada ao enviar follow-up:"), sendResult.responseData);
                        throw new Error("Falha ao enviar follow-up de inatividade para Lumibot: ".concat(JSON.stringify(sendResult.responseData)));
                    }
                    console.log("[InactiveWorker ".concat(jobId, "] Follow-up de inatividade enviado com sucesso para Lumibot."));
                    _g.label = 4;
                case 4:
                    _g.trys.push([4, 7, , 8]);
                    logTimestamp = new Date();
                    return [4 /*yield*/, db_1.prisma.message.create({
                            data: {
                                conversation_id: conversationId,
                                sender_type: client_1.MessageSenderType.SYSTEM, // Ou AI, dependendo da sua definição
                                content: "[Follow-up Inatividade Enviado | Regra: ".concat(ruleToSend.id, "] ").concat(messageToSend), // Conteúdo para registro interno
                                timestamp: logTimestamp,
                                metadata: { ruleId: ruleToSend.id, type: 'inactive_followup_sent' }
                            }
                        })];
                case 5:
                    _g.sent();
                    // ATUALIZA o last_message_at da conversa para refletir essa mensagem do sistema
                    return [4 /*yield*/, db_1.prisma.conversation.update({
                            where: { id: conversationId },
                            data: { last_message_at: logTimestamp }
                        })];
                case 6:
                    // ATUALIZA o last_message_at da conversa para refletir essa mensagem do sistema
                    _g.sent();
                    console.log("[InactiveWorker ".concat(jobId, "] Mensagem de log do follow-up salva e timestamp da conversa atualizado."));
                    return [3 /*break*/, 8];
                case 7:
                    logError_1 = _g.sent();
                    console.warn("[InactiveWorker ".concat(jobId, "] Falha ao salvar log ou atualizar timestamp p\u00F3s-envio:"), logError_1);
                    return [3 /*break*/, 8];
                case 8:
                    console.log("--- [InactiveWorker ".concat(jobId, "] FIM (Sucesso) ---"));
                    return [2 /*return*/, { status: 'completed' }];
                case 9:
                    error_1 = _g.sent();
                    console.error("[InactiveWorker ".concat(jobId, "] Erro CR\u00CDTICO ao processar job de inatividade para conversa ").concat(conversationId, ":"), error_1);
                    // Loga o erro completo para diagnóstico
                    if (error_1 instanceof Error) {
                        console.error(error_1.stack);
                    }
                    console.log("--- [InactiveWorker ".concat(jobId, "] FIM (Erro Cr\u00EDtico) ---"));
                    throw error_1; // Re-lança para BullMQ tratar como falha
                case 10: return [2 /*return*/];
            }
        });
    });
}
// --- Inicialização do Worker ---
console.log('[InactiveWorker] Tentando inicializar o worker...');
try {
    var inactiveWorker = new bullmq_1.Worker(INACTIVE_QUEUE_NAME, processInactiveJob, {
        connection: redis_1.redisConnection,
        concurrency: 5, // Ajuste conforme necessário (5 é um bom começo)
        // Aumentar lock duration pode ajudar se o processamento for longo, mas cuidado com jobs presos
        // lockDuration: 60000 // 60 segundos (padrão é 30s)
    });
    // --- Listeners de Eventos ---
    inactiveWorker.on('completed', function (job, result) {
        var _a;
        console.log("[InactiveWorker] Job ".concat(job.id || 'N/A', " (Conv: ").concat((_a = job.data) === null || _a === void 0 ? void 0 : _a.conversationId, ") conclu\u00EDdo. Status: ").concat((result === null || result === void 0 ? void 0 : result.status) || 'completed', ". Raz\u00E3o: ").concat((result === null || result === void 0 ? void 0 : result.reason) || 'N/A'));
    });
    inactiveWorker.on('failed', function (job, err) {
        var _a;
        var jobId = (job === null || job === void 0 ? void 0 : job.id) || 'N/A';
        var convId = ((_a = job === null || job === void 0 ? void 0 : job.data) === null || _a === void 0 ? void 0 : _a.conversationId) || 'N/A';
        var attempts = (job === null || job === void 0 ? void 0 : job.attemptsMade) || 0;
        console.error("[InactiveWorker] Job ".concat(jobId, " (Conv: ").concat(convId, ") falhou ap\u00F3s ").concat(attempts, " tentativas:"), err.message);
        // Log completo do erro para mais detalhes
        console.error(err);
    });
    inactiveWorker.on('error', function (err) {
        console.error('[InactiveWorker] Erro geral:', err);
    });
    inactiveWorker.on('stalled', function (jobId) {
        console.warn("[InactiveWorker] Job ".concat(jobId, " estagnou (stalled). Verifique a conex\u00E3o e o processamento."));
    });
    console.log("[InactiveWorker] Worker iniciado e escutando a fila \"".concat(INACTIVE_QUEUE_NAME, "\"..."));
}
catch (initError) {
    console.error('[InactiveWorker] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1); // Sai se não conseguir inicializar
}
