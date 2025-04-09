import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto'; // Importa a biblioteca crypto do Node.js
import { prisma } from '@/lib/db';
import { messageProcessingQueue } from '@/lib/queues/messageProcessingQueue';
import { ConversationStatus, MessageSenderType } from '@prisma/client';
import { redisConnection } from '@/lib/redis';

// --- Método GET para Verificação (Implementado) ---
export async function GET(request: NextRequest) {
    // ... código GET existente ...
    console.log('[WHATSAPP WEBHOOK] Recebida requisição GET para verificação.');

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token'); // O token que VOCÊ define
    const challenge = searchParams.get('hub.challenge'); // O que a Meta quer de volta

    // Log para depuração
    console.log(`[WHATSAPP WEBHOOK] GET - Modo: ${mode}, Token Recebido: ${token}, Challenge: ${challenge}`);

    // **IMPORTANTE:** Defina seu token de verificação seguro aqui.
    // Idealmente, leia de uma variável de ambiente. Não coloque direto no código em produção!
    // Exemplo: const expectedVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    // Para teste inicial, podemos usar um valor fixo, MAS TROQUE DEPOIS:
    const expectedVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "SEU_TOKEN_SECRETO_AQUI"; // <<< TROCAR ISSO!

    if (!expectedVerifyToken || expectedVerifyToken === "SEU_TOKEN_SECRETO_AQUI") {
        console.error("[WHATSAPP WEBHOOK] ERRO DE CONFIGURAÇÃO: Token de verificação não definido ou usando valor padrão inseguro! Defina WHATSAPP_VERIFY_TOKEN no seu .env");
        // Não retornar o erro 500 aqui, pois a Meta espera 403 se o token falhar.
        // Mas é CRÍTICO corrigir isso.
    }


    // Verifica se o modo e o token estão corretos
    if (mode === 'subscribe' && token === expectedVerifyToken) {
        console.log('[WHATSAPP WEBHOOK] Verificação GET bem-sucedida. Respondendo com challenge.');
        // Responde com o challenge e status 200 OK
        return new NextResponse(challenge, { status: 200 });
    } else {
        // Responde com 403 Forbidden se o token ou modo estiverem incorretos
        console.warn(`[WHATSAPP WEBHOOK] Falha na verificação GET. Modo: ${mode}, Token Esperado: ${expectedVerifyToken}, Token Recebido: ${token}`);
        return new NextResponse('Failed validation. Make sure the validation tokens match.', { status: 403 });
    }
}

// --- Método POST para Receber Eventos --- 
export async function POST(request: NextRequest) {
  console.log('[WHATSAPP WEBHOOK] Recebida requisição POST (evento).');

  // 1. Obter o corpo RAW da requisição (essencial para validar assinatura)
  // Usamos request.clone() para poder ler o corpo duas vezes (uma como texto, outra como json se válido)
  const rawBody = await request.clone().text();

  // 2. Obter a assinatura enviada pela Meta do cabeçalho
  const signatureHeader = request.headers.get('X-Hub-Signature-256');
  console.log(`[WHATSAPP WEBHOOK] Assinatura recebida: ${signatureHeader}`);

  if (!signatureHeader) {
    console.warn('[WHATSAPP WEBHOOK] Assinatura X-Hub-Signature-256 ausente. Rejeitando.');
    return new NextResponse('Signature header missing', { status: 403 });
  }

  // 3. Validar a assinatura
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    console.error('[WHATSAPP WEBHOOK] ERRO DE CONFIGURAÇÃO: WHATSAPP_APP_SECRET não definido no .env!');
    return new NextResponse('Internal Server Error: App Secret not configured', { status: 500 });
  }

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const receivedSignatureHash = signatureHeader.split('=')[1];

  if (expectedSignature !== receivedSignatureHash) {
    console.warn(`[WHATSAPP WEBHOOK] Falha na validação da assinatura. Hash Esperado: ${expectedSignature}, Hash Recebido: ${receivedSignatureHash}. Rejeitando.`);
    return new NextResponse('Invalid signature', { status: 403 });
  }

  console.log('[WHATSAPP WEBHOOK] Assinatura validada com sucesso.');

  // 4. Processar o corpo (agora que é seguro)
  try {
    const payload = await request.json(); // Agora faz o parse do JSON
    // console.log('[WHATSAPP WEBHOOK] Payload recebido e validado:', JSON.stringify(payload, null, 2)); // Pode ser muito verboso

    // --- Início Lógica de Processamento REAL ---
    if (payload.object === 'whatsapp_business_account') {
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'messages' && change.value?.messages) {
            const metadata = change.value.metadata; // Metadados da mensagem (contém IDs)
            const contacts = change.value.contacts; // Informações de quem enviou
            const messages = change.value.messages; // Array de mensagens

            for (const message of messages) {
              // Processar apenas mensagens de texto recebidas (ignorar status de entrega, etc.)
              if (message.type === 'text' && message.from) {
                const receivedTimestamp = parseInt(message.timestamp, 10) * 1000; // Timestamp da mensagem (em segundos, converter para ms)
                const senderPhoneNumber = message.from; // Número de quem enviou
                const messageText = message.text.body;
                const messageIdFromWhatsapp = message.id; // ID da mensagem na API do WhatsApp
                const workspacePhoneNumberId = metadata?.phone_number_id; // ID do número da EMPRESA que recebeu

                if (!workspacePhoneNumberId) {
                  console.error('[WHATSAPP WEBHOOK] phone_number_id não encontrado nos metadados. Impossível associar ao workspace.');
                  continue; // Pula para a próxima mensagem
                }

                console.log(`[WHATSAPP WEBHOOK] Mensagem de texto recebida de ${senderPhoneNumber} via ${workspacePhoneNumberId}: "${messageText.substring(0,50)}..."`);

                try {
                  // 1. Encontrar Workspace pelo ID do número de telefone (use findFirst)
                  const workspace = await prisma.workspace.findFirst({
                    where: { whatsappPhoneNumberId: workspacePhoneNumberId },
                    select: { id: true }
                  });

                  if (!workspace) {
                    console.error(`[WHATSAPP WEBHOOK] Workspace não encontrado para whatsappPhoneNumberId: ${workspacePhoneNumberId}`);
                    continue;
                  }
                  const workspaceId = workspace.id;

                  // 2. Encontrar ou Criar Cliente (Use correct index name suggested by linter)
                  const client = await prisma.client.upsert({
                    where: {
                      // Using correct index name based on linter suggestion
                      workspace_id_phone_number_channel: {
                        workspace_id: workspaceId,
                        phone_number: senderPhoneNumber,
                        channel: 'WHATSAPP'
                      }
                    },
                    update: { name: contacts?.find((c:any) => c.wa_id === senderPhoneNumber)?.profile?.name || 'WhatsApp User' },
                    create: {
                      workspace_id: workspaceId,
                      phone_number: senderPhoneNumber,
                      channel: 'WHATSAPP',
                      name: contacts?.find((c:any) => c.wa_id === senderPhoneNumber)?.profile?.name || 'WhatsApp User',
                    },
                    select: { id: true }
                  });
                  const clientId = client.id;

                  // 3. Encontrar ou Criar Conversa (Use correct index name suggested by linter)
                  const conversation = await prisma.conversation.upsert({
                    where: {
                      // Using correct index name based on linter suggestion
                      workspace_id_client_id_channel: {
                         workspace_id: workspaceId,
                         client_id: clientId,
                         channel: 'WHATSAPP'
                      }
                    },
                    update: {
                       last_message_at: new Date(receivedTimestamp),
                       status: ConversationStatus.ACTIVE,
                       channel: 'WHATSAPP',
                       is_ai_active: true,
                    },
                    create: {
                      workspace_id: workspaceId,
                      client_id: clientId,
                      channel: 'WHATSAPP',
                      status: ConversationStatus.ACTIVE,
                      is_ai_active: true,
                      last_message_at: new Date(receivedTimestamp),
                    },
                     // Adding channel to select to confirm the value after upsert
                     select: { id: true, is_ai_active: true, channel: true }
                  });
                  const conversationId = conversation.id;

                  // <<< NOVO LOG APÓS UPSERT >>>
                  console.log(`[WHATSAPP WEBHOOK] Conversation Upsert executado para ID: ${conversationId}. Canal retornado: ${conversation.channel}. Intenção era definir/atualizar para WHATSAPP.`);

                  // 4. Salvar a Mensagem Recebida (ensure api_message_id is removed or correct)
                  const newMessage = await prisma.message.create({
                    data: {
                      conversation_id: conversationId,
                      sender_type: MessageSenderType.CLIENT,
                      content: messageText,
                      timestamp: new Date(receivedTimestamp),
                      // api_message_id: messageIdFromWhatsapp, // Ensure removed/correct
                    },
                    select: { id: true, conversation_id: true, content: true, timestamp: true, sender_type: true }
                  });
                  const newMessageId = newMessage.id;

                   // 5. Publicar no Redis (use imported redisConnection)
                  try {
                       const redisChannel = `chat-updates:${conversationId}`;
                       // Construct payload matching potential UI expectations (ensure all fields are present)
                       const redisPayload = JSON.stringify({
                           id: newMessage.id,
                           conversation_id: newMessage.conversation_id,
                           content: newMessage.content,
                           sender_type: newMessage.sender_type,
                           timestamp: newMessage.timestamp.toISOString(), // Send ISO string
                           // Include other fields if needed by UI, e.g., api_message_id if you re-add it
                       });
                       await redisConnection.publish(redisChannel, redisPayload); // Use imported connection
                       console.log(`[WHATSAPP WEBHOOK] Mensagem ${newMessageId} publicada no Redis canal ${redisChannel}`);
                   } catch (publishError) {
                       console.error(`[WHATSAPP WEBHOOK] Falha ao publicar mensagem ${newMessageId} no Redis:`, publishError);
                   }

                  // 6. Adicionar Job à Fila (Use correct job name)
                  if (conversation.is_ai_active) {
                     await messageProcessingQueue.add('process-message', { // Correct job name
                         conversationId: conversationId,
                         clientId: clientId,
                         newMessageId: newMessageId,
                         workspaceId: workspaceId,
                         receivedTimestamp: Date.now()
                     });
                     console.log(`[WHATSAPP WEBHOOK] Job 'process-message' adicionado para msg ${newMessageId} (Conv: ${conversationId})`);
                  } else {
                      console.log(`[WHATSAPP WEBHOOK] IA inativa para Conv ${conversationId}. Job NÃO adicionado.`);
                  }

                } catch (dbError) {
                  console.error(`[WHATSAPP WEBHOOK] Erro de banco de dados ao processar mensagem de ${senderPhoneNumber}:`, dbError);
                  // Continuar para a próxima mensagem, mesmo se uma falhar
                }
              }
            }
          }
        }
      }
    }
    // --- Fim Lógica de Processamento REAL ---

  } catch (error) {
    console.error('[WHATSAPP WEBHOOK] Erro ao processar o payload JSON ou lógica interna:', error);
    // Mesmo com erro no processamento, respondemos 200 OK para a Meta.
  }

  // 5. Responder 200 OK para a Meta RAPIDAMENTE!
  return new NextResponse('EVENT_RECEIVED', { status: 200 });
} 