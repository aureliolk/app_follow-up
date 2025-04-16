// apps/next-app/app/workspace/[slug]/page.tsx
'use client';
import { useWorkspace } from '@/context/workspace-context';
import { ArrowUpRight, Users, BarChart2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
// Remover import do serviço, vamos usar o contexto
// import { followUpService } from '../../follow-up/_services/followUpService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// <<< IMPORTAR O CONTEXTO DE FOLLOW-UP >>>
import type { Campaign, ClientConversation } from '@/app/types'; // <<< Importar tipos se necessário

export default function WorkspaceDashboard() {
  const { workspace, isLoading: workspaceIsLoading } = useWorkspace(); // Renomear isLoading para evitar conflito
  // State for dashboard data (will be fetched locally)
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeConversations, setActiveConversations] = useState<ClientConversation[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true); // Start loading
  const [loadingConversations, setLoadingConversations] = useState(true); // Start loading
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [conversationsError, setConversationsError] = useState<string | null>(null);


  const dataError = campaignsError || conversationsError; // Combinar erros para exibição

  useEffect(() => {
    if (workspace?.id && !workspaceIsLoading) {
      console.log(`[WorkspaceDashboard] Workspace ID ${workspace.id} disponível. Buscando dados do dashboard...`);
      // TODO: Implement direct API calls to fetch campaigns and active conversations
      const fetchData = async () => {
        setLoadingCampaigns(true);
        setLoadingConversations(true);
        try {
          // Simulate API calls
          await new Promise(resolve => setTimeout(resolve, 500));
          setCampaigns([]); // Placeholder
          setActiveConversations([]); // Placeholder
          setCampaignsError(null);
          setConversationsError(null);
        } catch (error: any) {
          const msg = error.message || "Erro ao buscar dados";
          setCampaignsError(msg);
          setConversationsError(msg);
        } finally {
          setLoadingCampaigns(false);
          setLoadingConversations(false);
        }
      };
      fetchData();
    }
  }, [workspace?.id, workspaceIsLoading]); // Removed context fetch functions from dependencies

  // Loading inicial do WORKSPACE
  if (workspaceIsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner message="Carregando workspace..." />
      </div>
    );
  }

  if (!workspace) {
     // Pode acontecer se houver erro no contexto do workspace
     // Ou se o slug for inválido
     return <div className="container mx-auto text-center py-10 text-destructive">Workspace não encontrado ou erro ao carregar.</div>;
  }

  // <<< ADICIONAR VERIFICAÇÃO DE LOADING DOS DADOS >>>
  if (loadingCampaigns || loadingConversations) {
    return (
      <div className="flex items-center justify-center h-full">
        {/* Pode usar a mesma mensagem ou uma diferente */}
        <LoadingSpinner message="Carregando dados do dashboard..." />
      </div>
    );
  }

  // Tratamento de erro combinado dos dados
  if (dataError) {
      return <div className="container mx-auto text-center py-10 text-destructive">Erro ao carregar dados: {dataError}</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-8">
      <h1 className="text-3xl font-bold text-foreground">
        Bem-vindo ao {workspace.name}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Follow-ups Ativos */}
        <Card className="border-border rounded-xl shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Follow-ups Ativos</CardTitle>
            <BarChart2 className="text-primary h-5 w-5" />
          </CardHeader>
          <CardContent>
            {/* <<< USAR loadingFollowUps DIRETAMENTE >>> */}
            {loadingConversations ? (
              <LoadingSpinner size="small" message="" />
            ) : activeConversations.length > 0 ? (
              <div>
                {/* <<< USAR followUps do contexto >>> */}
                <p className="text-2xl font-bold text-foreground mb-2">{activeConversations.length}</p>
                <Link
                  href={`/workspace/${workspace.id}/conversations`} // Link para a página de conversas
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Ver conversas <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhum follow-up ativo.</p>
            )}
          </CardContent>
        </Card>

        {/* Card Campanhas */}
        <Card className="border-border rounded-xl shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Campanhas</CardTitle>
            <BarChart2 className="text-primary h-5 w-5" />
          </CardHeader>
          <CardContent>
            {/* <<< USAR loadingCampaigns DIRETAMENTE >>> */}
            {loadingCampaigns ? (
              <LoadingSpinner size="small" message="" />
            ) : campaigns.length > 0 ? (
              <div>
                 {/* <<< USAR campaigns do contexto >>> */}
                <p className="text-2xl font-bold text-foreground mb-2">{campaigns.length}</p>
                <Link
                  href={`/workspace/${workspace.id}/campaigns`} // Ajustar link se necessário
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Gerenciar campanhas <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-muted-foreground text-sm mb-3">Nenhuma campanha encontrada.</p>
                <Link
                  href={`/workspace/${workspace.id}/campaigns/new`} // Ajustar link se necessário
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Criar campanha <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card Equipe */}
        <Card className="border-border rounded-xl shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Equipe</CardTitle>
            <Users className="text-primary h-5 w-5" />
          </CardHeader>
          <CardContent>
            {/* A contagem de membros vem do contexto do workspace, manter como está */}
            {workspace._count?.members ? (
              <div>
                <p className="text-2xl font-bold text-foreground mb-2">
                  {workspace._count.members} {workspace._count.members === 1 ? 'membro' : 'membros'}
                </p>
                <Link
                  href={`/workspace/${workspace.id}/members`}
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Gerenciar membros <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-muted-foreground text-sm mb-3">Apenas você no workspace.</p>
                <Link
                  href={`/workspace/${workspace.id}/members`}
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Convidar membros <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}