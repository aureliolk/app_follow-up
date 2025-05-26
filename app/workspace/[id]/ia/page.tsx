// app/workspace/[slug]/ia/page.tsx
import AISettingsForm from "./components/AISettingsForm";
import AiFollowUpRules from "./components/AiFollowUpRules";
import GoogleIntegrationsCard from "../integrations/components/GoogleIntegrationsCard";
import AbandonedCartRules from "./components/AbandonedCartRules";
import { prisma } from '@/lib/db'; // <<< Importar Prisma
import { WorkspaceAiFollowUpRule, AbandonedCartRule } from '@prisma/client'; // <<< Importar tipos Prisma
import { notFound } from 'next/navigation'; // <<< Importar notFound
import AIStagesPage from "./stages/page";

// <<< Tornar async e aceitar params com id >>>
export default async function IaPage({ params }: { params: { id: string } }) {
    console.log("Rendering IaPage, Params:", params);

    // <<< Aguardar e extrair ID diretamente de params >>>
    const { id: workspaceId } = await params; // <<< Correção aqui >>>

    // <<< Verificar se workspaceId existe >>>
    if (!workspaceId) {
        console.error("ERRO: Workspace ID não encontrado nos parâmetros da URL.");
        notFound(); 
    }

    // <<< Buscar o Workspace pelo ID >>>
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }, // <<< Usar id
        select: { id: true } // Selecionar apenas o ID
    });

    // <<< Se não encontrar o workspace, retornar 404 >>>
    if (!workspace) {
        notFound();
    }

    // <<< Buscar as regras de follow-up e abandonadas >>>
    let followUpRules: WorkspaceAiFollowUpRule[] = [];
    let abandonedCartRules: AbandonedCartRule[] = [];
    let fetchError: string | null = null;
    try {
        [followUpRules, abandonedCartRules] = await Promise.all([
            prisma.workspaceAiFollowUpRule.findMany({
                where: { workspace_id: workspaceId },
                orderBy: { delay_milliseconds: 'asc' }, 
            }),
            prisma.abandonedCartRule.findMany({
                where: { workspace_id: workspaceId },
                orderBy: { sequenceOrder: 'asc' }, // Order by sequence
            })
        ]);
    } catch (error) {
        console.error(`[Page] Error fetching rules for workspace ${workspaceId}:`, error);
        fetchError = "Falha ao carregar as regras.";
        // Optionally, set both arrays to empty if one fails, or handle partial data
        followUpRules = [];
        abandonedCartRules = [];
    }

    // Optional: Display a generic fetch error message
    if (fetchError) {
        // You might want a more prominent error display
        console.warn("Fetch error message:", fetchError);
    }

    return (
        <div className="p-4 md:p-6 space-y-8"> {/* Adiciona espaçamento entre os cards */}
            {/* Título principal da página */}
            <h1 className="text-2xl font-bold text-foreground">
                Configurações e Integrações de IA
            </h1>

            {/* Display fetch error if present */}
            {fetchError && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-md text-sm">
                    {fetchError} Não foi possível carregar todas as configurações. Tente recarregar a página.
                </div>
            )}

            {/* Card de Configurações Gerais da IA */}
            <div>
                {/* Não precisa de título extra aqui se AISettingsForm já tem um CardHeader */}
                <AISettingsForm />
            </div>

            {/* Render Abandoned Cart Rules Component */}
            <div>
                <AbandonedCartRules
                    initialRules={abandonedCartRules}
                    workspaceId={workspaceId}
                />
            </div>

            {/* Card de Regras de Acompanhamento por Inatividade */}
            <div>
                 {/* Não precisa de título extra aqui se AiFollowUpRules já tem um CardHeader */}
                <AiFollowUpRules 
                    initialRules={followUpRules} 
                    workspaceId={workspaceId} 
                />
            </div>

            {/* Card de Estágios de IA */}
            <div>
                <AIStagesPage params={{ id: workspaceId }} />
            </div>
        </div>
    )
}