
// apps/next-app/app/api/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../../../packages/shared-lib/src/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../../../packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '../../../../../../../packages/shared-lib/src/permissions';
import { enviarTextoLivreLumibot } from '../../../../../../../packages/shared-lib/src/channel/lumibotSender';
import { MessageSenderType, ConversationStatus } from '@prisma/client'; // Importar Enums
import type { Message } from '../../../../../../../apps/next-app/app/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> } // 'id' aqui é o conversationId
) {
  const awaitedParams = await params;
  const conversationId = awaitedParams.id;
  console.log(`API GET /api/conversations/${conversationId}/messages: Request received.`);

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.warn(`API GET Messages: Unauthorized - Invalid session for conv ${conversationId}.`);
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 1. Buscar a conversa para obter o workspaceId e verificar existência
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { workspace_id: true } // Só precisamos do workspace_id
    });

    if (!conversation) {
      console.error(`API GET Messages: Conversation ${conversationId} not found.`);
      return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
    }
    const workspaceId = conversation.workspace_id;

    // 2. Verificar permissão no workspace da conversa
    const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
    if (!hasAccess) {
      console.warn(`API GET Messages: Permission denied for User ${userId} on Workspace ${workspaceId} (Conv: ${conversationId})`);
      return NextResponse.json({ success: false, error: 'Permissão negada para acessar esta conversa' }, { status: 403 });
    }
    console.log(`API GET Messages: User ${userId} has permission for Conv ${conversationId}`);

    // 3. Buscar as mensagens da conversa
    const messages = await prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { timestamp: 'asc' }, // Ordenar da mais antiga para a mais recente
      select: { // Selecionar campos necessários para a UI
        id: true,
        conversation_id: true,
        sender_type: true,
        content: true,
        timestamp: true,
        channel_message_id: true,
        metadata: true,
      },
    });

    console.log(`API GET Messages: Found ${messages.length} messages for conversation ${conversationId}.`);
    return NextResponse.json({ success: true, data: messages as Message[] }); // Faz cast para o tipo Message da UI

  } catch (error) {
    console.error(`API GET Messages: Internal error for conversation ${conversationId}:`, error);
    return NextResponse.json({ success: false, error: 'Erro interno ao buscar mensagens' }, { status: 500 });
  }
}


const sendMessageSchema = z.object({
  content: z.string().min(1, "O conteúdo da mensagem não pode ser vazio."),
  // workspaceId: z.string().uuid(), // Não precisa vir no body, pegamos da conversa
  // senderType: z.enum(['AI', 'SYSTEM']), // Opcional: Definir quem está enviando manualmente
});

export async function POST(
req: NextRequest,
{ params }: { params: { id: string } } // 'id' é o conversationId
) {
const conversationId = params.id;
console.log(`API POST /api/conversations/${conversationId}/messages: Request received - Send Manual Message`);
try {
  // 1. Autenticação e Autorização
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
  }
  const userId = session.user.id; // Quem está enviando a mensagem manualmente

  // 2. Buscar Conversa e Workspace (incluindo credenciais)
  const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
          workspace: { // Precisamos dos dados do workspace para enviar
              select: {
                  id: true,
                  lumibot_account_id: true,
                  lumibot_api_token: true,
              }
          }
      }
  });

  if (!conversation) {
      return NextResponse.json({ success: false, error: 'Conversa não encontrada' }, { status: 404 });
  }
  if (!conversation.workspace) {
      // Isso não deveria acontecer se a relação está correta
      return NextResponse.json({ success: false, error: 'Workspace associado não encontrado' }, { status: 500 });
  }
  const workspaceId = conversation.workspace.id;

  // 3. Verificar Permissão (Ex: MEMBER pode enviar?)
  const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
  if (!hasPermission) {
      return NextResponse.json({ success: false, error: 'Permissão negada para enviar mensagem nesta conversa' }, { status: 403 });
  }

   // 4. Validar Corpo da Requisição
  const body = await req.json();
  const validation = sendMessageSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
  }
  const { content } = validation.data;
  const senderType = MessageSenderType.AI; // Ou SYSTEM, ou receber do body se quiser diferenciar

  // 5. Verificar Credenciais e Dados Necessários para Envio
  const { lumibot_account_id, lumibot_api_token } = conversation.workspace;
  const channelConversationId = conversation.channel_conversation_id;

  if (!lumibot_account_id || !lumibot_api_token) {
       console.error(`API POST Messages (${conversationId}): Lumibot credentials missing for workspace ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'Credenciais de envio não configuradas para este workspace.' }, { status: 500 });
  }
   if (!channelConversationId) {
      console.error(`API POST Messages (${conversationId}): Channel Conversation ID missing.`);
      return NextResponse.json({ success: false, error: 'ID da conversa no canal de origem ausente.' }, { status: 400 });
  }

  // 6. Enviar via Lumibot
  console.log(`API POST Messages (${conversationId}): Sending manual message via Lumibot...`);
  const sendResult = await enviarTextoLivreLumibot(
      lumibot_account_id,
      channelConversationId,
      lumibot_api_token,
      content
  );

  if (!sendResult.success) {
      console.error(`API POST Messages (${conversationId}): Failed to send message via Lumibot.`, sendResult.responseData);
      // Pode retornar um erro mais específico baseado na resposta da Lumibot, se houver
      throw new Error(`Falha ao enviar mensagem para o canal: ${JSON.stringify(sendResult.responseData)}`);
  }
  console.log(`API POST Messages (${conversationId}): Message sent successfully via Lumibot.`);

  // 7. Salvar Mensagem no Banco de Dados
  const messageTimestamp = new Date();
  const newMessage = await prisma.message.create({
      data: {
          conversation_id: conversationId,
          sender_type: senderType,
          content: content,
          timestamp: messageTimestamp,
          // channel_message_id pode vir da resposta da Lumibot se ela retornar
          metadata: { manual_sender_id: userId } // Opcional: registrar quem enviou manualmente
      },
      // Selecionar dados para retornar (igual ao GET)
      select: {
          id: true,
          conversation_id: true,
          sender_type: true,
          content: true,
          timestamp: true,
          channel_message_id: true,
          metadata: true,
      }
  });
  console.log(`API POST Messages (${conversationId}): Manual message saved to DB (ID: ${newMessage.id}).`);

  // 8. Atualizar last_message_at da Conversa
  await prisma.conversation.update({
      where: { id: conversationId },
      data: {
          last_message_at: messageTimestamp,
          status: ConversationStatus.ACTIVE, // Garante que a conversa está ativa após envio manual
          updated_at: new Date()
      }
  });
  console.log(`API POST Messages (${conversationId}): Conversation last_message_at updated.`);


  // 9. Retornar Sucesso com a Mensagem Criada
  return NextResponse.json({ success: true, data: newMessage as Message }); // Cast para tipo da UI

} catch (error: any) {
  console.error(`API POST Messages (${conversationId}): Internal Server Error:`, error);
  return NextResponse.json({ success: false, error: error.message || 'Erro interno do servidor ao enviar mensagem.' }, { status: 500 });
}
}