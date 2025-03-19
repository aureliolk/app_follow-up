'use client';

import React, { useState, useEffect } from 'react';
import CampaignBasicInfoForm from './CampaignBasicInfoForm';
import FunnelStageForm from './FunnelStageForm';
import FunnelStageList from './FunnelStageList';
import StepForm from './StepForm';
import FunnelStagesTabs from './FunnelStagesTabs';

// Adiciona handleShowAddForm como propriedade global do window
declare global {
  interface Window {
    addStageStep: (stageId: string) => void;
  }
}

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
  auto_respond: boolean;
}

interface CampaignFormProps {
  funnelStages: FunnelStage[];
  initialData?: {
    id?: string;
    name: string;
    description?: string;
    steps: Step[];
  };
  onSubmit: (formData: {
    name: string;
    description: string;
    steps: Step[];
  }) => void;
  onCancel: () => void;
  isLoading: boolean;
  onAddStep?: (newStep: Step) => Promise<boolean>; // retorna sucesso/falha
  onUpdateStep?: (index: number, updatedStep: Step) => Promise<boolean>;
  onRemoveStep?: (index: number, step: Step) => Promise<boolean>;
  onAddFunnelStage?: (newStage: Omit<FunnelStage, 'id'>) => Promise<boolean>;
  onUpdateFunnelStage?: (stageId: string, updatedStage: Partial<FunnelStage>) => Promise<boolean>;
  onRemoveFunnelStage?: (stageId: string) => Promise<boolean>;
  immediateUpdate?: boolean; // se true, cada operação será persistida imediatamente
}

const CampaignForm: React.FC<CampaignFormProps> = ({
  funnelStages,
  initialData,
  onSubmit,
  onCancel,
  isLoading,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  onAddFunnelStage,
  onUpdateFunnelStage,
  onRemoveFunnelStage,
  immediateUpdate = false
}) => {
  // Usaremos um useEffect após a definição das funções para registrar a função global
  // Estados para informações básicas da campanha
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  
  // Estados para gerenciar estágios (steps)
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [showStepForm, setShowStepForm] = useState(false);
  const [loadingStep, setLoadingStep] = useState(false);
  
  // Estados para gerenciamento de etapas do funil
  const [showFunnelStageForm, setShowFunnelStageForm] = useState(false);
  const [editingFunnelStage, setEditingFunnelStage] = useState<FunnelStage | null>(null);
  const [loadingFunnelStage, setLoadingFunnelStage] = useState(false);
  const [newFunnelStage, setNewFunnelStage] = useState<Omit<FunnelStage, 'id'>>({
    name: '',
    description: '',
    order: 0
  });

  // Estado para o formulário de estágio
  const [newStep, setNewStep] = useState<Step>({
    stage_id: '',
    stage_name: '',
    template_name: '',
    wait_time: '30 minutos',
    message: '',
    category: 'Utility'
  });

  // Inicializar os steps quando o componente for montado ou quando props mudarem
  useEffect(() => {
    // Para novas campanhas sempre começamos com uma lista vazia
    if (!initialData?.id) {
      setSteps([]);
      return;
    }

    // Para campanhas existentes, usamos os passos fornecidos
    if (initialData?.steps && Array.isArray(initialData.steps) && initialData.steps.length > 0) {
      // Mapear os passos para o formato correto e consistente
      const formattedSteps = initialData.steps.map((step: any) => {
        // Garantir que todo step tenha um ID único
        const stepId = step.id || `step-${Math.random().toString(36).substring(2, 11)}`;

        // Se o formato for { stage_name, wait_time, message, template_name }
        if (step.stage_name) {
          // Verificar se a etapa ainda existe no banco de dados
          const stage = funnelStages.find(s => s.name === step.stage_name);

          // Se a etapa não existir mais, ignore este estágio
          if (!stage && step.stage_name !== 'Sem etapa definida') {
            return null;
          }

          return {
            id: stepId,
            stage_id: step.stage_id || stage?.id || '',
            stage_name: step.stage_name,
            template_name: step.template_name || '',
            wait_time: step.wait_time || '',
            message: step.message || '',
            category: step.category || 'Utility'
          };
        }
        // Se o formato for { etapa, mensagem, tempo_de_espera, nome_template }
        else if (step.etapa) {
          // Verificar se a etapa ainda existe no banco de dados
          const stage = funnelStages.find(s => s.name === step.etapa);

          // Se a etapa não existir mais, ignore este estágio
          if (!stage && step.etapa !== 'Sem etapa definida') {
            return null;
          }

          return {
            id: stepId,
            stage_id: step.stage_id || stage?.id || '',
            stage_name: step.etapa,
            template_name: step.template_name || step.nome_template || '',
            wait_time: step.wait_time || step.tempo_de_espera || '',
            message: step.message || step.mensagem || '',
            category: step.category || 'Utility'
          };
        }

        // Caso contrário, usar o passo como está, mas garantir o ID
        const result = {
          ...step,
          id: stepId
        };

        return result as Step;
      }).filter(Boolean) as Step[]; // Remove nulos (estágios com etapas que não existem mais)

      setSteps(formattedSteps);
    } else {
      // Campanha existente mas sem passos, definir array vazio
      setSteps([]);
    }
  }, [initialData, funnelStages]);

  // Função para mostrar o formulário para adicionar um novo estágio
  const handleShowAddForm = React.useCallback((stageId?: string) => {
    // Resetar o formulário para um novo estágio
    setNewStep({
      stage_id: stageId || '',
      stage_name: stageId ? (funnelStages.find(s => s.id === stageId)?.name || '') : '',
      template_name: '',
      wait_time: '30 minutos',
      message: '',
      category: 'Utility',
      auto_respond: true
    });
    setEditingStepIndex(null);
    setSelectedStage(stageId || '');
    setShowStepForm(true);

    // Rolar até o formulário
    setTimeout(() => {
      document.getElementById('step-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [funnelStages, setNewStep, setEditingStepIndex, setSelectedStage, setShowStepForm]);

  // Função para editar um passo existente
  const handleEditStep = (index: number) => {
    // Validar o índice antes de prosseguir
    if (index < 0 || index >= steps.length) {
      console.error(`Erro ao editar estágio: índice inválido ${index}`);
      alert('Índice de estágio inválido');
      return;
    }

    const stepToEdit = steps[index];
    // console.log(`Editando estágio no índice ${index}:`, stepToEdit);

    // Garantir que todos os campos necessários estejam presentes
    setNewStep({
      id: stepToEdit.id,
      stage_id: stepToEdit.stage_id,
      stage_name: stepToEdit.stage_name,
      template_name: stepToEdit.template_name || '',
      wait_time: stepToEdit.wait_time || '30 minutos',
      message: stepToEdit.message || '',
      category: stepToEdit.category || 'Utility',
      auto_respond: stepToEdit.auto_respond !== undefined ? stepToEdit.auto_respond : true
    });

    setEditingStepIndex(index);
    setShowStepForm(true);

    // Se o estágio está definido, selecionar o estágio correto no dropdown
    if (stepToEdit.stage_id) {
      setSelectedStage(stepToEdit.stage_id);
    }

    // Rolar até o formulário de edição
    setTimeout(() => {
      document.getElementById('step-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleAddOrUpdateStep = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!newStep.stage_id || !newStep.template_name || !newStep.wait_time || !newStep.message) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    setLoadingStep(true);
    let success = true;

    try {
      if (editingStepIndex !== null) {
        // Estamos editando um passo existente
        if (immediateUpdate && onUpdateStep) {
          // Salva no banco de dados imediatamente
          success = await onUpdateStep(editingStepIndex, { ...newStep });
          if (!success) {
            alert('Erro ao atualizar o estágio no servidor');
            return;
          }
        }

        // Atualiza o estado local
        const updatedSteps = [...steps];
        updatedSteps[editingStepIndex] = { ...newStep };
        setSteps(updatedSteps);
        setEditingStepIndex(null); // Sair do modo de edição
      } else {
        // Estamos adicionando um novo passo
        if (immediateUpdate && onAddStep) {
          // Salva no banco de dados imediatamente
          success = await onAddStep({ ...newStep });
          if (!success) {
            alert('Erro ao adicionar o estágio no servidor');
            return;
          }
        }

        // Atualiza o estado local
        setSteps([...steps, { ...newStep }]);
      }

      // Se chegou até aqui, deu tudo certo
      setShowStepForm(false); // Esconder o formulário

      // Resetar o formulário mas manter o estágio selecionado
      setNewStep({
        stage_id: newStep.stage_id,
        stage_name: newStep.stage_name,
        template_name: '',
        wait_time: '30 minutos',
        message: '',
        category: 'Utility',
        auto_respond: true
      });
    } catch (error) {
      console.error('Erro ao salvar estágio:', error);
      alert('Ocorreu um erro ao salvar o estágio');
    } finally {
      setLoadingStep(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingStepIndex(null);
    setShowStepForm(false);
    // Resetar o formulário
    setNewStep({
      stage_id: '',
      stage_name: '',
      template_name: '',
      wait_time: '30 minutos',
      message: '',
      category: 'Utility',
      auto_respond: true
    });
  };

  const handleRemoveStep = async (index: number) => {
    // Validar o índice antes de prosseguir
    if (index < 0 || index >= steps.length) {
      console.error(`Erro ao remover estágio: índice inválido ${index}`);
      alert('Índice de estágio inválido');
      return;
    }

    const stepToRemove = steps[index];
    // console.log(`Confirmando remoção do estágio:`, stepToRemove);

    if (!confirm(`Tem certeza que deseja remover o estágio "${stepToRemove.template_name}" da etapa "${stepToRemove.stage_name}"?`)) {
      return;
    }

    // console.log(`Removendo estágio no índice ${index}:`, stepToRemove);
    setLoadingStep(true);

    try {
      // Primeiro, verifica se devemos persistir a remoção no banco de dados
      if (immediateUpdate && onRemoveStep) {
        // console.log(`Enviando comando de remoção para o servidor:`, stepToRemove);
        const success = await onRemoveStep(index, stepToRemove);
        if (!success) {
          alert('Erro ao remover o estágio no servidor');
          return; // Não atualizar o UI se a operação falhar no servidor
        }
      }

      // Apenas atualiza o estado local se a operação no servidor for bem-sucedida (ou se não for imediata)
      const newSteps = [...steps];
      newSteps.splice(index, 1);
      setSteps(newSteps);

      // Se estávamos editando este passo, sair do modo de edição
      if (editingStepIndex === index) {
        handleCancelEdit();
      } else if (editingStepIndex !== null && editingStepIndex > index) {
        // Ajustar o índice se removemos um passo antes do que está sendo editado
        setEditingStepIndex(editingStepIndex - 1);
      }

      // console.log('Estágio removido com sucesso, novos estágios:', newSteps.length);
    } catch (error) {
      console.error('Erro ao remover estágio:', error);
      alert('Ocorreu um erro ao remover o estágio');
    } finally {
      setLoadingStep(false);
    }
  };

  // Funções para gerenciar etapas do funil
  const handleShowAddFunnelStageForm = () => {
    setEditingFunnelStage(null);
    setNewFunnelStage({
      name: '',
      description: '',
      order: funnelStages.length // Próxima ordem disponível
    });
    setShowFunnelStageForm(true);
  };

  const handleEditFunnelStage = (stage: FunnelStage) => {
    setEditingFunnelStage(stage);
    setNewFunnelStage({
      name: stage.name,
      description: stage.description || '',
      order: stage.order
    });
    setShowFunnelStageForm(true);
  };

  const handleCancelFunnelStageEdit = () => {
    setEditingFunnelStage(null);
    setShowFunnelStageForm(false);
  };

  const handleAddOrUpdateFunnelStage = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!newFunnelStage.name) {
      alert('O nome da etapa é obrigatório');
      return;
    }

    setLoadingFunnelStage(true);

    try {
      if (editingFunnelStage && onUpdateFunnelStage) {
        // Atualizar etapa existente
        const success = await onUpdateFunnelStage(editingFunnelStage.id, newFunnelStage);
        if (success) {
          setShowFunnelStageForm(false);
          setEditingFunnelStage(null);
        } else {
          alert('Erro ao atualizar a etapa do funil');
        }
      } else if (onAddFunnelStage) {
        // Adicionar nova etapa
        const success = await onAddFunnelStage(newFunnelStage);
        if (success) {
          setShowFunnelStageForm(false);
        } else {
          alert('Erro ao adicionar a etapa do funil');
        }
      }
    } catch (error) {
      console.error('Erro ao salvar etapa do funil:', error);
      alert('Ocorreu um erro ao salvar a etapa do funil');
    } finally {
      setLoadingFunnelStage(false);
    }
  };

  const handleRemoveFunnelStage = async (stageId: string) => {
    if (!confirm('Tem certeza que deseja remover esta etapa do funil? Todos os estágios associados também serão removidos.')) {
      return;
    }

    // console.log(`Tentando remover etapa do funil com ID: ${stageId}`);

    if (onRemoveFunnelStage) {
      setLoadingFunnelStage(true);
      try {
        const success = await onRemoveFunnelStage(stageId);

        if (success) {
          // console.log('Etapa do funil removida com sucesso');

          // Atualizar também a lista de etapas localmente
          // Remover todos os passos da campanha associados a esta etapa
          const updatedSteps = steps.filter(step => {
            const isRelatedToRemovedStage =
              step.stage_id === stageId ||
              (funnelStages.find(s => s.id === stageId)?.name === step.stage_name);

            if (isRelatedToRemovedStage) {
              // console.log('Removendo passo associado à etapa removida:', step);
            }

            return !isRelatedToRemovedStage;
          });

          if (updatedSteps.length !== steps.length) {
            // console.log(`Atualizando passos: ${steps.length} -> ${updatedSteps.length}`);
            setSteps(updatedSteps);
          }
        } else {
          alert('Erro ao remover a etapa do funil');
        }
      } catch (error) {
        console.error('Erro ao remover etapa do funil:', error);
        alert('Ocorreu um erro ao remover a etapa do funil');
      } finally {
        setLoadingFunnelStage(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!name) {
      alert('O nome da campanha é obrigatório');
      return;
    }

    // Removido a validação obrigatória de etapas
    // As etapas podem ser adicionadas posteriormente

    onSubmit({
      name,
      description,
      steps
    });
  };
  
  // Registramos a função global depois que handleShowAddForm está definida
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.addStageStep = handleShowAddForm;
    }
    
    return () => {
      // Limpar ao desmontar
      if (typeof window !== 'undefined') {
        delete window.addStageStep;
      }
    };
  }, [handleShowAddForm]);
  
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-4">
        {initialData?.id ? 'Editar Campanha' : 'Nova Campanha'}
      </h2>

      {/* Formulário com informações básicas */}
      <CampaignBasicInfoForm
        name={name}
        setName={setName}
        description={description}
        setDescription={setDescription}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        isEditing={!!initialData?.id}
      />

      {/* Seção para gerenciar etapas do funil */}
      <div className="mb-6 mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-white">Gerenciar Etapas do Funil</h3>
        </div>

        {/* Formulário para adicionar/editar etapas do funil */}
        {showFunnelStageForm && (
          <FunnelStageForm 
            editingStage={editingFunnelStage}
            newStage={newFunnelStage}
            setNewStage={setNewFunnelStage}
            onCancel={handleCancelFunnelStageEdit}
            onSave={handleAddOrUpdateFunnelStage}
            isLoading={loadingFunnelStage}
          />
        )}

        {/* Tabela de etapas do funil - apenas mostrada quando temos etapas ou é um formulário de edição */}
        {(funnelStages.length > 0 || initialData?.id) && (
          <FunnelStageList 
            stages={funnelStages}
            onEdit={handleEditFunnelStage}
            onRemove={handleRemoveFunnelStage}
          />
        )}
        
        {/* Mensagem quando não há etapas e estamos criando uma nova campanha */}
        {funnelStages.length === 0 && !initialData?.id && (
          <div className="bg-gray-700 p-4 rounded-lg mb-4 text-center">
            <p className="mb-4">
              Você está criando uma nova campanha.
            </p>
            <p className="italic text-sm text-gray-500 mb-4">
              Primeiro, crie a campanha com as informações básicas. Depois você poderá adicionar etapas e estágios específicos a ela.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleShowAddFunnelStageForm();
          }}
          className="px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors flex items-center text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Nova Etapa do Funil
        </button> 
      </div>

      {/* Seção para adicionar estágios ao funil - só exibida se não for nova campanha ou se tiver etapas */}
      {(initialData?.id || funnelStages.length > 0) && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white mb-2">Estágios da Campanha</h3>

          {steps.length > 0 ? (
            <div className="bg-gray-700 rounded-lg overflow-hidden mb-4">
              <FunnelStagesTabs
                steps={steps}
                onRemoveStep={handleRemoveStep}
                onEditStep={handleEditStep}
              />
            </div>
          ) : (
            <div className="text-gray-400 bg-gray-700 rounded-lg p-6 my-4 text-center">
              <p className="mb-4">
                Nenhum estágio adicionado. Use o botão abaixo para adicionar estágios às etapas do funil.
              </p>
              <p className="italic text-sm text-gray-500">
                É necessário adicionar pelo menos um estágio em cada etapa do funil para que a campanha funcione corretamente.
              </p>
            </div>
          )}

          {/* Botão para adicionar novo estágio */}
          {!showStepForm && (
            <div className="mb-4">
              <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleShowAddForm();
              }}
              className="px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Adicionar Novo Estágio
            </button>
          </div>
        )}

          {/* Formulário para adicionar/editar estágio */}
          {showStepForm && (
            <StepForm
              newStep={newStep}
              setNewStep={setNewStep}
              funnelStages={funnelStages}
              isEditing={editingStepIndex !== null}
              onCancel={handleCancelEdit}
              onSave={handleAddOrUpdateStep}
              isLoading={loadingStep}
              selectedStage={selectedStage}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default CampaignForm;