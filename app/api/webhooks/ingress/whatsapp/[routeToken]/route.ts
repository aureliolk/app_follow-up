// app/api/webhooks/ingress/whatsapp/[routeToken]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

import {
  ConversationStatus,
  Prisma,
  Message as PrismaMessage,
} from "@prisma/client"; // Importar tipos necessários



// Define interface for route parameters if not already defined earlier
interface RouteParams {
  params: {
    routeToken: string;
  };
}

// --- Função auxiliar para buscar Workspace e segredos ---
async function getWorkspaceByRouteToken(routeToken: string) {
  if (!routeToken) return null;

  // Busca o workspace pelo token único da rota do webhook
  const workspace = await prisma.workspace.findUnique({
    where: { whatsappWebhookRouteToken: routeToken },
    select: {
      id: true,
      whatsappWebhookVerifyToken: true, // Usado no GET
      whatsappAppSecret: true, // Usado no POST (precisa descriptografar)
    },
  });

  console.log(
    `[WHATSAPP WEBHOOK - WORKSPACE ${routeToken}] Workspace encontrada: ${workspace?.id}`
  );
  return workspace;
}

// --- Método GET para Verificação ---
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { routeToken } = await params;
  console.log(
    `[WHATSAPP WEBHOOK - GET ${routeToken}] Recebida requisição GET para verificação.`
  );

  // Log antes da busca
  console.log(
    `[WHATSAPP WEBHOOK - GET ${routeToken}] Buscando workspace com whatsappWebhookRouteToken = ${routeToken}`
  );

  // Buscar o workspace para obter o Verify Token específico
  const workspace = await getWorkspaceByRouteToken(routeToken);

  // Log após a busca
  console.log(
    `[WHATSAPP WEBHOOK - GET ${routeToken}] Resultado da busca: ${
      workspace
        ? `Workspace ID: ${workspace.id}`
        : "Nenhum workspace encontrado."
    }`
  );

  if (!workspace || !workspace.whatsappWebhookVerifyToken) {
    // Log explicando o motivo do 404
    if (!workspace) {
      console.warn(
        `[WHATSAPP WEBHOOK - GET ${routeToken}] ERRO 404/405: Nenhum workspace encontrado no banco com este routeToken.`
      );
    } else {
      console.warn(
        `[WHATSAPP WEBHOOK - GET ${routeToken}] ERRO 404/405: Workspace ${workspace.id} encontrado, mas não possui whatsappWebhookVerifyToken configurado.`
      );
    }
    // Retornar 404 se não encontrou ou não tem o token de verificação
    return new NextResponse("Endpoint configuration not found or invalid.", {
      status: 404,
    });
  }
  const expectedVerifyToken = workspace.whatsappWebhookVerifyToken; // Token específico do Workspace!

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token"); // Token enviado pela Meta
  const challenge = searchParams.get("hub.challenge"); // Challenge a ser retornado

  console.log(
    `[WHATSAPP WEBHOOK - GET ${routeToken}] Modo: ${mode}, Token Recebido: ${token}, Token Esperado: ${expectedVerifyToken}, Challenge: ${challenge}`
  );

  // Verifica se o modo e o token estão corretos
  if (mode === "subscribe" && token === expectedVerifyToken) {
    console.log(
      `[WHATSAPP WEBHOOK - GET ${routeToken}] Verificação bem-sucedida.`
    );
    // Responde com o challenge e status 200 OK
    return new NextResponse(challenge, { status: 200 });
  } else {
    console.warn(
      `[WHATSAPP WEBHOOK - GET ${routeToken}] Falha na verificação (modo ou token incorreto).`
    );
    // Responde com 403 Forbidden se o token ou modo estiverem incorretos
    return new NextResponse(
      "Failed validation. Make sure the validation tokens match.",
      { status: 403 }
    );
  }
}

// --- Método POST para Receber Eventos ---
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { routeToken } = await params;
  console.log(
    `[WHATSAPP WEBHOOK - POST ${routeToken}] Recebida requisição POST (evento).`
  );

  const rawBody = await request.clone().text();
  const signatureHeader = request.headers.get("X-Hub-Signature-256");

  // 1. BUSCAR O WORKSPACE (AINDA NECESSÁRIO PARA ASSOCIAR MENSAGENS)
  //    Mas NÃO usaremos mais workspace.whatsappAppSecret para validação aqui.
  const workspace = await getWorkspaceByRouteToken(routeToken);
  if (!workspace) {
    // Se não encontrar o workspace, ainda não podemos processar a mensagem.
    console.warn(
      `[WHATSAPP WEBHOOK - POST ${routeToken}] Workspace não encontrado para este routeToken. Rejeitando.`
    );
    // Usar 404 Not Found ou 400 Bad Request pode ser apropriado aqui
    return new NextResponse("Workspace not found for route token", {
      status: 404,
    });
  }
  console.log(
    `[WHATSAPP WEBHOOK - POST ${routeToken}] Workspace ${workspace.id} encontrado. Prosseguindo com validação de assinatura global.`
  );

  // 2. OBTER APP SECRET DA VARIÁVEL DE AMBIENTE
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error(
      `[WHATSAPP WEBHOOK - POST ${routeToken}] ERRO CRÍTICO: Variável de ambiente WHATSAPP_APP_SECRET não está definida.`
    );
    // Retornar 500 pois é um erro de configuração do servidor
    return new NextResponse(
      "Internal Server Error: App Secret configuration missing.",
      { status: 500 }
    );
  }

  // 3. VALIDAR ASSINATURA (USANDO APP SECRET DO AMBIENTE)
  if (!signatureHeader) {
    console.warn(
      `[WHATSAPP WEBHOOK - POST ${routeToken}] Assinatura ausente (X-Hub-Signature-256). Rejeitando.`
    );
    return new NextResponse("Missing signature header", { status: 400 });
  }

  console.log(
    `[WHATSAPP WEBHOOK - POST ${routeToken}] Assinatura validada com sucesso (usando segredo global).`
  );

  // --- INÍCIO: Processamento do Payload (APÓS validação) ---
  try {
    const payload = JSON.parse(rawBody); // Parse seguro APÓS validação
    console.log(
      `[WHATSAPP WEBHOOK - POST ${routeToken}] Payload Parsed:`,
      JSON.stringify(payload, null, 2)
    );

    // Navegar pelo payload do WhatsApp Cloud API
    if (
      payload.object === "whatsapp_business_account" &&
      payload.entry?.length > 0
    ) {
      for (const entry of payload.entry) {
        if (entry.changes?.length > 0) {
          for (const change of entry.changes) {
            if (
              change.field === "messages" &&
              change.value?.messages?.length > 0
            ) {
              const metadata = change.value.metadata; // <<< DEFINIR METADATA AQUI (fora do loop de msg)
              for (const message of change.value.messages) {
                // Processar mensagens de texto, imagem ou áudio recebidas
                if (message.from) {
                  const receivedTimestamp =
                    parseInt(message.timestamp, 10) * 1000; // Timestamp da mensagem (em segundos, converter para ms)
                  const senderPhoneNumber = message.from; // Número de quem enviou
                  const messageIdFromWhatsapp = message.id; // ID da mensagem na API do WhatsApp
                  const workspacePhoneNumberId = metadata?.phone_number_id; // <<< USAR METADATA DEFINIDO ACIMA

                  let messageContent: string | null = null;
                  const messageType = message.type;
                  let mediaId: string | null = null;
                  let mimeType: string | null = null; // <<< Guardar mime_type
                  let requiresProcessing = false; // <<< Flag para saber se deve enfileirar job

                  if (messageType === "text") {
                    messageContent = message.text?.body;
                    requiresProcessing = true; // Texto normal também vai para IA
                  } else if (messageType === "image") {
                    // <<< Tratamento de Imagem >>>
                    messageContent = "[Imagem Recebida]"; // Placeholder
                    mediaId = message.image?.id ?? null;
                    mimeType = message.image?.mime_type ?? null;
                    requiresProcessing = !!mediaId; // Só processa se tiver ID
                    console.log(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Imagem Recebida: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`
                    );
                  } else if (messageType === "audio") {
                    // <<< Tratamento de Áudio >>>
                    messageContent = "[Áudio Recebido]"; // Placeholder
                    mediaId = message.audio?.id ?? null;
                    mimeType = message.audio?.mime_type ?? null;
                    requiresProcessing = !!mediaId;
                    console.log(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Áudio Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`
                    );
                  } else if (messageType === "video") {
                    // <<< Tratamento de Vídeo >>>
                    messageContent = "[Vídeo Recebido]"; // Placeholder
                    mediaId = message.video?.id ?? null;
                    mimeType = message.video?.mime_type ?? null;
                    requiresProcessing = !!mediaId;
                    console.log(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Vídeo Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`
                    );
                  } else if (messageType === "document") {
                    // <<< Tratamento de Documento >>>
                    messageContent = `[Documento Recebido: ${
                      message.document?.filename || "Nome não disponível"
                    }]`; // Placeholder com nome do arquivo
                    mediaId = message.document?.id ?? null;
                    mimeType = message.document?.mime_type ?? null;
                    requiresProcessing = !!mediaId;
                    console.log(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Documento Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`
                    );
                  } else if (messageType === "sticker") {
                    // <<< Tratamento de Sticker >>>
                    messageContent = "[Sticker Recebido]"; // Placeholder
                    mediaId = message.sticker?.id ?? null;
                    mimeType = message.sticker?.mime_type ?? null;
                    requiresProcessing = !!mediaId; // Sticker também pode ser baixado
                    console.log(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Sticker Recebido: De=${senderPhoneNumber}, ID_WPP=${messageIdFromWhatsapp}, MediaID=${mediaId}, MimeType=${mimeType}`
                    );
                  } else {
                    // Outros tipos (location, contacts, etc.) - Logar e não processar
                    console.warn(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Tipo de mensagem não suportado recebido: ${messageType}. Pulando.`
                    );
                    continue; // Pula para a próxima mensagem
                  }
                  // Validar se temos conteúdo (ou placeholder)
                  if (!messageContent || !requiresProcessing) {
                    // Pula se não tiver conteúdo OU não for para processar
                    console.warn(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Conteúdo da mensagem não processável ou tipo ${messageType} não tratado. Pulando.`
                    );
                    continue;
                  }

                  if (!workspacePhoneNumberId) {
                    console.warn(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Workspace Phone Number ID não encontrado. Rejeitando.`
                    );
                    continue;
                  }

                  // --- Upsert Client ---
                  const client = await prisma.client.upsert({
                    where: {
                      workspace_id_phone_number_channel: {
                        workspace_id: workspace.id,
                        phone_number: senderPhoneNumber,
                        channel: "WHATSAPP", // Canal específico
                      },
                    },
                    update: { updated_at: new Date() }, // Atualiza timestamp se existir
                    create: {
                      workspace_id: workspace.id,
                      phone_number: senderPhoneNumber,
                      channel: "WHATSAPP",
                      name:
                        change.value.contacts?.find(
                          (c: any) => c.wa_id === senderPhoneNumber
                        )?.profile?.name || senderPhoneNumber, // Tenta pegar nome do perfil, senão usa telefone
                      external_id: senderPhoneNumber, // Usa telefone como ID externo por falta de outro
                    },
                  });
                  console.log(
                    `[WHATSAPP WEBHOOK - POST ${routeToken}] Cliente ${client.id} (Telefone: ${senderPhoneNumber}) Upserted.`
                  );

                  // --- Tentar Criar ou Atualizar Conversa ---
                  let conversation: Prisma.ConversationGetPayload<{}>; // Definir tipo explícito
                  let wasCreated = false;
                  try {
                    // Tenta criar primeiro
                    conversation = await prisma.conversation.create({
                      data: {
                        workspace_id: workspace.id,
                        client_id: client.id,
                        channel: "WHATSAPP",
                        status: ConversationStatus.ACTIVE,
                        is_ai_active: true, // Começa com IA ativa
                        last_message_at: new Date(receivedTimestamp),
                      },
                    });
                    wasCreated = true;
                    console.log(
                      `[WHATSAPP WEBHOOK - POST ${routeToken}] Nova Conversa ${conversation.id} CRIADA para Cliente ${client.id}. (wasCreated = true)`
                    );
                  } catch (e) {
                    if (
                      e instanceof Prisma.PrismaClientKnownRequestError &&
                      e.code === "P2002"
                    ) {
                      // Violação de constraint única, a conversa já existe. Atualizar.
                      console.log(
                        `[WHATSAPP WEBHOOK - POST ${routeToken}] Conversa existente para cliente ${client.id} encontrada. Atualizando...`
                      );
                      conversation = await prisma.conversation.update({
                        where: {
                          workspace_id_client_id_channel: {
                            workspace_id: workspace.id,
                            client_id: client.id,
                            channel: "WHATSAPP",
                          },
                        },
                        data: {
                          last_message_at: new Date(receivedTimestamp),
                          status: ConversationStatus.ACTIVE, // Reabre se estava fechada
                          updated_at: new Date(),
                        },
                      });
                      console.log(
                        `[WHATSAPP WEBHOOK - POST ${routeToken}] Conversa ${conversation.id} ATUALIZADA.`
                      );
                    } else {
                      // Outro erro durante a criação/atualização da conversa
                      console.error(
                        `[WHATSAPP WEBHOOK - POST ${routeToken}] Erro inesperado ao criar/atualizar conversa para cliente ${client.id}:`,
                        e
                      );
                      // Considerar se deve parar aqui ou continuar sem conversa? Por segurança, vamos parar.
                      // Não retornar 500 para a Meta, apenas logar e pular esta mensagem.
                      continue; // Pula para a próxima mensagem no loop
                    }
                  }
                  // --- Fim Criar/Atualizar Conversa ---

                  // --- Save Message ---
                  const newMessage = await prisma.message.create({
                    data: {
                      conversation_id: conversation.id,
                      sender_type: "CLIENT",
                      content: messageContent, // Placeholder para mídias
                      timestamp: new Date(receivedTimestamp),
                      channel_message_id: messageIdFromWhatsapp,
                      metadata: {
                        // Armazenar detalhes da mídia
                        whatsappMessage: message,
                        // Somente adicionar campos se existirem
                        ...(mediaId && { mediaId }),
                        ...(mimeType && { mimeType }),
                        messageType: messageType, // Sempre guardar o tipo original
                      },
                    },
                    select: {
                      id: true,
                      conversation_id: true,
                      content: true,
                      timestamp: true,
                      sender_type: true,
                    },
                  });
                  console.log(
                    `[WHATSAPP WEBHOOK - POST ${routeToken}] Mensagem ${newMessage.id} (WPP ID: ${messageIdFromWhatsapp}) salva para Conv ${conversation.id}.`
                  );
                }
              } // Fim loop messages
            } // Fim if change.field === 'messages'
          } // Fim loop changes
        } // Fim if entry.changes
      } // Fim loop entry
    } // Fim if payload.object
  } catch (parseError) {
    console.error(
      `[WHATSAPP WEBHOOK - POST ${routeToken}] Erro ao fazer parse do JSON ou processar payload:`,
      parseError
    );
  }

  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
