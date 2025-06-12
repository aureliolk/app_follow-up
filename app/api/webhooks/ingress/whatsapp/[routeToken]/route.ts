// app/api/webhooks/ingress/whatsapp/[routeToken]/route.ts

import { type NextRequest, NextResponse } from 'next/server';
// import { WhatsAppWebhookService } from '@/lib/services/whatsappWebhookService';

interface RouteParams {
    params: {
        routeToken: string;
    }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    
    return NextResponse.json(
        { message: 'WhatsApp Webhook GET endpoint is not implemented.' },
        { status: 501 } // Not Implemented
    );
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const { routeToken } = await params;
    return NextResponse.json(
        { message: `WhatsApp Webhook POST endpoint received with token ${routeToken}.` },
        { status: 200 }
    );
}
