// app/api/webhooks/ingress/lumibot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  console.log('Webhook Lumibot/Chatwoot Recebido');

  try {
    // 1. Identificar o Workspace
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      console.error('Webhook Ingress: Falta workspaceId na URL');
      return NextResponse.json({ success: false, error: 'Workspace ID ausente' }, { status: 400 });
    }
    console.log(`Webhook Ingress: Processando para Workspace ID: ${workspaceId}`);


    var body = await req.json();

    console.log('Webhook Ingress: Corpo da requisição:', JSON.stringify(body, null, 2));


    // 3. Extrair Dados do Payload (Baseado no seu exemplo Lumibot/Chatwoot)
    const eventType = body.event;
    const messageType = body.message_type; // 'incoming', 'outgoing', etc.
    const senderType = body.sender_type; // 'Contact', 'Agent'

    // 4. Ignorar mensagens que não são do cliente
    if (eventType !== 'message_created' || messageType !== 'incoming' || senderType !== 'Contact') {
      console.log(`Webhook Ingress: Ignorando evento (${eventType}) / tipo (${messageType}) / remetente (${senderType}) não relevante.`);
      return NextResponse.json({ success: true, message: 'Evento não relevante ignorado' }, { status: 200 });
    }

    const messageContent = body.content;
    const messageTimestamp = new Date(body.created_at); // Chatwoot usa ISO string ou epoch? Ajustar se necessário
    const channelMessageId = body.source_id || body.id?.toString(); // ID da mensagem no canal

    const clientExternalId = body.sender?.id?.toString();
    const clientName = body.sender?.name;
    const clientPhone = body.sender?.phone_number;
    const clientMetadata = body.sender ? { ...body.sender } : null; // Guarda o objeto sender inteiro

    const channel = body.conversation?.channel; // Ex: "Channel::Whatsapp"
    const normalizedChannel = channel?.split('::')[1]?.toUpperCase() || 'UNKNOWN'; // Extrai "WHATSAPP"
    const channelConversationId = body.conversation?.id?.toString();
    const conversationMetadata = body.conversation?.meta ? { ...body.conversation.meta } : null;

    const messageMetadata = {
        content_attributes: body.content_attributes,
        additional_attributes: body.additional_attributes,
    };

    // Validação mínima
    if (!clientPhone || !channelConversationId || !messageContent) {
        console.error('Webhook Ingress: Dados essenciais ausentes no payload (phone, conversationId, content).');
        return NextResponse.json({ success: false, error: 'Payload inválido ou incompleto' }, { status: 400 });
    }

    // 5. Encontrar ou Criar Cliente
    const client = await prisma.client.upsert({
      where: {
        workspace_id_phone_number_channel: { // Usando o índice único
          workspace_id: workspaceId,
          phone_number: clientPhone,
          channel: normalizedChannel,
        }
      },
      update: { // O que atualizar se o cliente já existe
        name: clientName,
        external_id: clientExternalId,
        metadata: clientMetadata,
        updated_at: new Date(),
      },
      create: { // O que criar se for novo
        workspace_id: workspaceId,
        external_id: clientExternalId,
        phone_number: clientPhone,
        name: clientName,
        channel: normalizedChannel,
        metadata: clientMetadata,
      },
    });
    console.log(`Webhook Ingress: Cliente ${client.id} encontrado/criado.`);

    // 6. Encontrar ou Criar Conversa
    const conversation = await prisma.conversation.upsert({
      where: {
         // Precisamos de um índice único confiável. Usar ID externo da conversa + workspace é bom
         // Se não tiver índice: findFirst + create
        workspace_id_channel_conversation_id: { // Supondo que você crie esse índice
            workspace_id: workspaceId,
            channel_conversation_id: channelConversationId,
        }
      },
      update: { // O que atualizar se a conversa já existe
        status: 'ACTIVE', // Reabre a conversa se estava fechada/pausada? Decida a lógica.
        last_message_at: messageTimestamp, // Atualiza o timestamp da última atividade
        updated_at: new Date(),
        // Poderia atualizar metadata aqui também se necessário
      },
      create: { // O que criar se for nova
        workspace_id: workspaceId,
        client_id: client.id,
        channel: normalizedChannel,
        channel_conversation_id: channelConversationId,
        status: 'ACTIVE',
        is_ai_active: true, // Começa ativa por padrão
        last_message_at: messageTimestamp,
        metadata: conversationMetadata,
      },
    });
    console.log(`Webhook Ingress: Conversa ${conversation.id} encontrada/criada.`);

    // 7. Salvar Mensagem Recebida
    const newMessage = await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        sender_type: 'CLIENT',
        content: messageContent,
        timestamp: messageTimestamp,
        channel_message_id: channelMessageId,
        metadata: messageMetadata,
      }
    });
    console.log(`Webhook Ingress: Mensagem ${newMessage.id} salva.`);

    // 8. (Opcional, mas bom) Atualizar last_message_at na conversa explicitamente se o upsert não o fez
    //    Isso garante que o campo está sempre atualizado, mesmo que a conversa já existisse.
    if (conversation.last_message_at !== messageTimestamp) {
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { last_message_at: messageTimestamp }
        });
         console.log(`Webhook Ingress: Timestamp da conversa ${conversation.id} atualizado.`);
    }

    // --- PONTO DE PARADA TEMPORÁRIO ---
    // Aqui é onde, no futuro, você chamaria a fila do Redis/BullMQ
    // para processar a mensagem com a IA após o buffer.
    // Exemplo conceitual (NÃO IMPLEMENTAR AGORA):
    // await messageQueue.add('processIncomingMessage', {
    //   conversationId: conversation.id,
    //   messageId: newMessage.id,
    //   workspaceId: workspaceId,
    //   // ... outros dados necessários para a IA e resposta
    // });
    console.log(`Webhook Ingress: Mensagem ${newMessage.id} para conversa ${conversation.id} armazenada. Processamento da IA deferido.`);


    // 9. Responder com Sucesso
    return NextResponse.json({ success: true, message: 'Mensagem recebida' }, { status: 200 });

  } catch (error) {
    console.error('Webhook Ingress: Erro inesperado:', error);
    // Evitar expor detalhes do erro interno
    return NextResponse.json({ success: false, error: 'Erro interno do servidor ao processar webhook' }, { status: 500 });
  }
}