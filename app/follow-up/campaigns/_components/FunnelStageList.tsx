// app/follow-up/campaigns/_components/FunnelStageList.tsx
'use client';

import React, { useState } from 'react';
import { FunnelStage } from '@/app/follow-up/_types/schema';
import { FunnelStageFormComponent } from './index';

interface FunnelStageListProps {
  stages: FunnelStage[];
  onEdit?: (stage: FunnelStage) => void;
  onRemove?: (stageId: string) => Promise<boolean>;
  campaignId?: string;
  refreshStages?: () => void;
}

const FunnelStageList: React.FC<FunnelStageListProps> = ({
  stages,
  onEdit,
  onRemove,
  campaignId,
  refreshStages
}) => {
  const [editingStage, setEditingStage] = useState<FunnelStage | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  const handleEdit = (stage: FunnelStage) => {
    if (onEdit) {
      onEdit(stage);
    } else {
      setEditingStage(stage);
      setShowEditForm(true);
    }
  };

  const handleRemove = async (stage: FunnelStage) => {
    if (!stage.id) {
      console.error('Tentativa de remover estágio sem ID');
      return;
    }

    // Confirmar antes de excluir
    if (!confirm(`Deseja realmente excluir a etapa "${stage.name}"?`)) {
      return;
    }

    try {
      if (onRemove) {
        const success = await onRemove(stage.id);
        
        if (success && refreshStages) {
          refreshStages();
        }
      }
    } catch (error) {
      console.error('Erro ao excluir etapa:', error);
      alert('Ocorreu um erro ao excluir a etapa');
    }
  };

  return (
    <div className="bg-gray-700 rounded-lg mb-4">
      {showEditForm && (
        <FunnelStageFormComponent
          campaignId={campaignId}
          editingStage={editingStage}
          onStageAdded={() => {
            setShowEditForm(false);
            setEditingStage(null);
            if (refreshStages) refreshStages();
          }}
          onCancel={() => {
            setShowEditForm(false);
            setEditingStage(null);
          }}
        />
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-600">
          <thead className="bg-gray-800">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ordem</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-400">Nome</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-400">Descrição</th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {stages.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-2 text-center text-gray-400">
                  Nenhuma etapa encontrada
                </td>
              </tr>
            ) : (
              stages.map((stage) => (
                <tr key={stage.id} className="hover:bg-gray-600/30">
                  <td className="px-4 py-2 text-sm font-medium text-white">
                    {stage.order}
                  </td>
                  <td className="px-4 py-2 text-sm text-white">
                    {stage.name}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-300">
                    {stage.description || '-'}
                  </td>
                  <td className="px-4 py-2 text-sm flex space-x-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(stage)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(stage)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FunnelStageList;