// /app/follow-up/campaigns/_components/FunnelStageFormComponent.tsx
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FunnelStageFormRHF } from './index';
import { FunnelStage } from '@/app/follow-up/_types/schema';
import { useFunnelStages } from '@/app/follow-up/_services/funnelService';

interface FunnelStageFormComponentProps {
  campaignId?: string;
  onStageAdded?: () => void;
  onCancel?: () => void;
  editingStage?: FunnelStage | null;
}

const FunnelStageFormComponent: React.FC<FunnelStageFormComponentProps> = ({
  campaignId,
  onStageAdded,
  onCancel,
  editingStage
}) => {
  const { createStage, updateStage, isLoading } = useFunnelStages();

  const handleSubmit = async (data: FunnelStage) => {
    try {
      if (editingStage && editingStage.id) {
        // Atualizar estágio existente
        const result = await updateStage(editingStage.id, {
          name: data.name,
          description: data.description,
          order: data.order
        });
        
        if (result) {
          console.log('Estágio atualizado com sucesso', result);
          if (onStageAdded) onStageAdded();
          if (onCancel) onCancel();
        }
      } else {
        // Criar novo estágio
        const result = await createStage({
          name: data.name,
          description: data.description,
          order: data.order || 1
        }, campaignId);
        
        if (result) {
          console.log('Estágio criado com sucesso', result);
          if (onStageAdded) onStageAdded();
          if (onCancel) onCancel();
        }
      }
    } catch (error) {
      console.error('Erro ao salvar estágio:', error);
    }
  };

  return (
    <FunnelStageFormRHF
      defaultValues={editingStage || undefined}
      isEditing={!!editingStage}
      onSubmit={handleSubmit}
      onCancel={onCancel || (() => {})}
      isLoading={isLoading}
    />
  );
};

export default FunnelStageFormComponent;