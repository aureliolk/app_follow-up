// app/api/follow-up/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth/auth-options';
import { checkPermission } from '@/lib/permissions'; // Importar verificação de permissão

// Esquema Zod para validação dos dados de atualização (opcional, mas recomendado)
// Ajuste os campos conforme o que você permite atualizar
const campaignUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
  idLumibot: z.string().nullable().optional(),
  tokenAgentLumibot: z.string().nullable().optional(),
  ai_prompt_product_name: z.string().nullable().optional(),
  ai_prompt_target_audience: z.string().nullable().optional(),
  ai_prompt_pain_point: z.string().nullable().optional(),
  ai_prompt_main_benefit: z.string().nullable().optional(),
  ai_prompt_tone_of_voice: z.string().nullable().optional(),
  ai_prompt_extra_instructions: z.string().nullable().optional(),
  ai_prompt_cta_link: z.string().nullable().optional(),
  ai_prompt_cta_text: z.string().nullable().optional(),
  // workspaceId é necessário para verificação, mas não é um campo da campanha em si
  workspaceId: z.string().uuid("ID do Workspace inválido"),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id; // ID da campanha vindo da URL
    console.log(`PUT /api/follow-up/campaigns/${campaignId}: Request received`);

    // 1. Verificar Autenticação
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error(`PUT /api/follow-up/campaigns/${campaignId}: Unauthorized - No session user ID`);
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Obter e Validar Dados do Corpo
    const body = await req.json();
    console.log(`PUT /api/follow-up/campaigns/${campaignId}: Request body:`, body);

    const validation = campaignUpdateSchema.safeParse(body);
    if (!validation.success) {
      console.error(`PUT /api/follow-up/campaigns/${campaignId}: Invalid request data:`, validation.error.errors);
      return NextResponse.json({ success: false, error: 'Dados inválidos', details: validation.error.errors }, { status: 400 });
    }
    const { workspaceId, ...updateData } = validation.data; // Separa workspaceId dos dados de update

    // 3. Verificar Permissão
    // Exige permissão de ADMIN para editar campanhas
    const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
    if (!hasPermission) {
      console.warn(`PUT /api/follow-up/campaigns/${campaignId}: Forbidden - User ${userId} lacks ADMIN permission on workspace ${workspaceId}`);
      return NextResponse.json({ success: false, error: 'Permissão negada para editar esta campanha' }, { status: 403 });
    }
    console.log(`PUT /api/follow-up/campaigns/${campaignId}: User ${userId} has ADMIN permission on workspace ${workspaceId}`);

    // 4. Verificar se a Campanha Pertence ao Workspace (IMPORTANTE PARA SEGURANÇA)
    const campaignLink = await prisma.workspaceFollowUpCampaign.findUnique({
        where: {
            workspace_id_campaign_id: { // Usando o índice único
                workspace_id: workspaceId,
                campaign_id: campaignId,
            }
        }
    });

    if (!campaignLink) {
        console.error(`PUT /api/follow-up/campaigns/${campaignId}: Campaign not found or does not belong to workspace ${workspaceId}`);
        return NextResponse.json({ success: false, error: 'Campanha não encontrada neste workspace' }, { status: 404 });
    }
    console.log(`PUT /api/follow-up/campaigns/${campaignId}: Campaign confirmed to belong to workspace ${workspaceId}`);

    // 5. Atualizar a Campanha no Banco de Dados
    const updatedCampaign = await prisma.followUpCampaign.update({
      where: {
        id: campaignId,
        // Adicionar uma verificação extra aqui é redundante se já verificamos o campaignLink,
        // mas não prejudica:
        // workspaces: { some: { workspace_id: workspaceId } }
      },
      data: updateData, // Passa apenas os dados validados para atualização
    });

    console.log(`PUT /api/follow-up/campaigns/${campaignId}: Campaign updated successfully`);

    // 6. Retornar a Campanha Atualizada
    // Limpar cache no cliente (o contexto já faz isso, mas um header pode ajudar)
    const headers = new Headers();
    headers.append('Cache-Control', 'no-store, max-age=0');

    return NextResponse.json({ success: true, data: updatedCampaign }, { status: 200, headers });

  } catch (error) {
    console.error(`PUT /api/follow-up/campaigns/[id]: Error updating campaign:`, error);
    let errorMessage = 'Erro interno ao atualizar campanha';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    // Evitar vazar detalhes de erros do Prisma no cliente se não for desejado
    return NextResponse.json({ success: false, error: 'Erro interno ao atualizar campanha' }, { status: 500 });
  }
}

// Opcional: Implementar GET para buscar uma campanha específica (se necessário)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
   try {
     const campaignId = params.id;
     const url = new URL(req.url);
     const workspaceId = url.searchParams.get('workspaceId');

     console.log(`GET /api/follow-up/campaigns/${campaignId}: Request received (Workspace ID: ${workspaceId})`);

     // 1. Verificar Autenticação
     const session = await getServerSession(authOptions);
     if (!session?.user?.id) {
       console.error(`GET /api/follow-up/campaigns/${campaignId}: Unauthorized - No session user ID`);
       return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
     }
     const userId = session.user.id;

     if (!workspaceId) {
       console.error(`GET /api/follow-up/campaigns/${campaignId}: Missing workspaceId query parameter`);
       return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
     }

     // 2. Verificar Permissão (VIEWER é suficiente para ler)
     const hasPermission = await checkPermission(workspaceId, userId, 'VIEWER');
     if (!hasPermission) {
       console.warn(`GET /api/follow-up/campaigns/${campaignId}: Forbidden - User ${userId} lacks VIEWER permission on workspace ${workspaceId}`);
       return NextResponse.json({ success: false, error: 'Permissão negada para acessar esta campanha' }, { status: 403 });
     }

     // 3. Buscar a campanha garantindo que pertence ao workspace
     const campaign = await prisma.followUpCampaign.findFirst({
       where: {
         id: campaignId,
         workspaces: {
           some: {
             workspace_id: workspaceId,
           },
         },
       },
       // Incluir stages e steps se necessário para a visualização/edição
       // include: {
       //   stages: {
       //     orderBy: { order: 'asc' },
       //     include: {
       //       steps: { orderBy: { order: 'asc' } }
       //     }
       //   }
       // }
     });

     if (!campaign) {
       console.error(`GET /api/follow-up/campaigns/${campaignId}: Campaign not found in workspace ${workspaceId}`);
       return NextResponse.json({ success: false, error: 'Campanha não encontrada' }, { status: 404 });
     }

     console.log(`GET /api/follow-up/campaigns/${campaignId}: Campaign found successfully`);

     // Retornar a campanha
     const headers = new Headers();
     headers.append('Cache-Control', 'no-store, max-age=0'); // Evitar cache
     return NextResponse.json({ success: true, data: campaign }, { status: 200, headers });

   } catch (error) {
     console.error(`GET /api/follow-up/campaigns/[id]: Error fetching campaign:`, error);
     return NextResponse.json({ success: false, error: 'Erro interno ao buscar campanha' }, { status: 500 });
   }
}


// Opcional: Implementar DELETE para excluir uma campanha
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
   try {
     const campaignId = params.id;
     const url = new URL(req.url);
     const workspaceId = url.searchParams.get('workspaceId'); // Espera workspaceId como query param

     console.log(`DELETE /api/follow-up/campaigns/${campaignId}: Request received (Workspace ID: ${workspaceId})`);

     // 1. Verificar Autenticação
     const session = await getServerSession(authOptions);
     if (!session?.user?.id) {
        console.error(`DELETE /api/follow-up/campaigns/${campaignId}: Unauthorized - No session user ID`);
       return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
     }
     const userId = session.user.id;

     if (!workspaceId) {
        console.error(`DELETE /api/follow-up/campaigns/${campaignId}: Missing workspaceId query parameter`);
       return NextResponse.json({ success: false, error: 'ID do Workspace é obrigatório' }, { status: 400 });
     }

     // 2. Verificar Permissão (ADMIN necessário para excluir)
     const hasPermission = await checkPermission(workspaceId, userId, 'ADMIN');
     if (!hasPermission) {
        console.warn(`DELETE /api/follow-up/campaigns/${campaignId}: Forbidden - User ${userId} lacks ADMIN permission on workspace ${workspaceId}`);
       return NextResponse.json({ success: false, error: 'Permissão negada para excluir esta campanha' }, { status: 403 });
     }

     // 3. Excluir o VÍNCULO e a CAMPANHA (em uma transação)
     //    A exclusão em cascata (`onDelete: Cascade`) no schema deve cuidar disso
     //    SE a relação WorkspaceFollowUpCampaign -> FollowUpCampaign tiver onDelete: Cascade.
     //    Vamos assumir que tem, então só precisamos excluir a campanha.
     //    MAS, precisamos garantir que a campanha pertence ao workspace antes de excluir.

      const campaignToDelete = await prisma.followUpCampaign.findFirst({
        where: {
          id: campaignId,
          workspaces: {
            some: {
              workspace_id: workspaceId
            }
          }
        }
      });

      if (!campaignToDelete) {
          console.error(`DELETE /api/follow-up/campaigns/${campaignId}: Campaign not found or does not belong to workspace ${workspaceId}`);
         return NextResponse.json({ success: false, error: 'Campanha não encontrada neste workspace' }, { status: 404 });
      }

      // Excluir a campanha (a relação em WorkspaceFollowUpCampaign deve ser excluída por cascata)
      // Se a cascata não estiver configurada, você precisaria excluir WorkspaceFollowUpCampaign primeiro.
      await prisma.followUpCampaign.delete({
        where: { id: campaignId },
      });

      console.log(`DELETE /api/follow-up/campaigns/${campaignId}: Campaign deleted successfully`);

     return NextResponse.json({ success: true, message: 'Campanha excluída com sucesso' }, { status: 200 });

   } catch (error) {
     console.error(`DELETE /api/follow-up/campaigns/[id]: Error deleting campaign:`, error);
     // Verificar se é erro de chave estrangeira (follow-ups ativos impedindo exclusão)
     // if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
     //   return NextResponse.json({ success: false, error: 'Não é possível excluir a campanha pois existem follow-ups ativos associados a ela.' }, { status: 409 }); // Conflict
     // }
     return NextResponse.json({ success: false, error: 'Erro interno ao excluir campanha' }, { status: 500 });
   }
}