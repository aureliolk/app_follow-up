// app/follow-up/campaigns/_components/StepEditModal.tsx
'use client';

import React, { useState, useEffect } from 'react';

interface Step {
  id?: string;
  stage_id: string;
  stage_name: string;
  template_name: string;
  wait_time: string;
  message: string;
  category?: string;
  auto_respond?: boolean;
}

interface FunnelStage {
  id: string;
  name: string;
  order: number;
  description?: string;
}

interface StepEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: Step | null;
  funnelStages: FunnelStage[];
  onSave: (step: Step) => Promise<boolean>;
  isLoading: boolean;
}

const StepEditModal: React.FC<StepEditModalProps> = ({
  isOpen,
  onClose,
  step,
  funnelStages,
  onSave,
  isLoading
}) => {
  const [editedStep, setEditedStep] = useState<Step>({
    stage_id: '',
    stage_name: '',
    template_name: '',
    wait_time: '30 minutos',
    message: '',
    category: 'Utility',
    auto_respond: true
  });

  // Atualizar o estado quando o step muda
  useEffect(() => {
    if (step) {
      setEditedStep({
        id: step.id,
        stage_id: step.stage_id,
        stage_name: step.stage_name,
        template_name: step.template_name || '',
        wait_time: step.wait_time || '30 minutos',
        message: step.message || '',
        category: step.category || 'Utility',
        auto_respond: step.auto_respond !== undefined ? step.auto_respond : true
      });
    }
  }, [step]);

  // Handler para mudança de etapa do funil
  const handleStageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const stageId = e.target.value;
    const stage = funnelStages.find(s => s.id === stageId);
    setEditedStep({
      ...editedStep,
      stage_id: stageId,
      stage_name: stage?.name || ''
    });
  };

  // Handler para mudança em campos do formulário
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditedStep({
      ...editedStep,
      [name]: value
    });
  };

  // Handler para checkbox
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setEditedStep({
      ...editedStep,
      [name]: checked
    });
  };

  // Handler para salvar
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editedStep.stage_id || !editedStep.template_name || !editedStep.wait_time || !editedStep.message) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    
    const success = await onSave(editedStep);
    if (success) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div 
        className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">
            {step?.id ? 'Editar Estágio' : 'Novo Estágio'}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Etapa do Funil *
              </label>
              <select
                name="stage_id"
                value={editedStep.stage_id}
                onChange={handleStageChange}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                required
              >
                <option value="">Selecione uma etapa</option>
                {funnelStages.map(stage => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Nome do Template *
              </label>
              <input
                type="text"
                name="template_name"
                value={editedStep.template_name}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="Ex: Email de Boas-vindas"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Tempo de Espera *
              </label>
              <input
                type="text"
                name="wait_time"
                value={editedStep.wait_time}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
                placeholder="Ex: 30 minutos, 2 horas, 1 dia"
                required
              />
              <p className="mt-1 text-xs text-gray-400">
                Formato: "30 minutos", "2 horas", "1 dia"
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Categoria
              </label>
              <select
                name="category"
                value={editedStep.category}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
              >
                <option value="Utility">Utilidade</option>
                <option value="Sales">Vendas</option>
                <option value="Marketing">Marketing</option>
                <option value="Support">Suporte</option>
                <option value="Onboarding">Onboarding</option>
              </select>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Mensagem *
            </label>
            <textarea
              name="message"
              value={editedStep.message}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
              placeholder="Digite a mensagem que será enviada neste estágio"
              rows={6}
              required
            />
          </div>

          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="auto_respond"
                checked={editedStep.auto_respond}
                onChange={handleCheckboxChange}
                className="mr-2 h-4 w-4 rounded bg-gray-700 border-gray-600"
              />
              <span className="text-sm text-gray-300">
                Responder automaticamente
              </span>
            </label>
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
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
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
              ) : 'Salvar Estágio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StepEditModal;