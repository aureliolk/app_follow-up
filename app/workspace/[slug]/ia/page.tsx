// app/workspace/[slug]/ia/page.tsx
import AISettingsForm from "./components/AISettingsForm";
import AiFollowUpRules from "./components/AiFollowUpRules";
import GoogleIntegrationsCard from "./components/GoogleIntegrationsCard";
import { prisma } from '@/lib/db'; // <<< Importar Prisma
import { WorkspaceAiFollowUpRule } from '@prisma/client'; // <<< Importar tipo Prisma
import { notFound } from 'next/navigation'; // <<< Importar notFound

// <<< Tornar async e aceitar params >>>
export default async function IaPage({ params }: { params: { slug: string } }) {
    
    // <<< Aguardar resolução de params e obter workspaceSlug >>>
    const resolvedParams = await params;
    const workspaceSlug = resolvedParams.slug;

    // <<< Buscar o Workspace pelo SLUG >>>
    const workspace = await prisma.workspace.findUnique({
        where: { slug: workspaceSlug },
        select: { id: true } // Selecionar apenas o ID que precisamos
    });

    // <<< Se não encontrar o workspace, retornar 404 >>>
    if (!workspace) {
        notFound();
    }

    const workspaceId = workspace.id; // <<< Usar o ID real do workspace

    // <<< Buscar as regras de follow-up >>>
    let followUpRules: WorkspaceAiFollowUpRule[] = [];
    let fetchError: string | null = null;
    try {
        followUpRules = await prisma.workspaceAiFollowUpRule.findMany({
            where: { workspace_id: workspaceId },
            orderBy: { delay_milliseconds: 'asc' }, 
        });
    } catch (error) {
        console.error(`[Page] Error fetching follow-up rules for workspace ${workspaceId}:`, error);
        fetchError = "Falha ao carregar as regras de acompanhamento.";
        // Dependendo do erro, você pode querer tratar de forma diferente
    }

    return (
        <div className="p-4 md:p-6 space-y-8"> {/* Adiciona espaçamento entre os cards */}
            {/* Título principal da página */}
            <h1 className="text-2xl font-bold text-foreground">
                Configurações e Integrações de IA
            </h1>

            {/* Card de Integrações Google */}
            <div>
                <GoogleIntegrationsCard />
            </div>

            {/* Card de Configurações Gerais da IA */}
            <div>
                {/* Não precisa de título extra aqui se AISettingsForm já tem um CardHeader */}
                <AISettingsForm />
            </div>

            {/* Card de Regras de Acompanhamento por Inatividade */}
            <div>
                 {/* Não precisa de título extra aqui se AiFollowUpRules já tem um CardHeader */}
                <AiFollowUpRules 
                    initialRules={followUpRules} 
                    workspaceId={workspaceId} 
                />
            </div>
        </div>
    )
}