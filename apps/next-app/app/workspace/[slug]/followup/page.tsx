'use client';

import { useWorkspace } from '../../../../../../apps/next-app/context/workspace-context';
import { useEffect, useState } from 'react';
import { followUpService } from '../../../../../../apps/next-app/app/follow-up/_services/followUpService';
import { Loader2, ArrowUpRight, Filter, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function WorkspaceFollowUp() {
  const { workspace, isLoading } = useWorkspace();
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const router = useRouter();

  // useEffect(() => {
  //   async function loadFollowUpData() {
  //     if (!workspace) return;
      
  //     try {
  //       setLoadingData(true);
        
  //       // Carregar follow-ups do workspace
  //       const workspaceFollowUps = await followUpService.getFollowUps(undefined, workspace.id);
  //       setFollowUps(workspaceFollowUps);
        
  //       // Carregar campanhas do workspace
  //       const workspaceCampaigns = await followUpService.getCampaigns(workspace.id);
  //       setCampaigns(workspaceCampaigns);
  //     } catch (error) {
  //       console.error('Erro ao carregar dados de follow-up:', error);
  //     } finally {
  //       setLoadingData(false);
  //     }
  //   }
    
  //   loadFollowUpData();
  // }, [workspace]);

  // Função para navegar para página de criação de novos follow-ups
  const handleNewFollowUp = () => {
    // Armazenar workspaceId na sessionStorage antes de navegar
    if (workspace) {
      sessionStorage.setItem('activeWorkspaceId', workspace.id);
      router.push('/follow-up');
    }
  };

  if (isLoading || loadingData) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-[#F54900]" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-white">Follow-ups do Workspace</h1>
        
        <div className="flex gap-2">
          <button
            onClick={handleNewFollowUp}
            className="flex items-center gap-1 px-4 py-2 rounded-md bg-[#F54900] text-white hover:bg-[#d43d00] transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Novo Follow-up</span>
          </button>
        </div>
      </div>
      
      {/* Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Total de Follow-ups</h3>
          <p className="text-2xl font-bold text-white">{followUps.length}</p>
        </div>
        
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Follow-ups Ativos</h3>
          <p className="text-2xl font-bold text-white">{followUps.filter(f => f.status === 'active').length}</p>
        </div>
        
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Campanhas</h3>
          <p className="text-2xl font-bold text-white">{campaigns.length}</p>
        </div>
        
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Campanhas Ativas</h3>
          <p className="text-2xl font-bold text-white">{campaigns.filter(c => c.active).length}</p>
        </div>
      </div>
      
      {/* Lista de Follow-ups */}
      <div className="bg-[#111111] border border-[#333333] rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[#333333] flex justify-between items-center">
          <h2 className="font-medium text-white">Follow-ups Recentes</h2>
          <button className="text-gray-400 hover:text-white flex items-center gap-1 text-sm">
            <Filter className="h-4 w-4" />
            <span>Filtrar</span>
          </button>
        </div>
        
        <div className="overflow-x-auto">
          {followUps.length > 0 ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-[#0a0a0a]">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Campanha</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Estágio</th>
                  <th className="px-4 py-3">Início</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {followUps.slice(0, 5).map((followUp) => (
                  <tr key={followUp.id} className="border-b border-[#333333] hover:bg-[#1a1a1a]">
                    <td className="px-4 py-3 text-white">{followUp.client_id}</td>
                    <td className="px-4 py-3 text-white">{followUp.campaign?.name || 'N/A'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        followUp.status === 'active' ? 'bg-green-900 text-green-300' :
                        followUp.status === 'paused' ? 'bg-yellow-900 text-yellow-300' :
                        followUp.status === 'completed' ? 'bg-blue-900 text-blue-300' :
                        'bg-red-900 text-red-300'
                      }`}>
                        {followUp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{followUp.current_stage_name || 'N/A'}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {new Date(followUp.started_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link 
                        href={`/follow-up?id=${followUp.id}`}
                        className="text-[#F54900] hover:underline"
                      >
                        Detalhes
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-gray-400">
              <p>Nenhum follow-up encontrado para este workspace.</p>
              <button
                onClick={handleNewFollowUp}
                className="mt-2 text-[#F54900] hover:underline"
              >
                Criar o primeiro follow-up
              </button>
            </div>
          )}
        </div>
        
        {followUps.length > 5 && (
          <div className="p-4 border-t border-[#333333] text-center">
            <Link 
              href="/follow-up"
              className="text-[#F54900] text-sm flex items-center justify-center hover:underline"
              onClick={() => sessionStorage.setItem('activeWorkspaceId', workspace.id)}
            >
              Ver todos os follow-ups <ArrowUpRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
      
      {/* Lista de Campanhas */}
      <div className="mt-6 bg-[#111111] border border-[#333333] rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[#333333]">
          <h2 className="font-medium text-white">Campanhas</h2>
        </div>
        
        <div className="overflow-x-auto">
          {campaigns.length > 0 ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-[#0a0a0a]">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Follow-ups Ativos</th>
                  <th className="px-4 py-3">Etapas</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 3).map((campaign) => (
                  <tr key={campaign.id} className="border-b border-[#333333] hover:bg-[#1a1a1a]">
                    <td className="px-4 py-3 text-white">{campaign.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        campaign.active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                      }`}>
                        {campaign.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{campaign.activeFollowUps || 0}</td>
                    <td className="px-4 py-3 text-gray-300">{campaign.stepsCount || 0}</td>
                    <td className="px-4 py-3">
                      <Link 
                        href={`/follow-up/campaigns/${campaign.id}`}
                        className="text-[#F54900] hover:underline"
                        onClick={() => sessionStorage.setItem('activeWorkspaceId', workspace.id)}
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-gray-400">
              <p>Nenhuma campanha encontrada para este workspace.</p>
              <Link 
                href="/follow-up/campaigns"
                className="mt-2 text-[#F54900] hover:underline inline-block"
                onClick={() => sessionStorage.setItem('activeWorkspaceId', workspace.id)}
              >
                Criar a primeira campanha
              </Link>
            </div>
          )}
        </div>
        
        {campaigns.length > 3 && (
          <div className="p-4 border-t border-[#333333] text-center">
            <Link 
              href="/follow-up/campaigns"
              className="text-[#F54900] text-sm flex items-center justify-center hover:underline"
              onClick={() => sessionStorage.setItem('activeWorkspaceId', workspace.id)}
            >
              Ver todas as campanhas <ArrowUpRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}