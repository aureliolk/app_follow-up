import { NextResponse } from 'next/server';
import { processEvolutionPayload } from '@/lib/services/evolutionWebhookService';
import { processWhatsAppPayload } from '@/lib/services/whatsappWebhookService';
import fs from 'fs';
import path from 'path';

interface RouteParams {
    params: {
        routeToken: string;
    }
}


export async function POST(request: Request, { params }: RouteParams) {
    const { routeToken } = await  params;
    const payload = await request.json();

    try {
        // Identificar tipo de payload
        if (payload.event && payload.instance) {
            const payloadType = payload.data?.messageType || 'unknown';
            const filename = `[evo]-recebe-${payloadType.toLowerCase()}.json`;
            fs.writeFileSync(path.join('payload/payload-evo', filename), JSON.stringify(payload, null, 2));
            console.log(`[EVO WEBHOOK] Recebido payload ${JSON.stringify(payload, null, 2)} com token ${routeToken}`);

            return await processEvolutionPayload(payload, routeToken);

        } else if (payload.object === 'whatsapp_business_account') {
            const payloadType = payload.data?.messageType || 'unknown';
            const filename = `[wab]-recebe-${payloadType.toLowerCase()}.json`;
            fs.writeFileSync(path.join('payload/payload-wab', filename), JSON.stringify(payload, null, 2));
            console.log(`[WAB WEBHOOK] Recebido payload ${JSON.stringify(payload, null, 2)} com token ${routeToken}`);

            return await processWhatsAppPayload(payload, routeToken);
        } else {
            return NextResponse.json(
                { error: 'Tipo de payload não reconhecido' },
                { status: 400 }
            );
        }
        

    } catch (error) {
        console.error(`Erro ao processar payload:`, error);
        return NextResponse.json(
            { error: 'Erro interno ao processar payload' },
            { status: 500 }
        );
    }

    
}
