// /app/follow-up/campaigns/_components/StepFormRHF.tsx
'use client';

import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { funnelStepSchema, FunnelStep, FunnelStage } from '@/app/follow-up/_types/schema';

interface StepFormProps {
  defaultValues?: Partial<FunnelStep>;
  funnelStages: FunnelStage[];
  isEditing: boolean;
  onCancel: () => void;
  onSubmit: (data: FunnelStep) => Promise<void>;
  isLoading: boolean;
  selectedStage?: string; // ID da etapa pré-selecionada (opcional)
}

const StepFormRHF: React.FC<StepFormProps> = ({
  defaultValues = {
    stage_id: '',
    stage_name: '',
    template_name: '',
    wait_time: '30 minutos',
    message: '',
    category: 'Utility',
    auto_respond: true
  },
  funnelStages,
  isEditing,
  onCancel,
  onSubmit,
  isLoading,
  selectedStage
}) => {
  const { 
    register, 
    handleSubmit, 
    setValue,
    watch,
    control,
    formState: { errors } 
  } = useForm<FunnelStep>({
    resolver: zodResolver(funnelStepSchema),
    defaultValues
  });

  // Atualizar o estágio selecionado se for fornecido como prop
  React.useEffect(() => {
    if (selectedStage && !isEditing && !watch('stage_id')) {
      const stage = funnelStages.find(s => s.id === selectedStage);
      if (stage) {
        setValue('stage_id', selectedStage);
        setValue('stage_name', stage.name);
      }
    }
  }, [selectedStage, isEditing, watch, setValue, funnelStages]);

  // Atualizar stage_name quando stage_id mudar
  const watchedStageId = watch('stage_id');
  React.useEffect(() => {
    if (watchedStageId) {
      const stage = funnelStages.find(s => s.id === watchedStageId);
      if (stage) {
        setValue('stage_name', stage.name);
      }
    }
  }, [watchedStageId, funnelStages, setValue]);

  const onSubmitHandler = handleSubmit(async (data) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Erro ao enviar formulário:', error);
    }
  });

  const waitTimeOptions = [
    { value: '30 minutos', label: '30 min' },
    { value: '1 hora', label: '1h' },
    { value: '6 horas', label: '6h' },
    { value: '12 horas', label: '12h' },
    { value: '24 horas', label: '24h' },
    { value: '48 horas', label: '48h' },
    { value: '3 dias', label: '3 dias' },
    { value: '7 dias', label: '7 dias' },
  ];

  return (
    <form onSubmit={onSubmitHandler} id="step-form" className="bg-gray-700 p-4 rounded-lg">
      <h4 className="text-sm font-medium text-white mb-3">
        {isEditing ? 'Editar Estágio' : 'Adicionar Novo Estágio'}
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Etapa do Funil *
          </label>
          <select
            {...register('stage_id')}
            className={`w-full px-3 py-2 bg-gray-600 text-white rounded-md border ${
              errors.stage_id ? 'border-red-500' : 'border-gray-500'
            }`}
          >
            <option value="">Selecione um estágio</option>
            {funnelStages.map(stage => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          {errors.stage_id && (
            <p className="mt-1 text-xs text-red-500">{errors.stage_id.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Nome do Template *
          </label>
          <input
            type="text"
            {...register('template_name')}
            className={`w-full px-3 py-2 bg-gray-600 text-white rounded-md border ${
              errors.template_name ? 'border-red-500' : 'border-gray-500'
            }`}
            placeholder="Ex: qualificacao_1h"
          />
          {errors.template_name && (
            <p className="mt-1 text-xs text-red-500">{errors.template_name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Tempo de Espera *
          </label>
          <div className="flex flex-col space-y-2">
            <input
              type="text"
              {...register('wait_time')}
              className={`w-full px-3 py-2 bg-gray-600 text-white rounded-md border ${
                errors.wait_time ? 'border-red-500' : 'border-gray-500'
              }`}
              placeholder="Ex: 30 minutos, 1 hora, 1 dia"
            />
            {errors.wait_time && (
              <p className="mt-1 text-xs text-red-500">{errors.wait_time.message}</p>
            )}
            <div className="text-xs text-gray-400 flex flex-wrap gap-2">
              {waitTimeOptions.map((option) => (
                <span
                  key={option.value}
                  className="bg-gray-700 px-2 py-1 rounded cursor-pointer hover:bg-gray-600"
                  onClick={() => setValue('wait_time', option.value)}
                >
                  {option.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Categoria
          </label>
          <select
            {...register('category')}
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
            {...register('message')}
            className={`w-full px-3 py-2 bg-gray-600 text-white rounded-md border ${
              errors.message ? 'border-red-500' : 'border-gray-500'
            }`}
            placeholder="Digite o conteúdo da mensagem..."
            rows={4}
          />
          {errors.message && (
            <p className="mt-1 text-xs text-red-500">{errors.message.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-center">
            <Controller
              name="auto_respond"
              control={control}
              render={({ field }) => (
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-500 text-orange-600 focus:ring-orange-500"
                />
              )}
            />
            <label className="ml-2 text-sm text-gray-300">
              Responder automaticamente
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        {isEditing && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
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
    </form>
  );
};

export default StepFormRHF;