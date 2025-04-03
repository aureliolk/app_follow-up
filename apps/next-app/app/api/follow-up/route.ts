// app/api/follow-up/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/packages/shared-lib/src/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/packages/shared-lib/src/auth/auth-options';
import { checkPermission } from '@/packages/shared-lib/src/permissions'; // Ou lógica similar

// Função para buscar campanhas (GET)
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const url = new URL(req.url);
        const workspaceId = url.searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
        }

        // Verificar permissão (pelo menos VIEWER para listar)
        const hasAccess = await checkPermission(workspaceId, session.user.id, 'VIEWER');
        if (!hasAccess) {
            console.warn(`Usuário ${session.user.id} sem permissão para listar campanhas no workspace ${workspaceId}`);
            return NextResponse.json({ success: false, error: 'Permissão negada para acessar este workspace' }, { status: 403 });
        }

        const campaignLinks = await prisma.workspaceFollowUpCampaign.findMany({
            where: {
                workspace_id: workspaceId
            },
            select: {
                campaign_id: true
            }
        });

        // 2. Extraia as IDs das campanhas
        const campaignIds = campaignLinks.map(link => link.campaign_id);

        // 3. Agora busque as campanhas usando essas IDs
        const campaigns = await prisma.followUpCampaign.findMany({
            where: {
                id: {
                    in: campaignIds
                }
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        console.log(`API: Encontradas ${campaigns.length} campanhas para workspace ${workspaceId}`);
        return NextResponse.json({ success: true, data: campaigns });


    } catch (error) {
        console.error('API Error fetching campaigns:', error);
        return NextResponse.json({ success: false, error: 'Erro interno ao buscar campanhas' }, { status: 500 });
    }
}

// Função para criar campanha (POST) - Mantenha se já existir
export async function POST(req: NextRequest) {
    // ... sua lógica POST existente ...
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const { workspaceId, ...campaignData } = body; // Extrai workspaceId

        if (!workspaceId) {
            return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
        }

        // Verificar permissão para criar (ADMIN ou MEMBER talvez?)
        const hasPermission = await checkPermission(workspaceId, session.user.id, 'MEMBER'); // Ou 'ADMIN'
        if (!hasPermission) {
            console.warn(`Usuário ${session.user.id} sem permissão para criar campanha no workspace ${workspaceId}`);
            return NextResponse.json({ success: false, error: 'Permissão negada para criar campanha' }, { status: 403 });
        }

        // 1. Primeiro crie a campanha
        const newCampaign = await prisma.followUpCampaign.create({
            data: campaignData
        });

        // 2. Depois vincule a campanha ao workspace
        await prisma.workspaceFollowUpCampaign.create({
            data: {
                workspace_id: workspaceId,
                campaign_id: newCampaign.id
            }
        });

        console.log(`API: Campanha ${newCampaign.id} criada no workspace ${workspaceId}`);
        return NextResponse.json({ success: true, data: newCampaign }, { status: 201 });


    } catch (error) {
        console.error('API Error creating campaign:', error);
        return NextResponse.json({ success: false, error: 'Erro interno ao criar campanha' }, { status: 500 });

    }
}