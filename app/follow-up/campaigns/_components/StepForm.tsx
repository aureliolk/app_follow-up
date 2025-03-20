// app/follow-up/_components/StepForm.tsx
'use client';

import React from 'react';

interface FunnelStage {
  id: string;
  name: string;
  order: number;
  description?: string;
}

interface Step {
  id?: string;
  stage_id: string;
  stage_name: string;
  template_name: string;
  wait_time: string;
  message: string;
  category?: string;
}

interface StepFormProps {
  newStep: Step;
  setNewStep: React.Dispatch<React.SetStateAction<Step>>;
  funnelStages: FunnelStage[];
  isEditing: boolean;
  onCancel: () => void;
  onSave: (e: React.MouseEvent) => void;
  isLoading: boolean;
  selectedStage?: string; // ID da etapa pré-selecionada (opcional)
}

const StepForm: React.FC<StepFormProps> = ({
  newStep,
  setNewStep,
  funnelStages,
  isEditing,
  onCancel,
  onSave,
  isLoading,
  selectedStage
}) => {
  console.log('New Step', newStep)
  // Se temos um estágio pré-selecionado e não estamos editando, atualizar newStep
  React.useEffect(() => {
    if (selectedStage && !isEditing && !newStep.stage_id) {
      const stage = funnelStages.find(s => s.id === selectedStage);
      if (stage) {
        setNewStep(prev => ({
          ...prev,
          stage_id: selectedStage,
          stage_name: stage.name
        }));
      }
    }
  }, [selectedStage, isEditing, newStep.stage_id, funnelStages, setNewStep]);
  return (
    <div id="step-form" className="bg-gray-700 p-4 rounded-lg">
      <h4 className="text-sm font-medium text-white mb-3">
        {isEditing ? 'Editar Estágio' : 'Adicionar Novo Estágio'}
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Etapa do Funil *
          </label>
          <select
            value={newStep.stage_id}
            onChange={(e) => setNewStep({ 
              ...newStep, 
              stage_id: e.target.value,
              stage_name: funnelStages.find(s => s.id === e.target.value)?.name || ''
            })}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
            required
          >
            <option value="">Selecione um estágio</option>
            {funnelStages.map(stage => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Nome do Template *
          </label>
          <input
            type="text"
            value={newStep.template_name}
            onChange={(e) => setNewStep({ ...newStep, template_name: e.target.value })}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
            placeholder="Ex: qualificacao_1h"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Tempo de Espera *
          </label>
          <div className="flex flex-col space-y-2">
            <input
              type="text"
              value={newStep.wait_time}
              onChange={(e) => setNewStep({ ...newStep, wait_time: e.target.value })}
              className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
              placeholder="Ex: 30 minutos, 1 hora, 1 dia"
              required
            />
            <div className="text-xs text-gray-400 flex flex-wrap gap-2">
              <span 
                className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                onClick={() => setNewStep({ ...newStep, wait_time: "30 minutos" })}
              >
                30 min
              </span>
              <span 
                className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                onClick={() => setNewStep({ ...newStep, wait_time: "1 hora" })}
              >
                1h
              </span>
              <span 
                className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                onClick={() => setNewStep({ ...newStep, wait_time: "6 horas" })}
              >
                6h
              </span>
              <span 
                className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                onClick={() => setNewStep({ ...newStep, wait_time: "12 horas" })}
              >
                12h
              </span>
              <span 
                className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                onClick={() => setNewStep({ ...newStep, wait_time: "24 horas" })}
              >
                24h
              </span>
              <span 
                className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                onClick={() => setNewStep({ ...newStep, wait_time: "48 horas" })}
              >
                48h
              </span>
              <span 
                className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                onClick={() => setNewStep({ ...newStep, wait_time: "3 dias" })}
              >
                3 dias
              </span>
              <span 
                className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                onClick={() => setNewStep({ ...newStep, wait_time: "7 dias" })}
              >
                7 dias
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Categoria
          </label>
          <select
            value={newStep.category || 'Utility'}
            onChange={(e) => setNewStep({ ...newStep, category: e.target.value })}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
          >
            <option value="Utility">Utilitário</option>
            <option value="Marketing">Marketing</option>
            <option value="Onboarding">Onboarding</option>
            <option value="Support">Suporte</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Mensagem *
          </label>
          <textarea
            value={newStep.message}
            onChange={(e) => setNewStep({ ...newStep, message: e.target.value })}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
            placeholder="Digite o conteúdo da mensagem..."
            rows={4}
            required
          />
        </div>

      </div>

      <div className="flex justify-end space-x-3">
        {isEditing && (
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
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={isLoading}
          className={`px-4 py-2 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
            } text-white rounded-md transition-colors ${isLoading ? 'opacity-70 cursor-not-allowed' : ''
            }`}
        >
          {isLoading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {isEditing ? 'Salvando...' : 'Adicionando...'}
            </span>
          ) : (
            isEditing ? 'Salvar Alterações' : 'Adicionar Estágio'
          )}
        </button>
      </div>
    </div>
  );
};

export default StepForm;