import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHmac } from "crypto";

/**
 * Função utilitária para calcular a assinatura HMAC para um payload
 */
function generateSignature(payload: any, secret: string): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Função utilitária para enviar um evento para um webhook
 */
async function sendWebhookEvent(
  webhook: { id: string; url: string; secret: string },
  event: string,
  workspaceId: string,
  data: any
) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    workspace_id: workspaceId,
    data
  };

  const signature = generateSignature(payload, webhook.secret);

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': signature,
        'x-webhook-event': event
      },
      body: JSON.stringify(payload)
    });

    // Atualizar o último uso do webhook
    await prisma.workspaceWebhook.update({
      where: { id: webhook.id },
      data: { last_used_at: new Date() }
    });

    return { success: response.ok, statusCode: response.status };
  } catch (error) {
    console.error(`Erro ao enviar webhook para ${webhook.url}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Função principal para acionar eventos de webhook
 * 
 * Esta API é chamada internamente pelo sistema quando ocorrem eventos
 */
export async function POST(request: NextRequest) {
  // Esta API é apenas para uso interno do sistema
  const authHeader = request.headers.get('x-internal-api-key');
  const internalApiKey = process.env.INTERNAL_API_KEY;
  
  if (!authHeader || authHeader !== internalApiKey) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  
  try {
    const { event, workspaceId, data } = await request.json();
    
    if (!event || !workspaceId || !data) {
      return NextResponse.json(
        { error: 'Dados inválidos. Evento, workspaceId e data são obrigatórios' }, 
        { status: 400 }
      );
    }
    
    // Buscar webhooks ativos que estejam inscritos neste evento
    const webhooks = await prisma.workspaceWebhook.findMany({
      where: {
        workspace_id: workspaceId,
        active: true,
        events: { has: event }
      }
    });
    
    if (webhooks.length === 0) {
      return NextResponse.json({ message: 'Nenhum webhook configurado para este evento' });
    }
    
    // Enviar o evento para todos os webhooks inscritos
    const results = await Promise.all(
      webhooks.map(webhook => 
        sendWebhookEvent(webhook, event, workspaceId, data)
      )
    );
    
    return NextResponse.json({
      message: `Evento ${event} enviado para ${results.length} webhooks`,
      results
    });
  } catch (error) {
    console.error('Erro ao acionar webhooks:', error);
    return NextResponse.json(
      { error: 'Erro ao processar a requisição' },
      { status: 500 }
    );
  }
}