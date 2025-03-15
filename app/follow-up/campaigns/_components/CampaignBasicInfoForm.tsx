// app/follow-up/_components/CampaignBasicInfoForm.tsx
'use client';

import React from 'react';

interface CampaignBasicInfoFormProps {
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEditing: boolean;
}

const CampaignBasicInfoForm: React.FC<CampaignBasicInfoFormProps> = ({
  name,
  setName,
  description,
  setDescription,
  isLoading,
  onSubmit,
  onCancel,
  isEditing
}) => {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Nome da Campanha *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
            placeholder="Ex: Campanha de Vendas"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Descrição
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
            placeholder="Descreva o objetivo desta campanha"
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          disabled={isLoading}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          disabled={isLoading}
        >
          {isLoading ? 'Salvando...' : (isEditing ? 'Atualizar' : 'Criar Campanha')}
        </button>
      </div>
    </form>
  );
};

export default CampaignBasicInfoForm;