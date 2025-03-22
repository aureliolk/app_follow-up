// app/follow-up/campaigns/_components/FunnelStageEditModal.tsx
'use client';

import React, { useState, useEffect } from 'react';

interface FunnelStage {
  id?: string;
  name: string;
  order: number;
  description?: string;
}

interface FunnelStageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  stage: FunnelStage | null;
  onSave: (stage: FunnelStage) => Promise<boolean>;
  isLoading: boolean;
  isEditing: boolean;
}

const FunnelStageEditModal: React.FC<FunnelStageEditModalProps> = ({
  isOpen,
  onClose,
  stage,
  onSave,
  isLoading,
  isEditing
}) => {
  const [editedStage, setEditedStage] = useState<FunnelStage>({
    name: '',
    order: 0,
    description: ''
  });

  // Atualizar o estado quando o stage muda
  useEffect(() => {
    if (stage) {
      setEditedStage({
        id: stage.id,
        name: stage.name,
        order: stage.order,
        description: stage.description || ''
      });
    }
  }, [stage]);

  // Handler para mudança em campos do formulário
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedStage({
      ...editedStage,
      [name]: value
    });
  };

  // Handler para salvar
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editedStage.name) {
      alert('Por favor, preencha o nome da etapa.');
      return;
    }
    
    const success = await onSave(editedStage);
    if (success) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div 
        className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">
            {isEditing ? 'Editar Etapa do Funil' : 'Nova Etapa do Funil'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6">
          <div className="grid grid-cols-1 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Nome da Etapa *
              </label>
              <input
                type="text"
                name="name"
                value={editedStage.name}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="Ex: Qualificação"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Ordem
              </label>
              <input
                type="number"
                name="order"
                value={editedStage.order}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="Ex: 1, 2, 3..."
                min="0"
              />
              <p className="mt-1 text-xs text-gray-400">
                Determine a ordem em que esta etapa aparece no funil
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Descrição
              </label>
              <textarea
                name="description"
                value={editedStage.description}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="Descreva esta etapa do funil"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors flex items-center"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Salvando...
                </>
              ) : isEditing ? 'Salvar Alterações' : 'Adicionar Etapa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FunnelStageEditModal;