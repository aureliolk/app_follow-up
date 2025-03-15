// app/follow-up/_components/NewFollowUpForm.tsx
'use client';

import React, { useState } from 'react';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  active: boolean;
  stepsCount: number;
  activeFollowUps: number;
}

interface NewFollowUpFormProps {
  campaigns: Campaign[];
  isLoading: boolean;
  onSubmit: (clientId: string, campaignId: string) => void;
}

export const NewFollowUpForm: React.FC<NewFollowUpFormProps> = ({
  campaigns,
  isLoading,
  onSubmit
}) => {
  const [clientId, setClientId] = useState('');
  const [campaignId, setCampaignId] = useState('');

  const handleSubmit = () => {
    onSubmit(clientId, campaignId);
  };

  return (
    <div className="bg-gray-700 rounded-lg p-4 mb-6">
      <h2 className="text-lg font-medium text-white mb-4">Novo Follow-up</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            ID do Cliente
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md"
            placeholder="Ex: cliente123"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Campanha
          </label>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md"
          >
            <option value="">Selecione uma campanha</option>
            {campaigns.map(campaign => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
          disabled={isLoading}
        >
          {isLoading ? 'Criando...' : 'Criar Follow-up'}
        </button>
      </div>
    </div>
  );
};