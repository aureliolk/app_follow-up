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
// apps/workers/src/workers/sequenceStepProcessor.ts
var bullmq_1 = require("bullmq");
var redis_1 = require("@/packages/shared-lib/src/redis");
var db_1 = require("@/packages/shared-lib/src/db");
var lumibotSender_1 = require("@/packages/shared-lib/src/channel/lumibotSender");
var sequenceStepQueue_1 = require("@/apps/workers/src/queues/sequenceStepQueue");
var client_1 = require("@prisma/client"); // Importe Prisma para tipos
var QUEUE_NAME = 'sequence-step';
// --- Função de Processamento do Job ---
function processSequenceStepJob(job) {
    return __awaiter(this, void 0, void 0, function () {
        var jobId, _a, followUpId, stepRuleId, jobWorkspaceId, followUp, workspaceData, currentRule, clientData, conversationData, channelConversationId, lumibot_account_id, lumibot_api_token, messageToSend, sendResult, nextRuleId, nextDelayMs, currentRuleIndex, nextRule, updateData, nextJobData, nextJobOptions, scheduleError_1, logError_1, error_1, updateError_1;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    jobId = job.id || 'unknown-sequence-job';
                    _a = job.data, followUpId = _a.followUpId, stepRuleId = _a.stepRuleId, jobWorkspaceId = _a.workspaceId;
                    console.log("\n--- [SequenceWorker ".concat(jobId, "] IN\u00CDCIO ---"));
                    console.log("[SequenceWorker ".concat(jobId, "] Processando Step Rule ").concat(stepRuleId, " para FollowUp ").concat(followUpId));
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 15, , 20]);
                    // 1. Buscar FollowUp e dados relacionados indiretamente
                    console.log("[SequenceWorker ".concat(jobId, "] Buscando FollowUp ").concat(followUpId, "..."));
                    return [4 /*yield*/, db_1.prisma.followUp.findUnique({
                            where: { id: followUpId },
                            include: {
                                // <<< CORREÇÃO PRINCIPAL: INCLUIR WORKSPACE E CLIENT >>>
                                workspace: {
                                    select: {
                                        id: true, // Para confirmação
                                        lumibot_account_id: true,
                                        lumibot_api_token: true,
                                        // Buscar TODAS as regras ordenadas para encontrar a próxima
                                        ai_follow_up_rules: {
                                            orderBy: { created_at: 'asc' },
                                            select: { id: true, delay_milliseconds: true, message_content: true, created_at: true },
                                        },
                                    },
                                },
                                client: {
                                    select: {
                                        id: true,
                                        name: true,
                                        // Precisamos da conversa associada para obter o channel_conversation_id
                                        // Buscar a MAIS RECENTE conversa ATIVA do cliente neste workspace
                                        conversations: {
                                            where: {
                                                workspace_id: jobWorkspaceId, // Filtra pelo workspace correto
                                                status: 'ACTIVE' // Busca apenas conversas ativas
                                            },
                                            orderBy: {
                                                last_message_at: 'desc' // Pega a mais recente
                                            },
                                            take: 1,
                                            select: {
                                                id: true,
                                                channel_conversation_id: true
                                            }
                                        }
                                    },
                                },
                            },
                        })];
                case 2:
                    followUp = _c.sent();
                    if (!followUp) {
                        console.warn("[SequenceWorker ".concat(jobId, "] FollowUp ").concat(followUpId, " n\u00E3o encontrado. Ignorando job."));
                        // Considerar se deve lançar erro ou apenas retornar
                        return [2 /*return*/, { status: 'skipped', reason: 'FollowUp não encontrado' }];
                    }
                    console.log("[SequenceWorker ".concat(jobId, "] FollowUp encontrado. Status: ").concat(followUp.status));
                    // 2. Verificar Status do FollowUp
                    // Usar string diretamente se não tiver o Enum importado corretamente
                    if (followUp.status !== 'ACTIVE' && followUp.status !== client_1.FollowUpStatus.ACTIVE) { // Checa string e Enum
                        console.log("[SequenceWorker ".concat(jobId, "] FollowUp ").concat(followUpId, " n\u00E3o est\u00E1 ativo (Status: ").concat(followUp.status, "). Job ignorado."));
                        return [2 /*return*/, { status: 'skipped', reason: "FollowUp n\u00E3o ativo (".concat(followUp.status, ")") }];
                    }
                    // 3. Verificar se o Workspace foi carregado (agora deve funcionar)
                    if (!followUp.workspace) {
                        // Este erro não deve mais ocorrer com o include correto
                        console.error("[SequenceWorker ".concat(jobId, "] ERRO INESPERADO: Workspace n\u00E3o inclu\u00EDdo para FollowUp ").concat(followUpId, ". Verifique a query Prisma."));
                        throw new Error("Workspace n\u00E3o encontrado nos dados do FollowUp ".concat(followUpId, "."));
                    }
                    workspaceData = followUp.workspace;
                    console.log("[SequenceWorker ".concat(jobId, "] Dados do Workspace (ID: ").concat(workspaceData.id, ") carregados."));
                    currentRule = workspaceData.ai_follow_up_rules.find(function (rule) { return rule.id === stepRuleId; });
                    if (!currentRule) {
                        console.error("[SequenceWorker ".concat(jobId, "] Regra de passo ").concat(stepRuleId, " n\u00E3o encontrada nas regras do workspace ").concat(workspaceData.id, "."));
                        throw new Error("Regra ".concat(stepRuleId, " n\u00E3o encontrada para o workspace."));
                    }
                    console.log("[SequenceWorker ".concat(jobId, "] Regra atual encontrada: ID=").concat(currentRule.id));
                    clientData = followUp.client;
                    if (!clientData) {
                        console.error("[SequenceWorker ".concat(jobId, "] ERRO INESPERADO: Cliente n\u00E3o inclu\u00EDdo para FollowUp ").concat(followUpId, "."));
                        throw new Error("Cliente n\u00E3o encontrado nos dados do FollowUp ".concat(followUpId, "."));
                    }
                    conversationData = (_b = clientData.conversations) === null || _b === void 0 ? void 0 : _b[0];
                    if (!(conversationData === null || conversationData === void 0 ? void 0 : conversationData.channel_conversation_id)) {
                        console.warn("[SequenceWorker ".concat(jobId, "] Nenhuma conversa ativa recente ou channel_conversation_id encontrado para o cliente ").concat(clientData.id, ". N\u00E3o \u00E9 poss\u00EDvel enviar."));
                        // Decidir se deve falhar ou pular. Pular pode ser mais seguro.
                        return [2 /*return*/, { status: 'skipped', reason: 'Channel Conversation ID não encontrado' }];
                    }
                    channelConversationId = conversationData.channel_conversation_id;
                    console.log("[SequenceWorker ".concat(jobId, "] Dados do Cliente (Nome: ").concat(clientData.name || 'N/A', ") e Conversa (ChannelID: ").concat(channelConversationId, ") OK."));
                    lumibot_account_id = workspaceData.lumibot_account_id, lumibot_api_token = workspaceData.lumibot_api_token;
                    if (!lumibot_account_id || !lumibot_api_token) {
                        console.warn("[SequenceWorker ".concat(jobId, "] Credenciais Lumibot ausentes para workspace ").concat(workspaceData.id, ". N\u00E3o \u00E9 poss\u00EDvel enviar."));
                        return [2 /*return*/, { status: 'skipped', reason: 'Credenciais Lumibot ausentes' }];
                    }
                    messageToSend = currentRule.message_content;
                    console.log("[SequenceWorker ".concat(jobId, "] Mensagem original da regra: \"").concat(messageToSend, "\""));
                    if (clientData.name) {
                        messageToSend = messageToSend.replace(/\[NomeCliente\]/gi, clientData.name);
                        console.log("[SequenceWorker ".concat(jobId, "] Placeholder [NomeCliente] substitu\u00EDdo."));
                    }
                    // Adicionar mais placeholders conforme necessário
                    console.log("[SequenceWorker ".concat(jobId, "] Mensagem final a ser enviada: \"").concat(messageToSend, "\""));
                    // 8. Enviar Mensagem via Lumibot
                    console.log("[SequenceWorker ".concat(jobId, "] Enviando mensagem para Lumibot (ChannelConvID: ").concat(channelConversationId, ")..."));
                    return [4 /*yield*/, (0, lumibotSender_1.enviarTextoLivreLumibot)(lumibot_account_id, channelConversationId, lumibot_api_token, messageToSend)];
                case 3:
                    sendResult = _c.sent();
                    nextRuleId = null;
                    nextDelayMs = null;
                    if (sendResult.success) {
                        console.log("[SequenceWorker ".concat(jobId, "] Mensagem enviada com sucesso."));
                        currentRuleIndex = workspaceData.ai_follow_up_rules.findIndex(function (rule) { return rule.id === stepRuleId; });
                        nextRule = workspaceData.ai_follow_up_rules[currentRuleIndex + 1];
                        if (nextRule) {
                            nextRuleId = nextRule.id;
                            nextDelayMs = Number(nextRule.delay_milliseconds); // Converter BigInt
                            console.log("[SequenceWorker ".concat(jobId, "] Pr\u00F3xima regra encontrada: ID=").concat(nextRuleId, ", Delay=").concat(nextDelayMs, "ms"));
                            if (isNaN(nextDelayMs) || nextDelayMs < 0) {
                                console.warn("[SequenceWorker ".concat(jobId, "] Delay da pr\u00F3xima regra (").concat(nextRuleId, ") \u00E9 inv\u00E1lido (").concat(nextDelayMs, "ms). N\u00E3o ser\u00E1 agendada."));
                                nextRuleId = null; // Anula agendamento
                                nextDelayMs = null;
                            }
                        }
                        else {
                            console.log("[SequenceWorker ".concat(jobId, "] Nenhuma regra posterior encontrada. Sequ\u00EAncia ser\u00E1 conclu\u00EDda."));
                        }
                    }
                    else {
                        // O envio falhou
                        console.error("[SequenceWorker ".concat(jobId, "] Falha ao enviar mensagem via Lumibot:"), sendResult.responseData);
                        // Lançar erro para BullMQ tentar novamente? Ou marcar como falha e parar?
                        // Por ora, vamos lançar erro para retentativa.
                        throw new Error("Falha ao enviar mensagem do passo ".concat(stepRuleId, " via Lumibot."));
                    }
                    updateData = {
                        current_sequence_step_order: workspaceData.ai_follow_up_rules.findIndex(function (r) { return r.id === stepRuleId; }) + 1, // Atualiza para a ordem do passo atual
                        updated_at: new Date(),
                    };
                    if (!(nextRuleId && nextDelayMs !== null)) return [3 /*break*/, 8];
                    // Agenda próximo passo
                    updateData.next_sequence_message_at = new Date(Date.now() + nextDelayMs);
                    updateData.status = 'ACTIVE'; // Mantém ativo
                    nextJobData = { followUpId: followUpId, stepRuleId: nextRuleId, workspaceId: workspaceData.id };
                    nextJobOptions = {
                        delay: nextDelayMs,
                        jobId: "seq_".concat(followUpId, "_step_").concat(nextRuleId), // ID único
                        removeOnComplete: true,
                        removeOnFail: 5000,
                    };
                    _c.label = 4;
                case 4:
                    _c.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, sequenceStepQueue_1.sequenceStepQueue.add('processSequenceStep', nextJobData, nextJobOptions)];
                case 5:
                    _c.sent();
                    console.log("[SequenceWorker ".concat(jobId, "] Pr\u00F3ximo job (regra ").concat(nextRuleId, ") agendado com delay ").concat(nextDelayMs, "ms."));
                    return [3 /*break*/, 7];
                case 6:
                    scheduleError_1 = _c.sent();
                    console.error("[SequenceWorker ".concat(jobId, "] ERRO ao agendar PR\u00D3XIMO job de sequ\u00EAncia para FollowUp ").concat(followUpId, ":"), scheduleError_1);
                    // O que fazer aqui? Falhar o job atual? Logar e continuar?
                    // Por segurança, vamos lançar o erro para indicar que o agendamento falhou.
                    throw new Error("Falha ao agendar pr\u00F3ximo passo da sequ\u00EAncia: ".concat(scheduleError_1));
                case 7: return [3 /*break*/, 9];
                case 8:
                    // Fim da sequência
                    console.log("[SequenceWorker ".concat(jobId, "] Marcando FollowUp ").concat(followUpId, " como COMPLETED."));
                    updateData.status = 'COMPLETED'; // Usar Enum se tiver
                    updateData.next_sequence_message_at = null;
                    updateData.completed_at = new Date();
                    _c.label = 9;
                case 9: return [4 /*yield*/, db_1.prisma.followUp.update({
                        where: { id: followUpId },
                        data: updateData,
                    })];
                case 10:
                    _c.sent();
                    console.log("[SequenceWorker ".concat(jobId, "] FollowUp ").concat(followUpId, " atualizado no DB. Novo status: ").concat(updateData.status, ", NextMsgAt: ").concat(updateData.next_sequence_message_at || 'N/A'));
                    _c.label = 11;
                case 11:
                    _c.trys.push([11, 13, , 14]);
                    return [4 /*yield*/, db_1.prisma.message.create({
                            data: {
                                conversation_id: conversationData.id, // ID da conversa encontrada
                                sender_type: 'AI', // Mensagem enviada pela IA da sequência
                                content: messageToSend,
                                timestamp: new Date(), // Timestamp do envio
                                metadata: { ruleId: currentRule.id, type: 'sequence_step_sent' }
                            }
                        })];
                case 12:
                    _c.sent();
                    console.log("[SequenceWorker ".concat(jobId, "] Mensagem do passo ").concat(currentRule.id, " salva no hist\u00F3rico da conversa ").concat(conversationData.id, "."));
                    return [3 /*break*/, 14];
                case 13:
                    logError_1 = _c.sent();
                    console.warn("[SequenceWorker ".concat(jobId, "] Falha ao salvar log da mensagem da sequ\u00EAncia:"), logError_1);
                    return [3 /*break*/, 14];
                case 14:
                    console.log("--- [SequenceWorker ".concat(jobId, "] FIM (Sucesso) ---"));
                    return [2 /*return*/, { status: 'completed', nextStepScheduled: !!nextRuleId }];
                case 15:
                    error_1 = _c.sent();
                    console.error("[SequenceWorker ".concat(jobId, "] Erro CR\u00CDTICO ao processar job de sequ\u00EAncia para FollowUp ").concat(followUpId, ":"), error_1);
                    if (error_1 instanceof Error) {
                        console.error(error_1.stack);
                    }
                    console.log("--- [SequenceWorker ".concat(jobId, "] FIM (Erro Cr\u00EDtico) ---"));
                    _c.label = 16;
                case 16:
                    _c.trys.push([16, 18, , 19]);
                    return [4 /*yield*/, db_1.prisma.followUp.update({
                            where: { id: followUpId },
                            data: { status: 'FAILED' } // Usar Enum se tiver
                        })];
                case 17:
                    _c.sent();
                    console.log("[SequenceWorker ".concat(jobId, "] FollowUp ").concat(followUpId, " marcado como FAILED devido a erro cr\u00EDtico."));
                    return [3 /*break*/, 19];
                case 18:
                    updateError_1 = _c.sent();
                    console.error("[SequenceWorker ".concat(jobId, "] Falha ao marcar FollowUp ").concat(followUpId, " como FAILED:"), updateError_1);
                    return [3 /*break*/, 19];
                case 19: throw error_1; // Re-lança para BullMQ tratar como falha
                case 20: return [2 /*return*/];
            }
        });
    });
}
// --- Inicialização do Worker ---
console.log('[SequenceWorker] Tentando inicializar o worker...');
try {
    var sequenceWorker = new bullmq_1.Worker(QUEUE_NAME, processSequenceStepJob, {
        connection: redis_1.redisConnection,
        concurrency: 5, // Ajustar conforme necessário
        // lockDuration: 60000 // Aumentar se o processamento + envio demorar mais que 30s
    });
    // --- Listeners de Eventos ---
    sequenceWorker.on('completed', function (job, result) {
        var _a;
        console.log("[SequenceWorker] Job ".concat(job.id || 'N/A', " (FollowUp: ").concat((_a = job.data) === null || _a === void 0 ? void 0 : _a.followUpId, ") conclu\u00EDdo. Status: ").concat((result === null || result === void 0 ? void 0 : result.status) || 'completed', ". Pr\u00F3ximo passo agendado: ").concat((result === null || result === void 0 ? void 0 : result.nextStepScheduled) ? 'Sim' : 'Não/Fim', ". Raz\u00E3o (se pulou): ").concat((result === null || result === void 0 ? void 0 : result.reason) || 'N/A'));
    });
    sequenceWorker.on('failed', function (job, err) {
        var _a;
        var jobId = (job === null || job === void 0 ? void 0 : job.id) || 'N/A';
        var followUpId = ((_a = job === null || job === void 0 ? void 0 : job.data) === null || _a === void 0 ? void 0 : _a.followUpId) || 'N/A';
        var attempts = (job === null || job === void 0 ? void 0 : job.attemptsMade) || 0;
        console.error("[SequenceWorker] Job ".concat(jobId, " (FollowUp: ").concat(followUpId, ") falhou ap\u00F3s ").concat(attempts, " tentativas:"), err.message);
        console.error(err);
    });
    sequenceWorker.on('error', function (err) {
        console.error('[SequenceWorker] Erro geral:', err);
    });
    sequenceWorker.on('stalled', function (jobId) {
        console.warn("[SequenceWorker] Job ".concat(jobId, " estagnou (stalled). Verificando."));
    });
    console.log("[SequenceWorker] Worker iniciado e escutando a fila \"".concat(QUEUE_NAME, "\"..."));
}
catch (initError) {
    console.error('[SequenceWorker] Falha CRÍTICA ao inicializar o worker:', initError);
    process.exit(1);
}
