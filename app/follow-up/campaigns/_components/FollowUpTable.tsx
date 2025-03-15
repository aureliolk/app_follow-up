// app/follow-up/_components/FollowUpTable.tsx
'use client';

import React from 'react';

export interface FollowUp {
  id: string;
  campaign_id: string;
  client_id: string;
  current_step: number;
  current_stage_id?: string;
  current_stage_name?: string;
  status: string;
  started_at: string;
  next_message_at: string | null;
  completed_at: string | null;
  is_responsive: boolean;
  campaign: {
    name: string;
  };
  messages: {
    id: string;
    follow_up_id: string;
    step: number;
    funnel_stage?: string;
    content: string;
    template_name?: string;
    category?: string;
    sent_at: string;
    delivered: boolean;
    delivered_at: string | null;
  }[];
}

interface FollowUpTableProps {
  followUps: FollowUp[];
  isLoading: boolean;
  activeTab: string;
  searchTerm: string;
  onSelect: (followUp: FollowUp) => void;
  onCancel: (id: string) => void;
  onRemoveClient: (clientId: string) => void;
}

export const FollowUpTable: React.FC<FollowUpTableProps> = ({
  followUps,
  isLoading,
  activeTab,
  searchTerm,
  onSelect,
  onCancel,
  onRemoveClient
}) => {
  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500 mb-2"></div>
        <p>Carregando follow-ups...</p>
      </div>
    );
  }

  if (followUps.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        {searchTerm 
          ? `Nenhum follow-up encontrado para "${searchTerm}"` 
          : activeTab === 'active'
          ? 'Não há follow-ups ativos no momento'
          : activeTab === 'paused'
          ? 'Não há follow-ups pausados no momento'
          : activeTab === 'completed'
          ? 'Não há follow-ups concluídos'
          : 'Não há follow-ups cancelados'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-600">
        <thead className="bg-gray-800">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Cliente</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Campanha</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Etapa</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-600">
          {followUps.map((followUp) => (
            <tr 
              key={followUp.id} 
              className="hover:bg-gray-650 cursor-pointer"
              onClick={() => onSelect(followUp)}
            >
              <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                {followUp.client_id}
                {followUp.is_responsive && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-700 text-white">
                    Responsivo
                  </span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                {followUp.campaign.name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                <div className="flex flex-col">
                  <span className="font-medium">{followUp.current_stage_name || 'Não definido'}</span>
                  <span className="text-xs text-gray-400">Etapa: {followUp.current_step + 1}</span>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                  followUp.status === 'active' ? 'bg-green-500 text-white' :
                  followUp.status === 'paused' ? 'bg-yellow-500 text-white' :
                  followUp.status === 'completed' ? 'bg-blue-500 text-white' :
                  'bg-red-500 text-white'
                }`}>
                  {followUp.status === 'active' ? 'Ativo' : 
                   followUp.status === 'paused' ? 'Pausado' : 
                   followUp.status === 'completed' ? 'Concluído' : 'Cancelado'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2">
                  {followUp.status === 'active' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancel(followUp.id);
                      }}
                      className="text-red-400 hover:text-red-300"
                    >
                      Cancelar
                    </button>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveClient(followUp.client_id);
                    }}
                    className="text-gray-400 hover:text-gray-300"
                  >
                    Remover Cliente
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};