// app/api/webhook/ingress/whatsapp/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto'; // Importa a biblioteca crypto do Node.js

// --- Método GET para Verificação (Já implementado) ---
export async function GET(request: NextRequest) {
    // ... (código anterior do GET permanece aqui) ...
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
  const rawBody = await request.text(); // Ler como texto primeiro

  // 2. Obter a assinatura enviada pela Meta do cabeçalho
  // A assinatura vem no formato "sha256=HASH_REAL"
  const signatureHeader = request.headers.get('X-Hub-Signature-256');
  console.log(`[WHATSAPP WEBHOOK] Assinatura recebida: ${signatureHeader}`);

  if (!signatureHeader) {
    console.warn('[WHATSAPP WEBHOOK] Assinatura X-Hub-Signature-256 ausente. Rejeitando.');
    return new NextResponse('Signature header missing', { status: 403 });
  }

  // 3. Validar a assinatura
  const appSecret = process.env.WHATSAPP_APP_SECRET; // <<< Carregue seu Segredo do App Meta da variável de ambiente

  if (!appSecret) {
    console.error('[WHATSAPP WEBHOOK] ERRO DE CONFIGURAÇÃO: WHATSAPP_APP_SECRET não definido no .env!');
    // Não podemos validar sem o segredo, retornar erro interno.
    return new NextResponse('Internal Server Error: App Secret not configured', { status: 500 });
  }

  // Calcula o hash esperado usando o corpo RAW e o segredo
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  // Compara o hash calculado com o hash enviado pela Meta (removendo o prefixo "sha256=")
  const receivedSignatureHash = signatureHeader.split('=')[1];

  if (expectedSignature !== receivedSignatureHash) {
    console.warn(`[WHATSAPP WEBHOOK] Falha na validação da assinatura. Hash Esperado: ${expectedSignature}, Hash Recebido: ${receivedSignatureHash}. Rejeitando.`);
    return new NextResponse('Invalid signature', { status: 403 });
  }

  console.log('[WHATSAPP WEBHOOK] Assinatura validada com sucesso.');

  // 4. Processar o corpo (agora que é seguro) e adicionar à fila
  try {
    const payload = JSON.parse(rawBody); // Agora faz o parse do JSON
    console.log('[WHATSAPP WEBHOOK] Payload recebido:', JSON.stringify(payload, null, 2));

    // TODO: Analisar o `payload` para encontrar mensagens/eventos relevantes
    // Exemplo básico (precisa ser adaptado à estrutura REAL do payload da Meta):
    if (payload.object === 'whatsapp_business_account') {
        for (const entry of payload.entry) {
            for (const change of entry.changes) {
                if (change.field === 'messages') {
                     // Iterar sobre as mensagens dentro de 'value.messages'
                     for (const message of change.value.messages || []) {
                         if (message.type === 'text') { // Exemplo: processar apenas texto
                            const from = message.from; // Número do remetente
                            const messageBody = message.text.body;
                            const timestamp = new Date(parseInt(message.timestamp, 10) * 1000); // Timestamp UNIX
                            const wamId = message.id; // ID da mensagem WhatsApp

                            console.log(`[WHATSAPP WEBHOOK] Mensagem de texto recebida de ${from}: "${messageBody}" (ID: ${wamId})`);

                            // TODO: Adicionar Job à Fila (ex: whatsappWebhookQueue)
                            // const jobData = { from, messageBody, timestamp, wamId, /* outros dados como workspaceId se puder determinar */ };
                            // await whatsappWebhookQueue.add('processIncomingMessage', jobData);
                            console.log(`[WHATSAPP WEBHOOK] Placeholder: Adicionaria job para processar msg de ${from}`);
                         }
                         // TODO: Lidar com outros tipos de mensagem (imagem, áudio, status, etc.) se necessário
                     }
                }
                // TODO: Lidar com outros tipos de 'field' (ex: message_statuses)
            }
        }
    }

  } catch (error) {
    console.error('[WHATSAPP WEBHOOK] Erro ao processar o payload JSON:', error);
    // Mesmo com erro no processamento, AINDA respondemos 200 OK para a Meta!
    // A Meta não se importa se o *seu* processamento falhou, apenas se você recebeu.
  }

  // 5. Responder 200 OK para a Meta RAPIDAMENTE!
  // Isso confirma o recebimento, mesmo que o processamento interno falhe ou seja assíncrono.
  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}