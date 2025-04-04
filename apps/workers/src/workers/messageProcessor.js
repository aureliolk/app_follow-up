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
// lib/workers/messageProcessor.ts
var bullmq_1 = require("bullmq");
var redis_1 = require("../../../../packages/shared-lib/src/redis"); // <-- 
var db_1 = require("../../../../packages/shared-lib/src/db"); // <-- 
var chatService_1 = require("../../../../packages/shared-lib/src/ai/chatService"); // <-- 
var lumibotSender_1 = require("../../../../packages/shared-lib/src/channel/lumibotSender"); // <-- 
var client_1 = require("@prisma/client"); // Importar tipos e Enums
var QUEUE_NAME = 'message-processing';
var BUFFER_TIME_MS = 3000; // 3 segundos de buffer (ajuste se necessário)
var HISTORY_LIMIT = 20; // Número máximo de mensagens no histórico para IA
function processJob(job) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, conversationId, clientId, newMessageId, workspaceId, receivedTimestamp, jobId, conversation, lastAiMessage, fetchMessagesSince, newClientMessages, latestClientMessageInBatch, historyMessages, aiMessages, systemPrompt, _b, lumibot_account_id, lumibot_api_token, aiResponseContent, newAiMessageTimestamp, newAiMessage, sendSuccess, sendResult, error_1;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _a = job.data, conversationId = _a.conversationId, clientId = _a.clientId, newMessageId = _a.newMessageId, workspaceId = _a.workspaceId, receivedTimestamp = _a.receivedTimestamp;
                    jobId = job.id || 'unknown';
                    console.log("\n--- [MsgProcessor ".concat(jobId, "] IN\u00CDCIO ---"));
                    console.log("[MsgProcessor ".concat(jobId, "] Processando msg ").concat(newMessageId, " para Conv ").concat(conversationId, ", Cliente ").concat(clientId, ", Wks ").concat(workspaceId));
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 15, , 16]);
                    // --- 1. Buffer Inicial Simples ---
                    console.log("[MsgProcessor ".concat(jobId, "] Aguardando ").concat(BUFFER_TIME_MS, "ms (buffer)..."));
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, BUFFER_TIME_MS); })];
                case 2:
                    _d.sent();
                    console.log("[MsgProcessor ".concat(jobId, "] Buffer inicial conclu\u00EDdo."));
                    return [4 /*yield*/, db_1.prisma.conversation.findUnique({
                            where: { id: conversationId },
                            select: {
                                id: true,
                                is_ai_active: true,
                                channel_conversation_id: true,
                                workspace_id: true,
                                // Selecionar também dados do workspace necessários aqui
                                workspace: {
                                    select: {
                                        id: true,
                                        ai_default_system_prompt: true,
                                        lumibot_account_id: true,
                                        lumibot_api_token: true,
                                        // Incluir regras para agendamento posterior
                                        ai_follow_up_rules: {
                                            orderBy: { delay_milliseconds: 'asc' },
                                            select: { id: true, delay_milliseconds: true },
                                            take: 1 // Só precisamos da primeira (menor delay)
                                        }
                                    }
                                }
                            }
                        })];
                case 3:
                    conversation = _d.sent();
                    if (!conversation) {
                        console.error("[MsgProcessor ".concat(jobId, "] Erro: Conversa ").concat(conversationId, " n\u00E3o encontrada."));
                        // Lançar erro pode fazer o job tentar novamente, o que pode ser útil
                        // ou retornar um status de falha controlada.
                        throw new Error("Conversa ".concat(conversationId, " n\u00E3o encontrada."));
                    }
                    if (!conversation.workspace) {
                        console.error("[MsgProcessor ".concat(jobId, "] Erro: Workspace associado \u00E0 conversa ").concat(conversationId, " n\u00E3o encontrado."));
                        throw new Error("Workspace para a conversa ".concat(conversationId, " n\u00E3o encontrado."));
                    }
                    if (!conversation.is_ai_active) {
                        console.log("[MsgProcessor ".concat(jobId, "] IA inativa para conversa ").concat(conversationId, ". Pulando."));
                        return [2 /*return*/, { status: 'skipped', reason: 'IA Inativa' }];
                    }
                    console.log("[MsgProcessor ".concat(jobId, "] IA est\u00E1 ativa para a conversa."));
                    return [4 /*yield*/, db_1.prisma.message.findFirst({
                            where: { conversation_id: conversationId, sender_type: client_1.MessageSenderType.AI },
                            orderBy: { timestamp: 'desc' },
                            select: { timestamp: true }
                        })];
                case 4:
                    lastAiMessage = _d.sent();
                    fetchMessagesSince = (lastAiMessage === null || lastAiMessage === void 0 ? void 0 : lastAiMessage.timestamp) || new Date(0);
                    console.log("[MsgProcessor ".concat(jobId, "] Buscando mensagens do cliente desde: ").concat(fetchMessagesSince.toISOString()));
                    return [4 /*yield*/, db_1.prisma.message.findMany({
                            where: {
                                conversation_id: conversationId,
                                sender_type: client_1.MessageSenderType.CLIENT, // Apenas do cliente
                                timestamp: { gt: fetchMessagesSince }, // Apenas as que chegaram DEPOIS da última IA
                            },
                            orderBy: { timestamp: 'asc' }, // Ordena da mais antiga para a mais recente
                            select: { id: true, timestamp: true }
                        })];
                case 5:
                    newClientMessages = _d.sent();
                    if (newClientMessages.length === 0) {
                        console.log("[MsgProcessor ".concat(jobId, "] Nenhuma mensagem NOVA do cliente encontrada desde a \u00FAltima da IA. Pulando processamento de IA."));
                        // Poderia haver uma mensagem antiga que reativou, mas sem conteúdo novo para a IA processar.
                        return [2 /*return*/, { status: 'skipped', reason: 'Nenhuma mensagem nova do cliente para IA' }];
                    }
                    console.log("[MsgProcessor ".concat(jobId, "] Encontradas ").concat(newClientMessages.length, " novas mensagens do cliente desde a \u00FAltima IA."));
                    latestClientMessageInBatch = newClientMessages[newClientMessages.length - 1];
                    console.log("[MsgProcessor ".concat(jobId, "] Mensagem mais recente no lote: ID=").concat(latestClientMessageInBatch.id, ", Timestamp=").concat(latestClientMessageInBatch.timestamp.toISOString()));
                    // Verificar se ESTE job corresponde à mensagem MAIS RECENTE do lote
                    if (newMessageId !== latestClientMessageInBatch.id) {
                        console.log("[MsgProcessor ".concat(jobId, "] Este job (msg ").concat(newMessageId, ") N\u00C3O \u00E9 o mais recente. Outro job (para msg ").concat(latestClientMessageInBatch.id, ") processar\u00E1 o lote. Pulando."));
                        // Marcar como concluído (sem erro), pois outro job tratará.
                        // Não precisa retornar erro aqui.
                        return [2 /*return*/, { status: 'skipped', reason: "Lote ser\u00E1 tratado pelo job da msg ".concat(latestClientMessageInBatch.id) }];
                    }
                    // Se chegou aqui, ESTE job é o responsável por processar o lote completo.
                    console.log("[MsgProcessor ".concat(jobId, "] ESTE JOB (msg ").concat(newMessageId, ") \u00C9 O RESPONS\u00C1VEL PELO LOTE."));
                    // --- 4. Buscar Histórico Completo (Contexto para IA) ---
                    console.log("[MsgProcessor ".concat(jobId, "] Buscando hist\u00F3rico completo (limite ").concat(HISTORY_LIMIT, ") para IA..."));
                    return [4 /*yield*/, db_1.prisma.message.findMany({
                            where: { conversation_id: conversationId },
                            orderBy: { timestamp: 'desc' }, // Mais recentes primeiro
                            take: HISTORY_LIMIT,
                            select: { sender_type: true, content: true, timestamp: true } // Selecionar campos necessários
                        })];
                case 6:
                    historyMessages = _d.sent();
                    historyMessages.reverse(); // Reordenar para cronológico (mais antigo primeiro)
                    console.log("[MsgProcessor ".concat(jobId, "] Hist\u00F3rico obtido com ").concat(historyMessages.length, " mensagens."));
                    aiMessages = historyMessages.map(function (msg) { return ({
                        role: msg.sender_type === client_1.MessageSenderType.CLIENT ? 'user' : 'assistant', // CLIENT -> user, AI/SYSTEM -> assistant
                        content: msg.content,
                    }); });
                    systemPrompt = (_c = conversation.workspace.ai_default_system_prompt) !== null && _c !== void 0 ? _c : undefined;
                    _b = conversation.workspace, lumibot_account_id = _b.lumibot_account_id, lumibot_api_token = _b.lumibot_api_token;
                    console.log("[MsgProcessor ".concat(jobId, "] Usando prompt: ").concat(!!systemPrompt, ", Creds Lumibot: ").concat(!!lumibot_account_id, "/").concat(!!lumibot_api_token));
                    // --- 7. Chamar o Serviço de IA ---
                    console.log("[MsgProcessor ".concat(jobId, "] Chamando generateChatCompletion..."));
                    return [4 /*yield*/, (0, chatService_1.generateChatCompletion)({ messages: aiMessages, systemPrompt: systemPrompt })];
                case 7:
                    aiResponseContent = _d.sent();
                    if (!(aiResponseContent && aiResponseContent.trim() !== '')) return [3 /*break*/, 13];
                    console.log("[MsgProcessor ".concat(jobId, "] IA retornou conte\u00FAdo: \"").concat(aiResponseContent.substring(0, 100), "...\""));
                    newAiMessageTimestamp = new Date();
                    return [4 /*yield*/, db_1.prisma.message.create({
                            data: {
                                conversation_id: conversationId,
                                sender_type: client_1.MessageSenderType.AI, // Marcar como AI
                                content: aiResponseContent,
                                timestamp: newAiMessageTimestamp, // Usar timestamp consistente
                            },
                            select: { id: true } // Selecionar apenas o ID
                        })];
                case 8:
                    newAiMessage = _d.sent();
                    console.log("[MsgProcessor ".concat(jobId, "] Resposta da IA salva no DB (ID: ").concat(newAiMessage.id, ")."));
                    // Atualizar last_message_at da conversa para refletir a ação da IA
                    // Fazemos isso ANTES de tentar enviar para garantir que o estado reflita a intenção
                    return [4 /*yield*/, db_1.prisma.conversation.update({
                            where: { id: conversationId },
                            data: { last_message_at: newAiMessageTimestamp }
                        })];
                case 9:
                    // Atualizar last_message_at da conversa para refletir a ação da IA
                    // Fazemos isso ANTES de tentar enviar para garantir que o estado reflita a intenção
                    _d.sent();
                    console.log("[MsgProcessor ".concat(jobId, "] Timestamp da conversa atualizado para: ").concat(newAiMessageTimestamp.toISOString(), "."));
                    sendSuccess = false;
                    if (!(lumibot_account_id && lumibot_api_token && conversation.channel_conversation_id)) return [3 /*break*/, 11];
                    console.log("[MsgProcessor ".concat(jobId, "] Tentando enviar resposta via Lumibot para channel_conv_id ").concat(conversation.channel_conversation_id, "..."));
                    return [4 /*yield*/, (0, lumibotSender_1.enviarTextoLivreLumibot)(lumibot_account_id, conversation.channel_conversation_id, lumibot_api_token, aiResponseContent)];
                case 10:
                    sendResult = _d.sent();
                    if (sendResult.success) {
                        sendSuccess = true;
                        console.log("[MsgProcessor ".concat(jobId, "] Resposta enviada com sucesso para Lumibot."));
                    }
                    else {
                        console.error("[MsgProcessor ".concat(jobId, "] Falha ao enviar resposta para Lumibot. Detalhes:"), JSON.stringify(sendResult.responseData));
                        // DECISÃO: Não lançar erro aqui para não impedir o agendamento se desejado, mas logar criticamente.
                        // Se o envio for MANDATÓRIO para continuar, descomente a linha abaixo:
                        // throw new Error(`Falha ao enviar mensagem para Lumibot: ${JSON.stringify(sendResult.responseData)}`);
                    }
                    return [3 /*break*/, 12];
                case 11:
                    // Logar erro se dados estiverem faltando, mas não falhar o job necessariamente
                    console.error("[MsgProcessor ".concat(jobId, "] Dados ausentes para envio via Lumibot (AccountID: ").concat(!!lumibot_account_id, ", Token: ").concat(!!lumibot_api_token, ", ChannelConvID: ").concat(!!conversation.channel_conversation_id, ")."));
                    _d.label = 12;
                case 12: return [3 /*break*/, 14];
                case 13:
                    console.log("[MsgProcessor ".concat(jobId, "] IA n\u00E3o retornou conte\u00FAdo. Nenhuma mensagem salva ou enviada. Nenhum job de inatividade agendado."));
                    _d.label = 14;
                case 14:
                    console.log("--- [MsgProcessor ".concat(jobId, "] FIM (Processou Lote) ---"));
                    return [2 /*return*/, { status: 'completed', handledBatch: true }];
                case 15:
                    error_1 = _d.sent();
                    console.error("[MsgProcessor ".concat(jobId, "] Erro CR\u00CDTICO no processamento para Conv ").concat(conversationId, ":"), error_1);
                    if (error_1 instanceof Error) {
                        console.error(error_1.stack); // Logar stack trace
                    }
                    console.log("--- [MsgProcessor ".concat(jobId, "] FIM (Erro Cr\u00EDtico) ---"));
                    throw error_1; // Re-lança para BullMQ tratar como falha
                case 16: return [2 /*return*/];
            }
        });
    });
}
// --- Inicialização do Worker ---
console.log("[MsgProcessor] Tentando inicializar o worker para a fila \"".concat(QUEUE_NAME, "\"..."));
try {
    var worker = new bullmq_1.Worker(QUEUE_NAME, processJob, {
        connection: redis_1.redisConnection,
        concurrency: 5, // Ajuste a concorrência conforme necessário
    });
    // --- Listeners de Eventos ---
    worker.on('completed', function (job, result) {
        var _a;
        console.log("[MsgProcessor] Job ".concat(job.id, " (Conv: ").concat((_a = job.data) === null || _a === void 0 ? void 0 : _a.conversationId, ") conclu\u00EDdo. Status: ").concat((result === null || result === void 0 ? void 0 : result.status) || 'N/A', ". Raz\u00E3o: ").concat((result === null || result === void 0 ? void 0 : result.reason) || ((result === null || result === void 0 ? void 0 : result.handledBatch) ? 'Processou Lote' : 'N/A')));
    });
    worker.on('failed', function (job, err) {
        var _a;
        var jobId = (job === null || job === void 0 ? void 0 : job.id) || 'N/A';
        var convId = ((_a = job === null || job === void 0 ? void 0 : job.data) === null || _a === void 0 ? void 0 : _a.conversationId) || 'N/A';
        var attempts = (job === null || job === void 0 ? void 0 : job.attemptsMade) || 0;
        console.error("[MsgProcessor] Job ".concat(jobId, " (Conv: ").concat(convId, ") falhou ap\u00F3s ").concat(attempts, " tentativas:"), err.message);
        console.error(err); // Log completo do erro
    });
    worker.on('error', function (err) {
        console.error('[MsgProcessor] Erro geral do worker:', err);
    });
    worker.on('stalled', function (jobId) {
        console.warn("[MsgProcessor] Job ".concat(jobId, " estagnou (stalled). Verifique a conex\u00E3o e o processamento."));
    });
    console.log("[MsgProcessor] Worker iniciado e escutando a fila \"".concat(QUEUE_NAME, "\"..."));
}
catch (initError) {
    console.error('[MsgProcessor] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1); // Sai se não conseguir inicializar
}
