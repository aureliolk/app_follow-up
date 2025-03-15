"use strict";
// app/api/follow-up/_lib/scheduler.ts
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
exports.scheduleMessage = scheduleMessage;
exports.cancelScheduledMessages = cancelScheduledMessages;
exports.reloadPendingMessages = reloadPendingMessages;
exports.setMessageProcessor = setMessageProcessor;
exports.getMessageProcessor = getMessageProcessor;
// Importações necessárias
var db_1 = require("@/lib/db");
var axios_1 = require("axios"); // Usando axios que já deve estar instalado
// Mapa para armazenar timeouts ativos
var activeTimeouts = new Map();
// Função para agendar uma mensagem
function scheduleMessage(message) {
    return __awaiter(this, void 0, void 0, function () {
        var messageId_1, delay, timeout, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    messageId_1 = "".concat(message.followUpId, "-").concat(message.stepIndex);
                    // Cancelar qualquer timeout existente para este ID
                    if (activeTimeouts.has(messageId_1)) {
                        clearTimeout(activeTimeouts.get(messageId_1));
                        activeTimeouts.delete(messageId_1);
                    }
                    delay = message.scheduledTime.getTime() - Date.now();
                    if (!(delay <= 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, sendMessage(message)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, messageId_1];
                case 2:
                    timeout = setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
                        var error_2;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 2, 3, 4]);
                                    return [4 /*yield*/, sendMessage(message)];
                                case 1:
                                    _a.sent();
                                    return [3 /*break*/, 4];
                                case 2:
                                    error_2 = _a.sent();
                                    console.error("Erro ao enviar mensagem agendada ".concat(messageId_1, ":"), error_2);
                                    return [3 /*break*/, 4];
                                case 3:
                                    // Remover do mapa após execução
                                    activeTimeouts.delete(messageId_1);
                                    return [7 /*endfinally*/];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); }, delay);
                    // Armazenar o timeout
                    activeTimeouts.set(messageId_1, timeout);
                    console.log("Mensagem ".concat(messageId_1, " agendada para ").concat(message.scheduledTime.toISOString()));
                    return [2 /*return*/, messageId_1];
                case 3:
                    error_1 = _a.sent();
                    console.error("Erro ao agendar mensagem:", error_1);
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Função para enviar a mensagem para a API Lumibot
function sendMessageToLumibot(clientId, content, metadata) {
    return __awaiter(this, void 0, void 0, function () {
        var accountId, conversationId, apiToken, templateParams, hasPlaceholders, processedContent, processedParams, clientName, requestBody, response, responseData, error_3;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    accountId = 10;
                    conversationId = 3;
                    apiToken = 'Z41o5FJFVEdZJjQaqDz6pYC7';
                    templateParams = (metadata === null || metadata === void 0 ? void 0 : metadata.templateParams) || {};
                    // Log dos dados recebidos
                    console.log('=== DADOS DA MENSAGEM ===');
                    console.log('clientId:', clientId);
                    console.log('content:', content);
                    console.log('metadata completo:', JSON.stringify(metadata, null, 2));
                    hasPlaceholders = content.includes('{{') && content.includes('}}');
                    console.log("Mensagem cont\u00E9m placeholders: ".concat(hasPlaceholders ? 'SIM' : 'NÃO'));
                    processedContent = content;
                    processedParams = (metadata === null || metadata === void 0 ? void 0 : metadata.processedParams) || (metadata === null || metadata === void 0 ? void 0 : metadata.processed_params) || {};
                    clientName = processedParams["1"] || (metadata === null || metadata === void 0 ? void 0 : metadata.clientName) || clientId;
                    // Substituir os placeholders no log para visualização
                    if (hasPlaceholders) {
                        processedContent = content.replace(/\{\{1\}\}/g, clientName);
                        console.log("Mensagem ap\u00F3s substitui\u00E7\u00E3o de placeholders: \"".concat(processedContent, "\""));
                    }
                    requestBody = {
                        "content": content,
                        "message_type": "outgoing",
                        "template_params": {
                            "name": templateParams.name || (metadata === null || metadata === void 0 ? void 0 : metadata.template_name) || "",
                            "category": templateParams.category || (metadata === null || metadata === void 0 ? void 0 : metadata.category) || "",
                            "language": templateParams.language || "pt_BR"
                        }
                    };
                    // Adicionar processed_params apenas se a mensagem contiver placeholders
                    if (hasPlaceholders) {
                        console.log('Adicionando processed_params à requisição');
                        requestBody.template_params.processed_params = {
                            "1": clientName
                        };
                    }
                    // Log do body da requisição
                    console.log('=== BODY DA REQUISIÇÃO ===');
                    console.log(JSON.stringify(requestBody, null, 2));
                    return [4 /*yield*/, axios_1.default.post("https://app.lumibot.com.br/api/v1/accounts/".concat(accountId, "/conversations/").concat(conversationId, "/messages"), requestBody, {
                            headers: {
                                'Content-Type': 'application/json',
                                'api_access_token': apiToken
                            }
                        })];
                case 1:
                    response = _c.sent();
                    // Log da resposta
                    console.log('=== RESPOSTA DA API ===');
                    console.log('Status:', response.status);
                    console.log('Resposta:', JSON.stringify(response.data, null, 2));
                    responseData = response.data;
                    console.log("Mensagem enviada com sucesso para cliente ".concat(clientId));
                    return [2 /*return*/, true];
                case 2:
                    error_3 = _c.sent();
                    console.error("Erro ao enviar mensagem para a API Lumibot:");
                    console.error('Status do erro:', (_a = error_3.response) === null || _a === void 0 ? void 0 : _a.status);
                    console.error('Mensagem do erro:', error_3.message);
                    console.error('Dados da resposta de erro:', JSON.stringify((_b = error_3.response) === null || _b === void 0 ? void 0 : _b.data, null, 2));
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Função para enviar a mensagem
function sendMessage(message) {
    return __awaiter(this, void 0, void 0, function () {
        var followUp, success, dbMessage, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 8, , 9]);
                    // Log da mensagem que está sendo processada
                    console.log('=== PROCESSANDO MENSAGEM AGENDADA ===');
                    console.log('followUpId:', message.followUpId);
                    console.log('stepIndex:', message.stepIndex);
                    console.log('clientId:', message.clientId);
                    console.log('scheduledTime:', message.scheduledTime);
                    console.log('message:', message.message);
                    console.log('metadata:', JSON.stringify(message.metadata, null, 2));
                    return [4 /*yield*/, db_1.default.followUp.findUnique({
                            where: { id: message.followUpId }
                        })];
                case 1:
                    followUp = _a.sent();
                    console.log('Status do follow-up:', followUp === null || followUp === void 0 ? void 0 : followUp.status);
                    if (!followUp || followUp.status !== 'active') {
                        console.log("Follow-up ".concat(message.followUpId, " n\u00E3o est\u00E1 mais ativo, cancelando envio."));
                        return [2 /*return*/];
                    }
                    // Enviar a mensagem para a API Lumibot
                    console.log("Enviando mensagem do follow-up ".concat(message.followUpId, " etapa ").concat(message.stepIndex, " para cliente ").concat(message.clientId));
                    return [4 /*yield*/, sendMessageToLumibot(message.clientId, message.message, message.metadata)];
                case 2:
                    success = _a.sent();
                    if (!success) return [3 /*break*/, 6];
                    return [4 /*yield*/, db_1.default.followUpMessage.findFirst({
                            where: {
                                follow_up_id: message.followUpId,
                                step: message.stepIndex
                            },
                            orderBy: { sent_at: 'desc' }
                        })];
                case 3:
                    dbMessage = _a.sent();
                    if (!dbMessage) return [3 /*break*/, 5];
                    return [4 /*yield*/, db_1.default.followUpMessage.update({
                            where: { id: dbMessage.id },
                            data: {
                                delivered: true,
                                delivered_at: new Date()
                            }
                        })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    console.log("Mensagem do follow-up ".concat(message.followUpId, " etapa ").concat(message.stepIndex, " enviada com sucesso."));
                    return [3 /*break*/, 7];
                case 6:
                    // Registrar falha, pode ser útil implementar retry logic aqui
                    console.error("Falha ao enviar mensagem para cliente ".concat(message.clientId, " do follow-up ").concat(message.followUpId));
                    _a.label = 7;
                case 7: return [3 /*break*/, 9];
                case 8:
                    error_4 = _a.sent();
                    console.error("Erro ao enviar mensagem:", error_4);
                    throw error_4;
                case 9: return [2 /*return*/];
            }
        });
    });
}
// Processador que integra com a API Lumibot
var lumibotProcessor = {
    process: function (message) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, sendMessageToLumibot(message.clientId, message.message, message.metadata)];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); }
};
// Definir o processador Lumibot como o padrão
var currentProcessor = lumibotProcessor;
// Função para cancelar todas as mensagens agendadas para um follow-up
function cancelScheduledMessages(followUpId) {
    return __awaiter(this, void 0, void 0, function () {
        var keysToRemove;
        return __generator(this, function (_a) {
            try {
                keysToRemove = Array.from(activeTimeouts.keys()).filter(function (key) {
                    return key.startsWith("".concat(followUpId, "-"));
                });
                // Cancelar cada timeout e remover do mapa
                keysToRemove.forEach(function (key) {
                    clearTimeout(activeTimeouts.get(key));
                    activeTimeouts.delete(key);
                });
                console.log("".concat(keysToRemove.length, " mensagens agendadas canceladas para o follow-up ").concat(followUpId, "."));
            }
            catch (error) {
                console.error("Erro ao cancelar mensagens agendadas:", error);
                throw error;
            }
            return [2 /*return*/];
        });
    });
}
// Função para carregar e reagendar mensagens pendentes na inicialização do servidor
function reloadPendingMessages() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/];
        });
    });
}
// Exportar as funções necessárias
function setMessageProcessor(processor) {
    currentProcessor = processor;
    console.log("Processador de mensagens personalizado configurado.");
}
function getMessageProcessor() {
    return currentProcessor;
}
// Inicialização - carregar mensagens pendentes na inicialização do servidor
if (typeof window === 'undefined') { // Verificar se estamos no lado do servidor
    // Usar setTimeout para aguardar a inicialização completa do servidor
    setTimeout(function () {
        reloadPendingMessages().catch(function (error) {
            console.error("Erro ao inicializar o agendador de mensagens:", error);
        });
    }, 5000); // Aguardar 5 segundos após a inicialização
}
