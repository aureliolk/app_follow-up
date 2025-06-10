// app/api/webhooks/ingress/whatsapp/[routeToken]/route.ts

import { type NextRequest, NextResponse } from 'next/server';
import { WhatsAppWebhookService } from '@/lib/services/whatsappWebhookService';

interface RouteParams {
    params: {
        routeToken: string;
    }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const service = new WhatsAppWebhookService();
    return service.handleVerification(request, params.routeToken);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const { routeToken } = params;
    const service = new WhatsAppWebhookService();
    return service.handleIncomingMessage(request, routeToken);
}
