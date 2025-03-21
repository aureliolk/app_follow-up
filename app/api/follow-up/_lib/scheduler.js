"use strict";
// app/api/follow-up/_lib/scheduler.js

// Exportamos diretamente as funções do scheduler.ts
const { 
  scheduleMessage, 
  cancelScheduledMessages, 
  reloadPendingMessages,
  setMessageProcessor,
  getMessageProcessor
} = require('./scheduler.ts');

// Re-exportar como módulo CommonJS
module.exports = {
  scheduleMessage,
  cancelScheduledMessages,
  reloadPendingMessages,
  setMessageProcessor,
  getMessageProcessor
};