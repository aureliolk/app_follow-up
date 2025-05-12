import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Interface para os parâmetros da rota
interface RouteParams {
    params: {
        evolutionWebhookToken: string;
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const { evolutionWebhookToken } = params;
    console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Recebida requisição POST.`);

    // 1. Buscar Workspace pelo Token do Webhook
    const workspace = await prisma.workspace.findUnique({
        where: { evolution_webhook_route_token: evolutionWebhookToken },
        select: { id: true /* , outros campos se necessários depois */ }
    });

    if (!workspace) {
        console.warn(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Workspace não encontrado para este token. Rejeitando.`);
        return new NextResponse('Workspace not found or invalid token', { status: 404 });
    }
    console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Workspace ${workspace.id} encontrado.`);

    // 2. (Opcional) Adicionar Validação de Segurança Adicional
    // Se a Evolution API enviar algum header de assinatura ou token, validar aqui.
    // Ex: const signature = request.headers.get('X-Evolution-Signature');
    // if (!isValidSignature(signature, await request.text())) {
    //    return new NextResponse('Invalid signature', { status: 403 });
    // }

    // 3. Processar Payload (Por enquanto, apenas logar)
    try {
        const payload = await request.json();
        console.log(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Payload Recebido:`, JSON.stringify(payload, null, 2));

        // TODO: Mapear payload da Evolution para nossos tipos internos
        // TODO: Chamar getOrCreateConversation, saveMessageRecord, etc.
        // TODO: Chamar addMessageProcessingJob para processamento assíncrono
        // TODO: Lógica de Follow-up

    } catch (error: any) {
        console.error(`[EVOLUTION WEBHOOK - POST ${evolutionWebhookToken}] Erro ao processar payload:`, error);
        // Responder OK mesmo em erro de processamento para não bloquear a API Evolution
    }

    // 4. Responder 200 OK para a Evolution API
    return new NextResponse('EVENT_RECEIVED', { status: 200 });
}

// (Opcional) Adicionar método GET se a Evolution precisar de verificação como a Meta
// export async function GET(request: NextRequest, { params }: RouteParams) { ... } 