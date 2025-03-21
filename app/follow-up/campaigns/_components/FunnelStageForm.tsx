// app/follow-up/_components/FunnelStageForm.tsx
'use client';

import React from 'react';

interface FunnelStage {
  id: string;
  name: string;
  order: number;
  description?: string;
}

interface FunnelStageFormProps {
  editingStage: FunnelStage | null;
  newStage: Omit<FunnelStage, 'id'>;
  setNewStage: React.Dispatch<React.SetStateAction<Omit<FunnelStage, 'id'>>>;
  onCancel: () => void;
  onSave: (e: React.MouseEvent) => void;
  isLoading: boolean;
}

const FunnelStageForm: React.FC<FunnelStageFormProps> = ({
  editingStage,
  newStage,
  setNewStage,
  onCancel,
  onSave,
  isLoading
}) => {
  return (
    <div className="bg-gray-700 p-4 rounded-lg mb-4">
      <h4 className="text-sm font-medium text-white mb-3">
        {editingStage ? 'Editar Etapa do Funil' : 'Adicionar Nova Etapa do Funil'}
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Nome da Etapa *
          </label>
          <input
            type="text"
            value={newStage.name}
            onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
            placeholder="Ex: Qualificação"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Ordem
          </label>
          <input
            type="number"
            value={newStage.order}
            onChange={(e) => setNewStage({ ...newStage, order: parseInt(e.target.value) })}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
            min="1"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Descrição
          </label>
          <textarea
            value={newStage.description || ''}
            onChange={(e) => setNewStage({ ...newStage, description: e.target.value })}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
            placeholder="Descreva o objetivo desta etapa do funil"
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isLoading}
          className={`px-4 py-2 ${editingStage ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'} text-white rounded-md transition-colors ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isLoading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {editingStage ? 'Salvando...' : 'Adicionando...'}
            </span>
          ) : (
            editingStage ? 'Salvar Alterações' : 'Adicionar Etapa'
          )}
        </button>
      </div>
    </div>
  );
};

export default FunnelStageForm;