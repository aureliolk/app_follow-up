// ExampleUsage.tsx - Um exemplo completo de como usar os componentes refatorados
'use client';

import React, { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { 
  FunnelStageFormRHF, 
  FunnelStageFormComponent,
  StepFormRHF
} from './index';
import { FunnelStage, FunnelStep } from '@/app/follow-up/_types/schema';
import { useFunnelStages, useFunnelSteps } from '@/app/follow-up/_services/funnelService';

interface ExampleUsageProps {
  campaignId: string;
}

export default function ExampleUsage({ campaignId }: ExampleUsageProps) {
  // Estados locais
  const [selectedStage, setSelectedStage] = useState<FunnelStage | null>(null);
  const [editMode, setEditMode] = useState(false);
  
  // Obter hooks de serviço
  const { 
    stages, 
    isLoading: stagesLoading, 
    fetchStages, 
    createStage, 
    updateStage, 
    deleteStage 
  } = useFunnelStages();
  
  const {
    steps,
    isLoading: stepsLoading,
    fetchSteps,
    createStep,
    updateStep,
    deleteStep
  } = useFunnelSteps();
  
  // Carregar dados iniciais
  useEffect(() => {
    fetchStages(campaignId);
  }, [campaignId, fetchStages]);
  
  // Exemplo de como adicionar um estágio de funil
  const handleAddStage = async (data: FunnelStage) => {
    try {
      // Para criar, omitimos o id (vai ser gerado pelo servidor)
      const newStage = {
        name: data.name,
        description: data.description,
        order: data.order
      };
      
      await createStage(newStage, campaignId);
      
      // Recarregar estágios após adicionar
      await fetchStages(campaignId);
    } catch (error) {
      console.error('Erro ao adicionar estágio:', error);
    }
  };
  
  // Exemplo de como editar um estágio de funil
  const handleEditStage = async (data: FunnelStage) => {
    if (!selectedStage?.id) return;
    
    try {
      await updateStage(selectedStage.id, {
        name: data.name,
        description: data.description,
        order: data.order
      });
      
      // Recarregar estágios após editar
      await fetchStages(campaignId);
      setSelectedStage(null);
      setEditMode(false);
    } catch (error) {
      console.error('Erro ao editar estágio:', error);
    }
  };
  
  // Exemplo de como remover um estágio de funil
  const handleRemoveStage = async (stageId: string) => {
    try {
      await deleteStage(stageId);
      
      // Recarregar estágios após remover
      await fetchStages(campaignId);
    } catch (error) {
      console.error('Erro ao remover estágio:', error);
    }
  };
  
  // Exemplo de como adicionar um passo
  const handleAddStep = async (data: FunnelStep) => {
    try {
      await createStep(data);
      
      // Recarregar passos após adicionar
      if (selectedStage?.id) {
        await fetchSteps(selectedStage.id);
      }
    } catch (error) {
      console.error('Erro ao adicionar passo:', error);
    }
  };
  
  if (stagesLoading) {
    return <div>Carregando...</div>;
  }
  
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Exemplo de Uso dos Componentes Refatorados</h2>
      
      {/* Exemplo: FormProvider com React Hook Form */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-medium mb-4">1. Formulário de Estágio com React Hook Form</h3>
        
        {/* Usando o componente FunnelStageFormRHF diretamente */}
        <FunnelStageFormRHF
          defaultValues={selectedStage || undefined}
          isEditing={!!selectedStage}
          onSubmit={selectedStage ? handleEditStage : handleAddStage}
          onCancel={() => {
            setSelectedStage(null);
            setEditMode(false);
          }}
          isLoading={stagesLoading}
        />
      </div>
      
      {/* Exemplo: Componente Wrapper */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-medium mb-4">2. Componente Wrapper com FunnelStageFormComponent</h3>
        
        {/* Este componente já inclui integração com o serviço */}
        <FunnelStageFormComponent
          campaignId={campaignId}
          editingStage={selectedStage}
          onStageAdded={() => {
            fetchStages(campaignId);
            setSelectedStage(null);
          }}
          onCancel={() => setSelectedStage(null)}
        />
      </div>
      
      {/* Exemplo: Lista de Estágios com Funcionalidade Completa */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-medium mb-4">3. Lista de Estágios do Funil</h3>
        
        <ul className="space-y-2">
          {stages.map(stage => (
            <li key={stage.id} className="bg-gray-700 p-3 rounded-md flex justify-between items-center">
              <span>{stage.name} (Ordem: {stage.order})</span>
              <div className="space-x-2">
                <button 
                  onClick={() => {
                    setSelectedStage(stage);
                    setEditMode(true);
                  }}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Editar
                </button>
                <button 
                  onClick={() => stage.id && handleRemoveStage(stage.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      
      {/* Dica de implementação */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-medium mb-4">Como Implementar</h3>
        <ol className="list-decimal ml-5 space-y-2">
          <li>Substitua os imports existentes pelos novos componentes refatorados</li>
          <li>Use o hook useFunnelStages() para gerenciar operações de estágios do funil</li>
          <li>Use o hook useFunnelSteps() para gerenciar operações de passos</li>
          <li>Mantenha a mesma estrutura de callbacks (onAddStage, onUpdateStage, etc)</li>
          <li>Certifique-se de que o FunnelStageList recebe uma função refreshStages para atualizar a lista</li>
        </ol>
      </div>
    </div>
  );
}