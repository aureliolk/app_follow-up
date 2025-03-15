// app/follow-up/_components/FunnelStageList.tsx
'use client';

import React from 'react';

interface FunnelStage {
  id: string;
  name: string;
  order: number;
  description?: string;
}

interface FunnelStageListProps {
  stages: FunnelStage[];
  onEdit: (stage: FunnelStage) => void;
  onRemove: (stageId: string) => void;
}

const FunnelStageList: React.FC<FunnelStageListProps> = ({ 
  stages, 
  onEdit, 
  onRemove 
}) => {
  return (
    <div className="bg-gray-700 rounded-lg overflow-hidden mb-6">
      <table className="min-w-full divide-y divide-gray-600">
        <thead className="bg-gray-800">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ordem</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Nome</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Descrição</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Ações</th>
          </tr>
        </thead>
        <tbody className="bg-gray-700 divide-y divide-gray-600">
          {stages.length > 0 ? (
            stages.map((stage) => (
              <tr key={stage.id} className="hover:bg-gray-650 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{stage.order}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{stage.name}</td>
                <td className="px-6 py-4 text-sm text-gray-300">{stage.description || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEdit(stage);
                    }}
                    className="text-blue-400 hover:text-blue-300 mx-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemove(stage.id);
                    }}
                    className="text-red-400 hover:text-red-300 mx-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="px-6 py-4 text-center text-gray-400">
                Nenhuma etapa de funil cadastrada
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default FunnelStageList;