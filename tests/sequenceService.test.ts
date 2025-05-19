import { processFollowUp } from '../lib/services/sequenceService';
import { FollowUpStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Mocks
let loadFollowUpContext: any;
let generateFollowUpMessage: any;
let sendWhatsAppMessage: any;
let sendEvolutionMessage: any;
let saveMessageRecord: any;
let scheduleSequenceJob: any;
let pusherTrigger: any;

// Dynamically import modules and override mocks
async function setupMocks() {
  jestModule('../lib/services/conversationService', {
    loadFollowUpContext: (...args: any[]) => loadFollowUpContext(...args),
  });
  jestModule('../lib/services/aiService', {
    generateFollowUpMessage: (...args: any[]) => generateFollowUpMessage(...args),
  });
  jestModule('../lib/services/channelService', {
    sendWhatsAppMessage: (...args: any[]) => sendWhatsAppMessage(...args),
    sendEvolutionMessage: (...args: any[]) => sendEvolutionMessage(...args),
  });
  jestModule('../lib/services/persistenceService', {
    saveMessageRecord: (...args: any[]) => saveMessageRecord(...args),
  });
  jestModule('../lib/services/schedulerService', {
    scheduleSequenceJob: (...args: any[]) => scheduleSequenceJob(...args),
  });
  jestModule('../lib/pusher', {
    default: { trigger: (...args: any[]) => pusherTrigger(...args) }
  });
}

function jestModule(modulePath: string, mocks: any) {
  const mod = require(modulePath);
  Object.assign(mod, mocks);
}

// Test Cloud API
test('processFollowUp envia mensagem via Cloud API', async () => {
  loadFollowUpContext = async () => ({
    client: { phone_number: '+551199999999' },
    workspace: {
      whatsappPhoneNumberId: 'phone',
      whatsappAccessToken: 'token',
      evolution_api_endpoint: 'http://evo',
      evolution_api_token: 'etoken',
      evolution_api_instance_name: 'inst',
      ai_name: 'AI'
    },
    conversation: { id: 'c1', channel: 'WHATSAPP_CLOUDAPI' },
    followUp: { status: FollowUpStatus.ACTIVE }
  });
  generateFollowUpMessage = async () => 'ola';
  sendWhatsAppMessage = async () => ({ success: true, wamid: 'w1' });
  sendEvolutionMessage = async () => ({ success: true, messageId: 'e1' });
  saveMessageRecord = async (data: any) => { assert.equal(data.channel_message_id, 'w1'); return { id: 'm1' }; };
  scheduleSequenceJob = async () => {};
  pusherTrigger = async () => {};

  await setupMocks();
  await processFollowUp({ followUpId: 'f1', stepRuleId: 'r1', workspaceId: 'w1' });
  assert.ok(true);
});

// Test Evolution API
test('processFollowUp envia mensagem via Evolution API', async () => {
  loadFollowUpContext = async () => ({
    client: { phone_number: '+551199999999' },
    workspace: {
      whatsappPhoneNumberId: 'phone',
      whatsappAccessToken: 'token',
      evolution_api_endpoint: 'http://evo',
      evolution_api_token: 'etoken',
      evolution_api_instance_name: 'inst',
      ai_name: 'AI'
    },
    conversation: { id: 'c2', channel: 'WHATSAPP_EVOLUTION' },
    followUp: { status: FollowUpStatus.ACTIVE }
  });
  generateFollowUpMessage = async () => 'ola2';
  sendWhatsAppMessage = async () => ({ success: true, wamid: 'w2' });
  sendEvolutionMessage = async () => ({ success: true, messageId: 'e2' });
  saveMessageRecord = async (data: any) => { assert.equal(data.channel_message_id, 'e2'); return { id: 'm2' }; };
  scheduleSequenceJob = async () => {};
  pusherTrigger = async () => {};

  await setupMocks();
  await processFollowUp({ followUpId: 'f2', stepRuleId: 'r2', workspaceId: 'w2' });
  assert.ok(true);
});
