// app/api/webhooks/ingress/lumibot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Conversation } from '@prisma/client';
import { messageProcessingQueue } from '@/lib/queues/messageProcessingQueue';

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
    let conversation: Conversation; // Usar tipo Conversation do Prisma Client

    // Validação crucial ANTES da busca
    if (!channelConversationId) {
      console.error(`Webhook Ingress: channel_conversation_id está nulo ou indefinido. Payload:`, body);
      // Decidir o que fazer: retornar erro ou talvez criar uma conversa sem esse ID?
      // Por segurança, retornar erro é melhor inicialmente.
      return NextResponse.json({ success: false, error: 'ID da conversa do canal ausente no payload' }, { status: 400 });
    }

    // Tenta encontrar a conversa existente usando a combinação
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        workspace_id: workspaceId,
        channel_conversation_id: channelConversationId, // Busca normal pelos campos
      }
    });

    if (existingConversation) {
      // Atualiza a conversa existente
      console.log(`Webhook Ingress: Conversa ${existingConversation.id} encontrada. Atualizando.`);
      conversation = await prisma.conversation.update({
        where: {
          id: existingConversation.id // Atualiza usando o ID encontrado
        },
        data: {
          status: 'ACTIVE', // Lógica de reabertura
          last_message_at: messageTimestamp,
          updated_at: new Date(),
          // Atualizar metadata se necessário
          // metadata: conversationMetadata,
        }
      });
    } else {
      // Cria uma nova conversa
      console.log(`Webhook Ingress: Conversa não encontrada. Criando nova.`);
      conversation = await prisma.conversation.create({
        data: {
          workspace_id: workspaceId,
          client_id: client.id,
          channel: normalizedChannel,
          channel_conversation_id: channelConversationId, // Já validamos que não é nulo
          status: 'ACTIVE',
          is_ai_active: true,
          last_message_at: messageTimestamp,
          metadata: conversationMetadata,
        }
      });
      console.log(`Webhook Ingress: Nova conversa ${conversation.id} criada.`);
    }

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

    // 8. Atualizar last_message_at
    if (!existingConversation || existingConversation.last_message_at?.getTime() !== messageTimestamp.getTime()) { // Comparar getTime()
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { last_message_at: messageTimestamp }
      });
      console.log(`Webhook Ingress: Timestamp da conversa ${conversation.id} atualizado.`);
    }

    // --- NOVO PASSO: Adicionar Job à Fila ---
    try {
      const jobData = {
        conversationId: conversation.id,
        clientId: client.id, // Pode ser útil para buscar histórico
        newMessageId: newMessage.id, // ID da mensagem que disparou
        workspaceId: workspaceId,
        receivedTimestamp: Date.now() // Para a lógica de buffer
      };
      // Nome do job pode ser mais específico se houver diferentes tipos de processamento
      await messageProcessingQueue.add('processIncomingMessage', jobData);
      console.log(`Webhook Ingress: Job adicionado à fila para processar mensagem ${newMessage.id} da conversa ${conversation.id}`);
    } catch (queueError) {
      console.error(`Webhook Ingress: Falha ao adicionar job à fila BullMQ:`, queueError);
      // Considerar o que fazer aqui: retornar 500? Logar criticamente?
      // Por ora, vamos logar e continuar para retornar 200 ao webhook,
      // mas isso significa que a mensagem pode não ser processada pela IA.
    }
    // 9. Responder com Sucesso
    return NextResponse.json({ success: true, message: 'Mensagem recebida e enfileirada' }, { status: 200 });

  } catch (error) {
    console.error('Webhook Ingress: Erro inesperado:', error);
    // Evitar expor detalhes do erro interno
    return NextResponse.json({ success: false, error: 'Erro interno do servidor ao processar webhook' }, { status: 500 });
  }
}