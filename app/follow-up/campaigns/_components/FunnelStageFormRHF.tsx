// /app/follow-up/campaigns/_components/FunnelStageFormRHF.tsx
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { funnelStageSchema, FunnelStage } from '@/app/follow-up/_types/schema';

interface FunnelStageFormProps {
  defaultValues?: Partial<FunnelStage>;
  onSubmit: (data: FunnelStage) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  isEditing: boolean;
}

const FunnelStageFormRHF: React.FC<FunnelStageFormProps> = ({
  defaultValues = { name: '', description: '', order: 1 },
  onSubmit,
  onCancel,
  isLoading,
  isEditing
}) => {
  const { 
    register, 
    handleSubmit, 
    formState: { errors } 
  } = useForm<FunnelStage>({
    resolver: zodResolver(funnelStageSchema),
    defaultValues
  });

  const onSubmitHandler = handleSubmit(async (data) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Erro ao enviar formulário:', error);
    }
  });

  return (
    <form onSubmit={onSubmitHandler} className="bg-gray-700 p-4 rounded-lg mb-4">
      <h4 className="text-sm font-medium text-white mb-3">
        {isEditing ? 'Editar Etapa do Funil' : 'Adicionar Nova Etapa do Funil'}
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Nome da Etapa *
          </label>
          <input
            {...register('name')}
            className={`w-full px-3 py-2 bg-gray-600 text-white rounded-md border ${
              errors.name ? 'border-red-500' : 'border-gray-500'
            }`}
            placeholder="Ex: Qualificação"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Ordem
          </label>
          <input
            type="number"
            {...register('order', { valueAsNumber: true })}
            className={`w-full px-3 py-2 bg-gray-600 text-white rounded-md border ${
              errors.order ? 'border-red-500' : 'border-gray-500'
            }`}
            min="1"
          />
          {errors.order && (
            <p className="mt-1 text-xs text-red-500">{errors.order.message}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Descrição
          </label>
          <textarea
            {...register('description')}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
            placeholder="Descreva o objetivo desta etapa do funil"
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className={`px-4 py-2 ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
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
            isEditing ? 'Salvar Alterações' : 'Adicionar Etapa'
          )}
        </button>
      </div>
    </form>
  );
};

export default FunnelStageFormRHF;