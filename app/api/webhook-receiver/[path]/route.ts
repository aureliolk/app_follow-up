//app/api/webhook-receiver/[path]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withApiTokenAuth } from '@/lib/middleware/api-token-auth';


/**
 * Endpoint para receber webhooks de sistemas externos
 * 
 * Este endpoint permite configurar caminhos personalizados para receber eventos de 
 * webhooks de sistemas externos como Chatwoot, Dialogflow, etc.
 */
export async function POST(
  request: NextRequest,
  context: { params: { path: string } }
) {
  return withApiTokenAuth(request, async (req, tokenWorkspaceId) => {
    try {
      // Obter o caminho personalizado da URL
      const { path } = await context.params;

      // Buscar a configuração de webhook pelo caminho
      const webhookConfig = await prisma.workspaceWebhook.findFirst({
        where: {
          // O campo URL será usado como path de entrada
          url: `/api/webhook-receiver/${path}`,
          active: true
        },
        include: {
          workspace: true
        }
      });

      if (!webhookConfig) {
        console.error(`Webhook não encontrado para o caminho: ${path}`);
        return NextResponse.json(
          { error: "Webhook não configurado" },
          { status: 404 }
        );
      }

      // Extrair o workspaceId da configuração
      const workspaceId = webhookConfig.workspace_id;

      // Obter os dados do webhook
      const payload = await request.json();
      // console.log(`Webhook recebido em ${path}:`, payload);

      webhookConfig.events.map((i) => {
        if (i === 'chatwoot.message') {
          console.log(i)
        }else{
          console.log('No condition ', i)
        }
      })

      console.log('Body lumibot', payload)


      return NextResponse.json(
        {
          error: "WorkspaceID",
          received: payload
        },
        { status: 200 }
      );
      // console.log('Webhook config', webhookConfig)



      // Extrair informações com base no formato do payload
      // Formato pode variar dependendo do sistema que está enviando o webhook
      let clientId = '';
      let message = '';

      // Verificar se é do Chatwoot
      if (payload.event === 'message_created' && payload.message) {
        // Formato do Chatwoot
        clientId = payload.conversation?.meta?.sender?.id?.toString() ||
          payload.conversation?.contact?.identifier ||
          'unknown';

        // Verificar se é uma mensagem do cliente (não do agente)
        const isIncoming = payload.message.message_type === 0; // 0 = incoming message no Chatwoot

        if (isIncoming) {
          message = payload.message.content || '';
        } else {
          // Se não for uma mensagem do cliente, ignoramos
          return NextResponse.json({ success: true, ignored: "Mensagem do agente ignorada" });
        }
      }
      // Verificar se é do Dialogflow
      else if (payload.queryResult) {
        // Formato do Dialogflow
        clientId = payload.originalDetectIntentRequest?.payload?.userId ||
          payload.session?.split('/').pop() ||
          'unknown';
        message = payload.queryResult.queryText || '';
      }
      // Formato genérico
      else {
        clientId = payload.clientId || payload.userId || payload.customer_id || payload.id || 'unknown';
        message = payload.message || payload.text || payload.content || '';
      }

      // Se não conseguiu extrair clientId ou mensagem, retorna erro
      if (!clientId || !message) {
        return NextResponse.json(
          {
            error: "Não foi possível extrair clientId e mensagem do webhook",
            received: payload
          },
          { status: 400 }
        );
      }

      // Buscar follow-ups ativos para este cliente neste workspace
      const activeFollowUps = await prisma.followUp.findMany({
        where: {
          client_id: clientId,
          status: "active",
          campaign: {
            WorkspaceFollowUpCampaign: {
              some: {
                workspace_id: workspaceId
              }
            }
          }
        },
        orderBy: {
          started_at: "desc"
        },
        take: 1
      });

      // Se não tiver follow-up ativo, ignoramos a mensagem
      if (activeFollowUps.length === 0) {
        return NextResponse.json({
          success: false,
          error: "Nenhum follow-up ativo encontrado para este cliente",
          clientId
        });
      }

      const followUp = activeFollowUps[0];

      // Registrar a mensagem como vinda do cliente
      const clientMessage = await prisma.followUpMessage.create({
        data: {
          follow_up_id: followUp.id,
          content: message,
          is_from_client: true,
          delivered: true,
          delivered_at: new Date()
        }
      });

      // Atualizar o status do follow-up
      await prisma.followUp.update({
        where: {
          id: followUp.id
        },
        data: {
          waiting_for_response: false,
          last_response: message,
          last_response_at: new Date()
        }
      });

      // Registramos o uso do webhook
      await prisma.workspaceWebhook.update({
        where: {
          id: webhookConfig.id
        },
        data: {
          last_used_at: new Date()
        }
      });

      // Retornar sucesso
      return NextResponse.json({
        success: true,
        message: "Resposta do cliente processada com sucesso",
        followUpId: followUp.id,
        messageId: clientMessage.id,
        clientId
      });
    } catch (error) {
      console.error("Erro ao processar webhook:", error);
      return NextResponse.json(
        { success: false, error: "Erro interno ao processar webhook" },
        { status: 500 }
      );
    }
  });
}