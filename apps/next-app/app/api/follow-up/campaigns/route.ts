// app/api/follow-up/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/packages/shared-lib/src/db'; // Ajuste o caminho se necessário
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/packages/shared-lib/src/auth/auth-options'; // Ajuste o caminho se necessário
import { checkPermission } from '@/packages/shared-lib/src/permissions'; // Ajuste o caminho se necessário
import { z } from 'zod'; // Importar Zod para validação no POST

// --- Função GET: Buscar campanhas por workspace ---
export async function GET(req: NextRequest) {
    console.log("API GET /api/follow-up/campaigns: Requisição recebida.");
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) { // Verificar ID do usuário
            console.warn("API GET Campaigns: Não autorizado - Sessão inválida.");
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }
        const userId = session.user.id;

        const url = new URL(req.url);
        const workspaceId = url.searchParams.get('workspaceId');
        console.log("API GET Campaigns: Recebido workspaceId:", workspaceId);

        if (!workspaceId) {
            console.error("API GET Campaigns: Erro - ID do Workspace é obrigatório.");
            return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
        }

        // Verificar permissão (pelo menos VIEWER para listar)
        const hasAccess = await checkPermission(workspaceId, userId, 'VIEWER');
        if (!hasAccess) {
            console.warn(`API GET Campaigns: Permissão negada para User ${userId} no Workspace ${workspaceId}`);
            return NextResponse.json({ success: false, error: 'Permissão negada para acessar este workspace' }, { status: 403 });
        }
        console.log(`API GET Campaigns: User ${userId} tem permissão VIEWER no Workspace ${workspaceId}`);

        // 1. Buscar os VÍNCULOS entre workspace e campanhas
        const campaignLinks = await prisma.workspaceFollowUpCampaign.findMany({
            where: {
                workspace_id: workspaceId
            },
            select: {
                campaign_id: true // Selecionar apenas o ID da campanha vinculada
            }
        });
        console.log(`API GET Campaigns: Encontrados ${campaignLinks.length} vínculos para Workspace ${workspaceId}:`, campaignLinks);

        // 2. Extrair os IDs das campanhas vinculadas
        const campaignIds = campaignLinks.map(link => link.campaign_id);
        console.log("API GET Campaigns: IDs das campanhas vinculadas:", campaignIds);

        // 3. Se não houver IDs vinculados, retornar lista vazia imediatamente
        if (campaignIds.length === 0) {
             console.log("API GET Campaigns: Nenhuma campanha vinculada encontrada para este workspace.");
             return NextResponse.json({ success: true, data: [] }); // Retorna sucesso com dados vazios
        }

        // 4. Buscar os detalhes das campanhas usando os IDs encontrados
        const campaigns = await prisma.followUpCampaign.findMany({
            where: {
                id: {
                    in: campaignIds // Filtra pelas campanhas vinculadas
                }
            },
            orderBy: {
                created_at: 'desc' // Ordena pela data de criação
            }
            // Poderia adicionar include aqui se precisasse de dados relacionados (stages, steps, etc.)
            // include: { _count: { select: { follow_ups: true } } } // Exemplo para contagem
        });
        console.log("API GET Campaigns: Campanhas encontradas no DB:", campaigns); // Log CRUCIAL

        console.log(`API GET Campaigns: Retornando ${campaigns.length} campanhas para workspace ${workspaceId}`);
        return NextResponse.json({ success: true, data: campaigns });

    } catch (error) {
        console.error('API GET Campaigns: Erro interno:', error);
        // Evitar vazar detalhes do erro, se desejado
        return NextResponse.json({ success: false, error: 'Erro interno ao buscar campanhas' }, { status: 500 });
    }
}

// --- Schema Zod para validação do corpo do POST ---
const campaignCreateSchema = z.object({
  // workspaceId será pego da sessão/permissão, não do corpo diretamente validado aqui
  name: z.string().min(1, 'Nome da campanha é obrigatório'),
  description: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
  // Campos de IA (opcionais)
  ai_prompt_product_name: z.string().optional().nullable(),
  ai_prompt_target_audience: z.string().optional().nullable(),
  ai_prompt_pain_point: z.string().optional().nullable(),
  ai_prompt_main_benefit: z.string().optional().nullable(),
  ai_prompt_tone_of_voice: z.string().optional().nullable(),
  ai_prompt_extra_instructions: z.string().optional().nullable(),
  ai_prompt_cta_link: z.string().optional().nullable(),
  ai_prompt_cta_text: z.string().optional().nullable(),
   // Campos Lumibot (opcionais)
  idLumibot: z.string().optional().nullable(),
  tokenAgentLumibot: z.string().optional().nullable(),
});


// --- Função POST: Criar nova campanha e vincular ao workspace ---
export async function POST(req: NextRequest) {
    console.log("API POST /api/follow-up/campaigns: Requisição recebida.");
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            console.warn("API POST Campaigns: Não autorizado - Sessão inválida.");
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }
        const userId = session.user.id;

        const body = await req.json();
        // O workspaceId virá no corpo da requisição do frontend (contexto)
        const { workspaceId, ...campaignInputData } = body;

        if (!workspaceId) {
            console.error("API POST Campaigns: Erro - ID do Workspace não fornecido no corpo.");
            return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório no corpo da requisição' }, { status: 400 });
        }
        console.log(`API POST Campaigns: Tentando criar no Workspace ${workspaceId} por User ${userId}`);

        // Validar os dados da campanha usando Zod
        const validation = campaignCreateSchema.safeParse(campaignInputData);
        if (!validation.success) {
            console.error("API POST Campaigns: Erro de validação Zod:", validation.error.errors);
            return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
        }
        const validatedData = validation.data; // Dados validados para criar a campanha

        // Verificar permissão para criar (pelo menos MEMBER ou ADMIN)
        // Ajuste 'MEMBER' ou 'ADMIN' conforme sua regra de negócio
        const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
        if (!hasPermission) {
            console.warn(`API POST Campaigns: Permissão negada para User ${userId} criar no Workspace ${workspaceId}`);
            return NextResponse.json({ success: false, error: 'Permissão negada para criar campanha neste workspace' }, { status: 403 });
        }
        console.log(`API POST Campaigns: User ${userId} tem permissão ADMIN no Workspace ${workspaceId}`);

        // Usar uma transação para garantir atomicidade
        const newCampaign = await prisma.$transaction(async (tx) => {
            // 1. Criar a campanha em si
            const createdCampaign = await tx.followUpCampaign.create({
                data: validatedData // Usa os dados validados
            });
            console.log(`API POST Campaigns: Campanha criada (ID: ${createdCampaign.id})`);

            // 2. Criar o vínculo com o workspace
            await tx.workspaceFollowUpCampaign.create({
                data: {
                    workspace_id: workspaceId,
                    campaign_id: createdCampaign.id
                }
            });
            console.log(`API POST Campaigns: Vínculo criado entre Workspace ${workspaceId} e Campanha ${createdCampaign.id}`);

            return createdCampaign; // Retorna a campanha criada da transação
        });

        console.log(`API POST Campaigns: Campanha ${newCampaign.id} criada e vinculada com sucesso ao workspace ${workspaceId}`);
        // Retorna 201 Created com os dados da nova campanha
        return NextResponse.json({ success: true, data: newCampaign }, { status: 201 });

    } catch (error) {
        console.error('API POST Campaigns: Erro interno:', error);
         // Tratar erros específicos do Prisma (ex: constraint violation) se necessário
        return NextResponse.json({ success: false, error: 'Erro interno ao criar campanha' }, { status: 500 });
    }
}

// Adicione PUT e DELETE aqui se precisar lidar com /api/follow-up/campaigns (sem ID)
// Geralmente PUT/DELETE são feitos em /api/follow-up/campaigns/[id]