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

      // Extrair informações do payload do Lumibot
      let clientId = '';
      let message = '';

      // Verificar se é um webhook do Lumibot com o formato esperado
      if (payload.event === 'message_created' && payload.conversation) {
        // Usar o ID da conversa como clientId
        clientId = payload.conversation.id?.toString() || 'unknown';
        
        // Verificar se é uma mensagem do cliente (incoming)
        if (payload.message_type === 'incoming') {
          message = payload.content || '';
        } else {
          // Se não for uma mensagem do cliente, ignoramos
          return NextResponse.json({ success: true, ignored: "Mensagem do agente ignorada" });
        }
      } else {
        return NextResponse.json(
          {
            error: "Formato de webhook não suportado",
            received: payload
          },
          { status: 400 }
        );
      }

      // Validar se temos as informações necessárias
      if (!clientId || !message) {
        return NextResponse.json(
          {
            error: "Não foi possível extrair clientId e mensagem do webhook",
            received: payload
          },
          { status: 400 }
        );
      }

      // CORREÇÃO: Primeiro buscar os IDs de campanha associados ao workspace
      const workspaceCampaigns = await prisma.workspaceFollowUpCampaign.findMany({
        where: { 
          workspace_id: workspaceId 
        },
        select: { 
          campaign_id: true 
        }
      });

      const campaignIds = workspaceCampaigns.map(wc => wc.campaign_id);

      // Buscar follow-ups ativos para este cliente neste workspace
      const activeFollowUps = await prisma.followUp.findMany({
        where: {
          client_id: clientId,
          status: "active",
          campaign_id: {
            in: campaignIds
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

      // Importar a função de processamento de resposta para seguir o fluxo
      const { handleClientResponse } = await import('@/app/api/follow-up/_lib/manager');
      
      // Processar a resposta do cliente para continuar o fluxo de follow-up
      await handleClientResponse(clientId, message, followUp.id);

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