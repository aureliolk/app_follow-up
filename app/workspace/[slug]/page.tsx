'use client';
import { useWorkspace } from '@/context/workspace-context';
import { Loader2, ArrowUpRight, Users, BarChart2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { followUpService } from '@/app/follow-up/_services/followUpService';

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
        <Loader2 className="h-8 w-8 animate-spin text-[#F54900]" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4 text-white">Bem-vindo ao {workspace.name}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Follow-ups Ativos */}
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-white">Follow-ups Ativos</h2>
            <BarChart2 className="text-[#F54900] h-5 w-5" />
          </div>
          
          {loadingData ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : followUps.length > 0 ? (
            <div>
              <p className="text-2xl font-bold text-white mb-2">{followUps.length}</p>
              <Link 
                href="/follow-up" 
                className="text-[#F54900] text-sm flex items-center hover:underline"
              >
                Ver todos <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Nenhum follow-up ativo.</p>
          )}
        </div>
        
        {/* Card Campanhas */}
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-white">Campanhas</h2>
            <BarChart2 className="text-[#F54900] h-5 w-5" />
          </div>
          
          {loadingData ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : campaigns.length > 0 ? (
            <div>
              <p className="text-2xl font-bold text-white mb-2">{campaigns.length}</p>
              <Link 
                href="/follow-up/campaigns" 
                className="text-[#F54900] text-sm flex items-center hover:underline"
              >
                Gerenciar campanhas <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div>
              <p className="text-gray-400 text-sm mb-3">Nenhuma campanha encontrada.</p>
              <Link 
                href="/follow-up/campaigns" 
                className="text-[#F54900] text-sm flex items-center hover:underline"
              >
                Criar campanha <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
        
        {/* Card Equipe */}
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-white">Equipe</h2>
            <Users className="text-[#F54900] h-5 w-5" />
          </div>
          
          {workspace._count?.members ? (
            <div>
              <p className="text-2xl font-bold text-white mb-2">
                {workspace._count.members} {workspace._count.members === 1 ? 'membro' : 'membros'}
              </p>
              <Link 
                href={`/workspace/${workspace.slug}/members`} 
                className="text-[#F54900] text-sm flex items-center hover:underline"
              >
                Gerenciar membros <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div>
              <p className="text-gray-400 text-sm mb-3">Apenas você no workspace.</p>
              <Link 
                href={`/workspace/${workspace.slug}/members`} 
                className="text-[#F54900] text-sm flex items-center hover:underline"
              >
                Convidar membros <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}