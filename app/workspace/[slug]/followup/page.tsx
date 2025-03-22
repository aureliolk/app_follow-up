'use client';

import { useState, useEffect } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import followUpService from '@/app/follow-up/_services/followUpService';
import { Loader2, PlusCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function WorkspaceFollowUp() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const [followUps, setFollowUps] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (workspace) {
      loadData();
    }
  }, [workspace]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      // Carregar follow-ups e campanhas em paralelo
      const [followUpsData, campaignsData] = await Promise.all([
        followUpService.getFollowUps(undefined, workspace?.id),
        followUpService.getCampaigns(workspace?.id)
      ]);
      
      setFollowUps(followUpsData);
      setCampaigns(campaignsData);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Falha ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  if (workspaceLoading || isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-[#F54900]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-white">Follow-ups</h1>
        
        <div className="flex gap-2">
          <button 
            onClick={loadData}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#222222] text-white rounded-md hover:bg-[#333333] transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Atualizar</span>
          </button>
          
          <Link
            href="/follow-up/campaigns"
            className="flex items-center gap-1 px-3 py-1.5 bg-[#F54900] text-white rounded-md hover:bg-[#FF6922] transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Novo Follow-up</span>
          </Link>
        </div>
      </div>
      
      {error ? (
        <div className="p-4 bg-red-500/20 text-red-200 rounded-md">
          {error}
        </div>
      ) : followUps.length === 0 ? (
        <div className="p-8 bg-[#111111] rounded-lg border border-[#333333] text-center">
          <p className="text-gray-400 mb-4">Nenhum follow-up encontrado para este workspace.</p>
          <Link
            href="/follow-up/campaigns"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#F54900] text-white rounded-md hover:bg-[#FF6922] transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Iniciar seu primeiro follow-up</span>
          </Link>
        </div>
      ) : (
        <div className="bg-[#111111] rounded-lg border border-[#333333] overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Campanha</th>
                <th className="px-4 py-3">Estágio</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Atualizado</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333333]">
              {followUps.map((followUp) => (
                <tr key={followUp.id} className="hover:bg-[#1a1a1a]">
                  <td className="px-4 py-3">{followUp.client_id}</td>
                  <td className="px-4 py-3">{followUp.campaign?.name || '-'}</td>
                  <td className="px-4 py-3">{followUp.current_stage_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      followUp.status === 'active' ? 'bg-green-900/30 text-green-300' :
                      followUp.status === 'paused' ? 'bg-yellow-900/30 text-yellow-300' : 
                      'bg-red-900/30 text-red-300'
                    }`}>
                      {followUp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(followUp.updated_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link 
                      href={`/follow-up?id=${followUp.id}`}
                      className="text-[#F54900] hover:text-[#FF6922]"
                    >
                      Detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Campanhas disponíveis */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-white mb-4">Campanhas Disponíveis</h2>
        
        {campaigns.length === 0 ? (
          <div className="p-6 bg-[#111111] rounded-lg border border-[#333333] text-center">
            <p className="text-gray-400 mb-4">Nenhuma campanha disponível neste workspace.</p>
            <Link
              href="/follow-up/campaigns/new"
              className="inline-flex items-center gap-1 px-4 py-2 bg-[#F54900] text-white rounded-md hover:bg-[#FF6922] transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Criar nova campanha</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="bg-[#111111] rounded-lg border border-[#333333] p-4 hover:bg-[#1a1a1a] transition-colors">
                <h3 className="font-medium text-lg mb-1">{campaign.name}</h3>
                <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                  {campaign.description || 'Sem descrição'}
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">
                    {campaign.stepsCount || 0} {campaign.stepsCount === 1 ? 'passo' : 'passos'}
                  </span>
                  <Link
                    href={`/follow-up/campaigns/${campaign.id}`}
                    className="text-[#F54900] text-sm hover:text-[#FF6922]"
                  >
                    Ver detalhes
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}