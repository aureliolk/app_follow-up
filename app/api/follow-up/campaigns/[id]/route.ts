// app/api/follow-up/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCampaignDetails } from '../../_lib/initializer'; // Importar a função específica

// Função auxiliar para extrair ID (mantida)
function extractIdFromUrl(url: string): string {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const parts = pathname.split('/');
  // Retorna o penúltimo elemento se a URL terminar com / ou o último caso contrário
  return parts[parts.length - 1] || parts[parts.length - 2];
}


// --- Função GET (Mantida como estava) ---
export async function GET(request: NextRequest) {
  // Usar await para obter o ID da URL corretamente
  const id = extractIdFromUrl(request.url);
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId');

  console.log(`GET /api/follow-up/campaigns/${id} - workspaceId: ${workspaceId}`); // Log de entrada

  try {
    if (workspaceId) {
      const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findFirst({
         where: { workspace_id: workspaceId, campaign_id: id }
      });
      if (!campaignBelongsToWorkspace) {
         console.log(`Campanha ${id} não encontrada no workspace ${workspaceId}`);
         return NextResponse.json({ success: false, error: "Campanha não encontrada neste workspace" }, { status: 404 });
      }
    }

    // Usar a função que busca detalhes, incluindo stages e steps
    const campaignDetails = await getCampaignDetails(id);

    // Se getCampaignDetails lança erro quando não encontra, o catch abaixo tratará
    // Se retorna null ou undefined, tratar aqui:
    if (!campaignDetails) {
        console.error(`Campanha ${id} não encontrada pela função getCampaignDetails.`);
        return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
    }

    const stepsLength = campaignDetails?.steps?.length ?? 0;
    console.log(`Campanha ${id}: ${stepsLength} passos encontrados e formatados.`);

    // Incluir os campos ai_prompt_* na resposta do GET também
    const campaignWithAIPrompts = await prisma.followUpCampaign.findUnique({
      where: { id },
      select: {
        ai_prompt_product_name: true,
        ai_prompt_target_audience: true,
        ai_prompt_pain_point: true,
        ai_prompt_main_benefit: true,
        ai_prompt_tone_of_voice: true,
        ai_prompt_extra_instructions: true,
        ai_prompt_cta_link: true,
        ai_prompt_cta_text: true,
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        ...campaignDetails,
        ...(campaignWithAIPrompts || {}) // Adiciona os campos de IA se encontrados
      }
    });

  } catch (error) {
     if (error instanceof Error && error.message === "Campanha não encontrada") {
         console.error(`Campanha ${id} não encontrada no banco (via getCampaignDetails).`);
         return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
     }
    console.error("Erro ao processar solicitação GET da campanha:", error);
    return NextResponse.json({ success: false, error: "Erro interno do servidor" }, { status: 500 });
  }
}

// --- Função PUT ATUALIZADA ---
export async function PUT(request: NextRequest) {
    // Usar await para obter o ID da URL corretamente
    const id = extractIdFromUrl(request.url);

    try {
        const body = await request.json();
        // Extrair TODOS os campos possíveis do body
        const {
            name,
            description,
            steps, // Steps da campanha (formato frontend)
            active,
            workspaceId, // ID do workspace (opcional, mas importante para permissões)
            idLumibot,
            tokenAgentLumibot,
            // Novos campos de prompt AI
            ai_prompt_product_name,
            ai_prompt_target_audience,
            ai_prompt_pain_point,
            ai_prompt_main_benefit,
            ai_prompt_tone_of_voice,
            ai_prompt_extra_instructions,
            ai_prompt_cta_link,
            ai_prompt_cta_text
        } = body;

        console.log(`PUT /api/follow-up/campaigns/${id} - Dados recebidos:`, {
            name, description, active, workspaceId, idLumibot, tokenAgentLumibot,
            stepsCount: steps?.length || 0, ai_prompts: { /* log簡略化 */ }
        });

        if (!name) {
            return NextResponse.json(
                { success: false, error: "Nome da campanha é obrigatório" },
                { status: 400 }
            );
        }

        // 1. Verificar se a campanha existe
        const existingCampaign = await prisma.followUpCampaign.findUnique({
            where: { id }
        });

        if (!existingCampaign) {
            return NextResponse.json(
                { success: false, error: "Campanha não encontrada" },
                { status: 404 }
            );
        }

        // 2. (Opcional mas recomendado) Verificar permissão do usuário para editar esta campanha/workspace
        //    A lógica de permissão (checkPermission) seria chamada aqui se integrada

        // 3. Usar transação para atualizar campanha e potencialmente steps
        const result = await prisma.$transaction(async (tx) => {
            // 3.1 Atualizar dados básicos da campanha, incluindo os campos de IA
            const updatedCampaign = await tx.followUpCampaign.update({
                where: { id },
                data: {
                    name,
                    description: description ?? existingCampaign.description, // Manter existente se não fornecido
                    idLumibot: idLumibot ?? existingCampaign.idLumibot,
                    tokenAgentLumibot: tokenAgentLumibot ?? existingCampaign.tokenAgentLumibot,
                    active: active !== undefined ? active : existingCampaign.active,
                    // Atualizar campos de IA (usando ?? para manter valor antigo se não passado no body)
                    ai_prompt_product_name: ai_prompt_product_name ?? existingCampaign.ai_prompt_product_name,
                    ai_prompt_target_audience: ai_prompt_target_audience ?? existingCampaign.ai_prompt_target_audience,
                    ai_prompt_pain_point: ai_prompt_pain_point ?? existingCampaign.ai_prompt_pain_point,
                    ai_prompt_main_benefit: ai_prompt_main_benefit ?? existingCampaign.ai_prompt_main_benefit,
                    ai_prompt_tone_of_voice: ai_prompt_tone_of_voice ?? existingCampaign.ai_prompt_tone_of_voice,
                    ai_prompt_extra_instructions: ai_prompt_extra_instructions ?? existingCampaign.ai_prompt_extra_instructions,
                    ai_prompt_cta_link: ai_prompt_cta_link ?? existingCampaign.ai_prompt_cta_link,
                    ai_prompt_cta_text: ai_prompt_cta_text ?? existingCampaign.ai_prompt_cta_text,
                }
            });

            console.log("Dados básicos da Campanha atualizados:", updatedCampaign.id);

            // 3.2 (Opcional) Atualizar/Sincronizar Steps se eles forem enviados
            // Esta lógica de sincronização de steps é complexa e pode ser melhor
            // gerenciada por endpoints específicos de steps ou stages.
            // Mantendo a lógica original que você tinha, mas ciente da complexidade.
            if (steps && Array.isArray(steps)) {
                console.log(`Sincronizando ${steps.length} passos...`);
                // (Lógica de sincronização de steps - como no código original)
                // ... obter stageIds, deletar órfãos, upsert steps ...
                // Exemplo simplificado de upsert (requer lógica mais robusta para delete/order)
                 const stageIds = (await tx.followUpFunnelStage.findMany({
                    where: { campaign_id: id }, select: { id: true }
                 })).map(s => s.id);

                 // Delete steps not in the new list that belong to this campaign's stages
                 const currentStepIds = steps.map(s => s.id).filter(Boolean);
                 await tx.followUpStep.deleteMany({
                     where: {
                         funnel_stage_id: { in: stageIds },
                         id: { notIn: currentStepIds }
                     }
                 });

                 // Upsert steps
                for (const step of steps) {
                    const calculateWaitTimeMs = (timeStr: string | null | undefined): number => {
                        if (!timeStr) return 30 * 60 * 1000; // Padrão 30 min
                        const lcTimeStr = timeStr.toLowerCase();
                        const numMatch = lcTimeStr.match(/(\d+)/);
                        const value = numMatch ? parseInt(numMatch[1], 10) : 30;

                        if (lcTimeStr.includes("minuto")) return value * 60 * 1000;
                        if (lcTimeStr.includes("hora")) return value * 60 * 60 * 1000;
                        if (lcTimeStr.includes("dia")) return value * 24 * 60 * 60 * 1000;

                        const shortMatch = lcTimeStr.match(/^(\d+)([mhd])$/i);
                        if (shortMatch) {
                            const shortValue = parseInt(shortMatch[1], 10);
                            const unit = shortMatch[2].toLowerCase();
                            if (unit === 'm') return shortValue * 60 * 1000;
                            if (unit === 'h') return shortValue * 60 * 60 * 1000;
                            if (unit === 'd') return shortValue * 24 * 60 * 60 * 1000;
                        }
                        if (/^\d+$/.test(lcTimeStr.trim())) return value * 60 * 1000;
                        return 30 * 60 * 1000; // Fallback
                    };

                    const stepData = {
                        funnel_stage_id: step.stage_id, // Obrigatório
                        name: step.template_name || 'Passo sem nome', // Usar template_name como nome
                        template_name: step.template_name || '', // Obrigatório
                        wait_time: step.wait_time || '30 minutos', // Obrigatório
                        wait_time_ms: calculateWaitTimeMs(step.wait_time),
                        message_content: step.message || '', // Obrigatório
                        category: step.category || 'Utility',
                        // Campos opcionais podem precisar de tratamento de null/undefined
                        is_hsm: step.is_hsm ?? false, // Assumir false se não fornecido
                        order: step.order ?? 0, // Assumir 0 se não fornecido
                    };

                     if (!stepData.funnel_stage_id) {
                        console.warn("Pulando step sem stage_id:", step);
                        continue;
                    }

                    if (step.id) {
                        await tx.followUpStep.update({
                            where: { id: step.id },
                            data: stepData,
                        });
                    } else {
                        await tx.followUpStep.create({
                            data: stepData,
                        });
                    }
                }
            }

            // 3.3 Buscar a campanha completa para retornar (incluindo stages e AI prompts)
            // É importante selecionar os campos aqui para que estejam no 'result'
            return await tx.followUpCampaign.findUnique({
                where: { id },
                select: {
                    id: true, name: true, description: true, active: true, idLumibot: true, tokenAgentLumibot: true, created_at: true,
                    // Selecionar os campos de IA
                    ai_prompt_product_name: true, ai_prompt_target_audience: true, ai_prompt_pain_point: true,
                    ai_prompt_main_benefit: true, ai_prompt_tone_of_voice: true, ai_prompt_extra_instructions: true,
                    ai_prompt_cta_link: true, ai_prompt_cta_text: true,
                    // Incluir stages
                    stages: {
                        select: { id: true, name: true, order: true },
                        orderBy: { order: 'asc' }
                    }
                }
            });
        }); // Fim da Transação

        // 4. Buscar os steps formatados separadamente (como antes, se necessário)
        const campaignSteps = await prisma.followUpStep.findMany({
            where: { funnel_stage: { campaign_id: id } },
            include: { funnel_stage: true },
            orderBy: {
                 // Ordenar por stage.order primeiro, depois pelo order do step se existir, senão wait_time
                 funnel_stage: { order: 'asc' },
                 order: 'asc',
                 wait_time_ms: 'asc'
            }
        });
        const formattedSteps = campaignSteps.map((step: any) => ({
            id: step.id,
            stage_id: step.funnel_stage_id,
            stage_name: step.funnel_stage.name,
            stage_order: step.funnel_stage.order, // Adicionar ordem do stage
            template_name: step.template_name,
            wait_time: step.wait_time,
            message: step.message_content,
            category: step.category || 'Utility', // Corrigido de message_category
            is_hsm: step.is_hsm, // Incluir is_hsm
            order: step.order, // Incluir ordem do step
            // Remover auto_respond se não existir mais no schema
        }));

        // 5. Estruturar a resposta final incluindo os campos de IA do 'result'
        const responseData = {
            id: result?.id,
            name: result?.name,
            description: result?.description,
            active: result?.active,
            idLumibot: result?.idLumibot,
            tokenAgentLumibot: result?.tokenAgentLumibot,
            // Incluir campos de IA
            ai_prompt_product_name: result?.ai_prompt_product_name,
            ai_prompt_target_audience: result?.ai_prompt_target_audience,
            ai_prompt_pain_point: result?.ai_prompt_pain_point,
            ai_prompt_main_benefit: result?.ai_prompt_main_benefit,
            ai_prompt_tone_of_voice: result?.ai_prompt_tone_of_voice,
            ai_prompt_extra_instructions: result?.ai_prompt_extra_instructions,
            ai_prompt_cta_link: result?.ai_prompt_cta_link,
            ai_prompt_cta_text: result?.ai_prompt_cta_text,
            // Manter steps e stages formatados
            steps: formattedSteps,
            stages: result?.stages
        };

        const response = {
            success: true,
            message: "Campanha atualizada com sucesso",
            data: responseData
        };

        console.log("Resposta final da atualização:", response.message);

        return NextResponse.json(response);

    } catch (error) {
        console.error("Erro ao atualizar campanha:", error);
        return NextResponse.json(
            { success: false, error: "Erro interno do servidor", details: error instanceof Error ? error.message : "Erro desconhecido" },
            { status: 500 }
        );
    }
}


// --- Função DELETE (Mantida como estava) ---
export async function DELETE(request: NextRequest) {
    // Usar await para obter o ID da URL corretamente
    const id = extractIdFromUrl(request.url);
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    console.log(`DELETE /api/follow-up/campaigns/${id} - workspaceId: ${workspaceId}`); // Log de entrada

    try {
        // (Lógica de verificação de permissão/workspace como antes)
        if (workspaceId) {
          const campaignBelongsToWorkspace = await prisma.workspaceFollowUpCampaign.findFirst({
            where: { workspace_id: workspaceId, campaign_id: id }
          });
          if (!campaignBelongsToWorkspace) {
            return NextResponse.json( { success: false, error: "Campanha não encontrada neste workspace" }, { status: 404 });
          }
        }

        const existingCampaign = await prisma.followUpCampaign.findUnique({
            where: { id },
            include: { follow_ups: { where: { status: { in: ['active', 'paused'] } } } }
        });

        if (!existingCampaign) {
            return NextResponse.json({ success: false, error: "Campanha não encontrada" }, { status: 404 });
        }

        // (Lógica para cancelar follow-ups ativos como antes)
         if (existingCampaign.follow_ups.length > 0) {
            console.log(`Cancelando ${existingCampaign.follow_ups.length} follow-ups ativos para a campanha ${id}`);
            await prisma.followUp.updateMany({
                where: { campaign_id: id, status: { in: ['active', 'paused'] } },
                data: { status: 'cancelled', completed_at: new Date() }
            });
        }

        // Usar transação para excluir campanha, stages, steps e associações
        await prisma.$transaction(async (tx) => {
            console.log(`Iniciando exclusão em transação para campanha ${id}`);

             // 1. Encontrar Stages associados
            const stagesToDelete = await tx.followUpFunnelStage.findMany({
                where: { campaign_id: id },
                select: { id: true }
            });
            const stageIdsToDelete = stagesToDelete.map(s => s.id);
            console.log(`Stages a serem afetados: ${stageIdsToDelete.join(', ')}`);

            if (stageIdsToDelete.length > 0) {
                // 2. Excluir Steps associados aos Stages
                const deletedStepsCount = await tx.followUpStep.deleteMany({
                    where: { funnel_stage_id: { in: stageIdsToDelete } }
                });
                console.log(`${deletedStepsCount.count} Steps excluídos.`);

                // 3. Excluir Stages
                const deletedStagesCount = await tx.followUpFunnelStage.deleteMany({
                    where: { id: { in: stageIdsToDelete } }
                });
                console.log(`${deletedStagesCount.count} Stages excluídos.`);
            } else {
                 console.log("Nenhum Stage associado encontrado.");
            }

            // 4. Excluir associações de workspace
            const deletedWCCount = await tx.workspaceFollowUpCampaign.deleteMany({
                where: { campaign_id: id }
            });
             console.log(`${deletedWCCount.count} associações com Workspaces excluídas.`);

            // 5. Excluir a Campanha
            await tx.followUpCampaign.delete({
                where: { id }
            });
            console.log(`Campanha ${id} excluída.`);
        });

        return NextResponse.json({
            success: true,
            message: "Campanha e seus dados relacionados foram excluídos com sucesso"
        });

    } catch (error) {
        console.error("Erro ao excluir campanha:", error);
        return NextResponse.json(
            { success: false, error: "Erro interno do servidor", details: error instanceof Error ? error.message : "Erro desconhecido" },
            { status: 500 }
        );
    }
}