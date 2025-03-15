// app/follow-up/_components/CampaignForm.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';

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

// Componente para visualização em formato de guias
interface FunnelStagesTabsProps {
  steps: Step[];
  onRemoveStep: (index: number) => void;
  onEditStep: (index: number) => void;
}

function FunnelStagesTabs({ steps, onRemoveStep, onEditStep }: FunnelStagesTabsProps) {
  // Agrupar os estágios por etapa do funil
  const stageGroups = useMemo(() => {
    const groups: Record<string, Step[]> = {};

    // Agrupar por etapa
    steps.forEach(step => {
      const stageName = step.stage_name || 'Sem etapa definida';
      if (!groups[stageName]) {
        groups[stageName] = [];
      }
      groups[stageName].push(step);
    });

    // Ordenar os grupos de etapas
    return Object.entries(groups);
  }, [steps]);

  // Estado para controlar qual guia está ativa
  const [activeStage, setActiveStage] = useState<string>('');

  // Atualizar a guia ativa quando os grupos forem carregados
  useEffect(() => {
    if (stageGroups.length > 0) {
      setActiveStage(stageGroups[0][0]);
    }
  }, [stageGroups]);

  // Se não houver estágios, mostrar mensagem
  if (stageGroups.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        Nenhum estágio encontrado para esta campanha.
      </div>
    );
  }

  // Encontrar os índices originais dos passos no array de steps
  const getStepIndex = (step: Step) => {
    // Se não tiver dados básicos, não faz sentido procurar
    if (!step || (!step.id && !step.template_name)) {
      console.warn('Passo inválido ou sem identificação:', step);
      return -1;
    }

    // Método simplificado: buscar apenas por ID, que é o mais confiável
    if (step.id) {
      const indexById = steps.findIndex(s => s.id === step.id);
      if (indexById !== -1) {
        return indexById;
      }
    }

    // Se não tem ID ou não encontrou por ID, buscar pela combinação de propriedades essenciais
    return steps.findIndex(s =>
      s.stage_name === step.stage_name &&
      s.template_name === step.template_name
    );
  };

  // Calcular qual estágio está ativo
  const activeSteps = stageGroups.find(([name]) => name === activeStage)?.[1] || [];

  return (
    <div>
      {/* Guias de navegação horizontal */}
      <div className="flex overflow-x-auto border-b border-gray-700">
        {stageGroups.map(([stageName, stageSteps], index) => (
          <button
            type="button"
            key={stageName}
            onClick={(e) => {
              e.preventDefault();
              setActiveStage(stageName);
            }}
            className={`px-6 py-3 whitespace-nowrap ${activeStage === stageName
                ? 'text-orange-500 border-b-2 border-orange-500 font-medium'
                : 'text-gray-400 hover:text-white'
              }`}
          >
            {stageName} ({stageSteps.length})
          </button>
        ))}
      </div>

      {/* Conteúdo da guia ativa - Removido título duplicado */}
      <div className="p-4">

        <table className="min-w-full divide-y divide-gray-600">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ordem</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Template</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Tempo de Espera</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Mensagem</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {activeSteps.map((step, idx) => {
              const stepIndex = getStepIndex(step);
              return (
                <tr key={`${step.id || ''}-${idx}`} className="hover:bg-gray-600/30">
                  <td className="px-4 py-2 text-sm font-medium text-white">
                    {stepIndex !== -1 ? stepIndex + 1 : idx + 1}
                  </td>
                  <td className="px-4 py-2 text-sm text-purple-400">
                    {step.template_name || 'Não definido'}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-300">
                    {step.wait_time}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-300">
                    <div className="max-w-md truncate">
                      {step.message?.substring(0, 60)}
                      {step.message?.length > 60 ? '...' : ''}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (stepIndex !== -1) {
                            console.log(`Editando estágio no índice ${stepIndex}`);
                            onEditStep(stepIndex);
                          } else {
                            console.warn("Índice não encontrado, usando fallback com IDs");
                            // Buscar o índice manualmente como fallback
                            const realIndex = steps.findIndex(s => s.id === step.id);
                            if (realIndex !== -1) {
                              console.log(`Usando índice encontrado pelo ID: ${realIndex}`);
                              onEditStep(realIndex);
                            } else {
                              alert("Erro ao encontrar estágio. Tente recarregar a página.");
                            }
                          }
                        }}
                        className="text-blue-400 hover:text-blue-300"
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
                          if (stepIndex !== -1) {
                            console.log(`Removendo estágio no índice ${stepIndex}`);
                            onRemoveStep(stepIndex);
                          } else {
                            console.warn("Índice não encontrado, usando fallback com IDs");
                            // Buscar o índice manualmente como fallback
                            const realIndex = steps.findIndex(s => s.id === step.id);
                            if (realIndex !== -1) {
                              console.log(`Usando índice encontrado pelo ID: ${realIndex}`);
                              onRemoveStep(realIndex);
                            } else {
                              alert("Erro ao encontrar estágio. Tente recarregar a página.");
                            }
                          }
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
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

  // Formulário para adicionar ou editar etapa
  const [newStep, setNewStep] = useState<Step>({
    stage_id: '',
    stage_name: '',
    template_name: '',
    wait_time: '30 minutos',
    message: '',
    category: 'Utility',
    auto_respond: true
  });

  // Atualizar o stage_name quando o stage_id muda
  useEffect(() => {
    if (newStep.stage_id) {
      const stage = funnelStages.find(s => s.id === newStep.stage_id);
      if (stage) {
        setNewStep(prev => ({
          ...prev,
          stage_name: stage.name
        }));
      }
    }
  }, [newStep.stage_id, funnelStages]);

  // Inicializar os steps quando o componente for montado ou quando props mudarem
  useEffect(() => {
    // Se já temos passos nos initialData, use-os diretamente
    if (initialData?.steps && Array.isArray(initialData.steps) && initialData.steps.length > 0) {
      console.log('Usando passos fornecidos pelo componente pai:', initialData.steps.length);

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
            console.warn(`Ignorando estágio com etapa inexistente: ${step.stage_name}`);
            return null;
          }

          return {
            id: stepId,
            stage_id: step.stage_id || stage?.id || '',
            stage_name: step.stage_name,
            template_name: step.template_name || '',
            wait_time: step.wait_time || '',
            message: step.message || '',
            category: step.category || 'Utility',
            auto_respond: step.auto_respond !== undefined ? step.auto_respond : true
          };
        }
        // Se o formato for { etapa, mensagem, tempo_de_espera, nome_template }
        else if (step.etapa) {
          // Verificar se a etapa ainda existe no banco de dados
          const stage = funnelStages.find(s => s.name === step.etapa);

          // Se a etapa não existir mais, ignore este estágio
          if (!stage && step.etapa !== 'Sem etapa definida') {
            console.warn(`Ignorando estágio com etapa inexistente: ${step.etapa}`);
            return null;
          }

          return {
            id: stepId,
            stage_id: step.stage_id || stage?.id || '',
            stage_name: step.etapa,
            template_name: step.template_name || step.nome_template || '',
            wait_time: step.wait_time || step.tempo_de_espera || '',
            message: step.message || step.mensagem || '',
            category: step.category || 'Utility',
            auto_respond: true
          };
        }

        // Caso contrário, usar o passo como está, mas garantir o ID
        const result = {
          ...step,
          id: stepId
        };

        return result as Step;
      }).filter(Boolean) as Step[]; // Remove nulos (estágios com etapas que não existem mais)

      // Log detalhado para depuração
      console.log('Passos formatados:', formattedSteps);

      setSteps(formattedSteps);
    } else if (funnelStages.length > 0) {
      // Fallback: se não temos passos, criar um passo por estágio (apenas para novas campanhas)
      if (!initialData?.id) {
        console.log('Criando passos de exemplo para nova campanha');
        const defaultSteps = funnelStages.map(stage => ({
          id: `new-step-${Math.random().toString(36).substring(2, 11)}`,
          stage_id: stage.id,
          stage_name: stage.name,
          template_name: `template_${stage.name.toLowerCase().replace(/\s+/g, '_')}`,
          wait_time: '30 minutos',
          message: `Mensagem padrão para o estágio ${stage.name}`,
          category: 'Utility',
          auto_respond: true
        }));
        setSteps(defaultSteps);
      } else {
        // Se é uma campanha existente mas sem passos, definir array vazio
        setSteps([]);
      }
    }
  }, [initialData, funnelStages]);

  // Função para mostrar o formulário para adicionar um novo estágio
  const handleShowAddForm = () => {
    // Resetar o formulário para um novo estágio
    setNewStep({
      stage_id: '',
      stage_name: '',
      template_name: '',
      wait_time: '30 minutos',
      message: '',
      category: 'Utility',
      auto_respond: true
    });
    setEditingStepIndex(null);
    setShowStepForm(true);

    // Rolar até o formulário
    setTimeout(() => {
      document.getElementById('step-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Função para editar um passo existente
  const handleEditStep = (index: number) => {
    // Validar o índice antes de prosseguir
    if (index < 0 || index >= steps.length) {
      console.error(`Erro ao editar estágio: índice inválido ${index}`);
      alert('Índice de estágio inválido');
      return;
    }

    const stepToEdit = steps[index];
    console.log(`Editando estágio no índice ${index}:`, stepToEdit);

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
    console.log(`Confirmando remoção do estágio:`, stepToRemove);

    if (!confirm(`Tem certeza que deseja remover o estágio "${stepToRemove.template_name}" da etapa "${stepToRemove.stage_name}"?`)) {
      return;
    }

    console.log(`Removendo estágio no índice ${index}:`, stepToRemove);
    setLoadingStep(true);

    try {
      // Primeiro, verifica se devemos persistir a remoção no banco de dados
      if (immediateUpdate && onRemoveStep) {
        console.log(`Enviando comando de remoção para o servidor:`, stepToRemove);
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

      console.log('Estágio removido com sucesso, novos estágios:', newSteps.length);
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

    console.log(`Tentando remover etapa do funil com ID: ${stageId}`);

    if (onRemoveFunnelStage) {
      setLoadingFunnelStage(true);
      try {
        const success = await onRemoveFunnelStage(stageId);

        if (success) {
          console.log('Etapa do funil removida com sucesso');

          // Atualizar também a lista de etapas localmente
          // Remover todos os passos da campanha associados a esta etapa
          const updatedSteps = steps.filter(step => {
            const isRelatedToRemovedStage =
              step.stage_id === stageId ||
              (funnelStages.find(s => s.id === stageId)?.name === step.stage_name);

            if (isRelatedToRemovedStage) {
              console.log('Removendo passo associado à etapa removida:', step);
            }

            return !isRelatedToRemovedStage;
          });

          if (updatedSteps.length !== steps.length) {
            console.log(`Atualizando passos: ${steps.length} -> ${updatedSteps.length}`);
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

    if (steps.length === 0) {
      alert('A campanha precisa ter pelo menos uma etapa');
      return;
    }

    onSubmit({
      name,
      description,
      steps
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-4">
        {initialData?.id ? 'Editar Campanha' : 'Nova Campanha'}
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nome da Campanha *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
              placeholder="Ex: Campanha de Vendas"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
              placeholder="Descreva o objetivo desta campanha"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            disabled={isLoading}
          >
            {isLoading ? 'Salvando...' : (initialData?.id ? 'Atualizar' : 'Criar Campanha')}
          </button>
        </div>
      </form>
       {/* Seção para gerenciar etapas do funil */}
       <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-white">Gerenciar Etapas do Funil</h3>
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

          {/* Formulário para adicionar/editar etapas do funil */}
          {showFunnelStageForm && (
            <div className="bg-gray-700 p-4 rounded-lg mb-4">
              <h4 className="text-sm font-medium text-white mb-3">
                {editingFunnelStage ? 'Editar Etapa do Funil' : 'Adicionar Nova Etapa do Funil'}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Nome da Etapa *
                  </label>
                  <input
                    type="text"
                    value={newFunnelStage.name}
                    onChange={(e) => setNewFunnelStage({ ...newFunnelStage, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
                    placeholder="Ex: Qualificação"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Ordem
                  </label>
                  <input
                    type="number"
                    value={newFunnelStage.order}
                    onChange={(e) => setNewFunnelStage({ ...newFunnelStage, order: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
                    min="1"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Descrição
                  </label>
                  <textarea
                    value={newFunnelStage.description || ''}
                    onChange={(e) => setNewFunnelStage({ ...newFunnelStage, description: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
                    placeholder="Descreva o objetivo desta etapa do funil"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancelFunnelStageEdit();
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddOrUpdateFunnelStage}
                  disabled={loadingFunnelStage}
                  className={`px-4 py-2 ${editingFunnelStage ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
                    } text-white rounded-md transition-colors ${loadingFunnelStage ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                >
                  {loadingFunnelStage ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {editingFunnelStage ? 'Salvando...' : 'Adicionando...'}
                    </span>
                  ) : (
                    editingFunnelStage ? 'Salvar Alterações' : 'Adicionar Etapa'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Tabela de etapas do funil */}
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
                {funnelStages.length > 0 ? (
                  funnelStages.map((stage) => (
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
                            handleEditFunnelStage(stage);
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
                            handleRemoveFunnelStage(stage.id);
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
        </div>

        {/* Seção para adicionar estágios ao funil */}
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
            <p className="text-gray-400 text-center my-4">
              Nenhum estágio adicionado. Use o botão abaixo para adicionar estágios às etapas do funil.
            </p>
          )}

          {/* Botão para adicionar novo estágio */}
          {!showStepForm && (
            <div className="flex justify-center mb-4">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleShowAddForm();
                }}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Adicionar Novo Estágio
              </button>
            </div>
          )}

          {/* Formulário para adicionar/editar estágio (passo) dentro de uma etapa */}
          {showStepForm && (
            <div id="step-form" className="bg-gray-700 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-white mb-3">
                {editingStepIndex !== null ? 'Editar Estágio' : 'Adicionar Novo Estágio'}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Etapa do Funil *
                  </label>
                  <select
                    value={newStep.stage_id}
                    onChange={(e) => setNewStep({ ...newStep, stage_id: e.target.value })}
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
                  <input
                    type="text"
                    value={newStep.wait_time}
                    onChange={(e) => setNewStep({ ...newStep, wait_time: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 text-white rounded-md border border-gray-500"
                    placeholder="Ex: 30 minutos, 1 hora, 1 dia"
                    required
                  />
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

                <div className="md:col-span-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="auto-respond"
                      checked={newStep.auto_respond}
                      onChange={(e) => setNewStep({ ...newStep, auto_respond: e.target.checked })}
                      className="mr-2"
                    />
                    <label htmlFor="auto-respond" className="text-xs text-gray-300">
                      Resposta automática
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                {editingStepIndex !== null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCancelEdit();
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddOrUpdateStep}
                  disabled={loadingStep}
                  className={`px-4 py-2 ${editingStepIndex !== null ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
                    } text-white rounded-md transition-colors ${loadingStep ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                >
                  {loadingStep ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {editingStepIndex !== null ? 'Salvando...' : 'Adicionando...'}
                    </span>
                  ) : (
                    editingStepIndex !== null ? 'Salvar Alterações' : 'Adicionar Estágio'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

export default CampaignForm;