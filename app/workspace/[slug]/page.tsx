'use client';
import { useWorkspace } from '@/context/workspace-context';
import { ArrowUpRight, Users, BarChart2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { followUpService } from '@/app/follow-up/_services/followUpService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function WorkspaceDashboard() {
  const { workspace, isLoading } = useWorkspace();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function loadWorkspaceData() {
      if (!workspace) return;
      
      try {
        setLoadingData(true);
        
        // Carregar campanhas do workspace
        const workspaceCampaigns = await followUpService.getCampaigns(workspace.id);
        setCampaigns(workspaceCampaigns);
        
        // Carregar follow-ups ativos do workspace
        const activeFollowUps = await followUpService.getFollowUps('active', workspace.id);
        setFollowUps(activeFollowUps);
      } catch (error) {
        console.error('Erro ao carregar dados do workspace:', error);
      } finally {
        setLoadingData(false);
      }
    }
    
    loadWorkspaceData();
  }, [workspace]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner message="Carregando workspace..." />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-foreground">
        Bem-vindo ao {workspace.name}
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Follow-ups Ativos */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Follow-ups Ativos</CardTitle>
            <BarChart2 className="text-primary h-5 w-5" />
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <LoadingSpinner size="small" message="" />
            ) : followUps.length > 0 ? (
              <div>
                <p className="text-2xl font-bold text-foreground mb-2">{followUps.length}</p>
                <Link 
                  href="/follow-up" 
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Ver todos <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhum follow-up ativo.</p>
            )}
          </CardContent>
        </Card>
        
        {/* Card Campanhas */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Campanhas</CardTitle>
            <BarChart2 className="text-primary h-5 w-5" />
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <LoadingSpinner size="small" message="" />
            ) : campaigns.length > 0 ? (
              <div>
                <p className="text-2xl font-bold text-foreground mb-2">{campaigns.length}</p>
                <Link 
                  href="/follow-up/campaigns" 
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Gerenciar campanhas <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-muted-foreground text-sm mb-3">Nenhuma campanha encontrada.</p>
                <Link 
                  href="/follow-up/campaigns" 
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Criar campanha <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Card Equipe */}
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Equipe</CardTitle>
            <Users className="text-primary h-5 w-5" />
          </CardHeader>
          <CardContent>
            {workspace._count?.members ? (
              <div>
                <p className="text-2xl font-bold text-foreground mb-2">
                  {workspace._count.members} {workspace._count.members === 1 ? 'membro' : 'membros'}
                </p>
                <Link 
                  href={`/workspace/${workspace.slug}/members`} 
                  className="text-primary text-sm flex items-center hover:underline"
                >
                  Gerenciar membros <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-muted-foreground text-sm mb-3">Apenas você no workspace.</p>
                <Link 
                  href={`/workspace/${workspace.slug}/members`} 
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