'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { ErrorMessage, Footer, MainNavigation } from '../../campaigns/_components/index';
import CampaignForm from '../../campaigns/_components/CampaignFormHook'; // Vamos criar este componente
import Link from 'next/link';
import followUpService from '../../_services/followUpService';
import { Campaign, CampaignStep, FunnelStage } from '../../_types';
import CampaignFormHook from '../../campaigns/_components/CampaignFormHook';

// Definir os tipos para os formulários
type CampaignFormData = {
  name: string;
  description: string;
  steps: CampaignStep[];
};

// Componente principal de edição de campanha
export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Array.isArray(params.id) ? params.id[0] : params.id as string;

  // Estados
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignSteps, setCampaignSteps] = useState<CampaignStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSteps, setIsLoadingSteps] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  
  // Inicializar react-hook-form
  const methods = useForm<CampaignFormData>();
  
  // Buscar todos os dados necessários
  const fetchAllData = async () => {
    setIsLoading(true);
    setIsLoadingSteps(true);

    try {
      // Carregar a campanha
      const campaignData = await followUpService.getCampaign(campaignId);
      console.log(campaignData)
      
      // Buscar os estágios específicos desta campanha
      const stages = await followUpService.getFunnelStages(campaignId);
      
      // Buscar os passos específicos desta campanha
      const steps = await followUpService.getCampaignSteps(campaignId);
      
      // Atualizar os estados com os dados carregados
      setCampaign(campaignData);
      setFunnelStages(stages);
      setCampaignSteps(steps);
      
      // Atualizar o formulário com os dados carregados
      methods.reset({
        name: campaignData.name,
        description: campaignData.description || '',
        steps: steps
      });
    } catch (err: any) {
      console.error('Erro ao carregar dados:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
      setIsLoadingSteps(false);
    }
  };

  // Efeito para carregar todos os dados de uma só vez
  useEffect(() => {
    // Limpar dados antigos quando o ID da campanha mudar
    setFunnelStages([]);
    setCampaignSteps([]);
    
    // Limpar o cache para garantir dados atualizados
    followUpService.clearCampaignCache(campaignId);
    
    fetchAllData();
  }, [campaignId]);

  // Função unificada para remover um estágio
  const handleRemoveStep = async (index: number, step?: CampaignStep): Promise<boolean> => {
    // Se step não foi fornecido, obtê-lo a partir do índice
    const stepToRemove = step || campaignSteps[index];
    
    // Validar o índice
    if (index < 0 || index >= campaignSteps.length) {
      console.error(`Erro ao remover estágio: índice inválido ${index}`);
      alert('Índice de estágio inválido');
      return false;
    }

    if (!stepToRemove.id) {
      console.error('Estágio sem ID não pode ser removido');
      alert('Erro: Estágio sem identificação não pode ser removido');
      return false;
    }

    // Pedir confirmação
    if (!confirm(`Tem certeza que deseja remover o estágio "${stepToRemove.template_name}" da etapa "${stepToRemove.stage_name}"?`)) {
      return false;
    }

    setIsLoadingSteps(true);

    try {
      // Excluir o estágio no servidor
      const success = await followUpService.deleteStep(stepToRemove.id);
      
      if (success) {
        // Atualizar o estado local removendo o estágio
        const newSteps = [...campaignSteps];
        newSteps.splice(index, 1);
        setCampaignSteps(newSteps);
        
        // Atualizar também o formulário
        methods.setValue('steps', newSteps);
        
        return true;
      } else {
        alert('Erro ao remover o estágio no servidor');
        return false;
      }
    } catch (error) {
      console.error('Erro ao remover estágio:', error);
      alert('Ocorreu um erro ao remover o estágio');
      return false;
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // Função para adicionar um estágio
  const handleAddStep = async (newStep: CampaignStep): Promise<boolean> => {
    setIsLoadingSteps(true);
    
    try {
      // Verificar se temos os dados mínimos necessários
      if (!newStep.stage_id || !newStep.template_name || !newStep.wait_time || !newStep.message) {
        console.error('Dados incompletos para criar um novo estágio:', newStep);
        
        const missingFields = [];
        if (!newStep.stage_id) missingFields.push('etapa do funil');
        if (!newStep.template_name) missingFields.push('nome do template');
        if (!newStep.wait_time) missingFields.push('tempo de espera');
        if (!newStep.message) missingFields.push('mensagem');
        
        alert(`Por favor, preencha todos os campos obrigatórios: ${missingFields.join(', ')}`);
        return false;
      }

      // Mapear dados para o formato esperado pela API
      const stepData = {
        funnel_stage_id: newStep.stage_id,
        name: newStep.template_name || 'Novo Estágio',
        template_name: newStep.template_name || 'template_default',
        wait_time: newStep.wait_time || '30 minutos',
        message_content: newStep.message || '',
        message_category: newStep.category || 'Utility',
        auto_respond: newStep.auto_respond !== undefined ? newStep.auto_respond : true
      };

      // Adicionar o estágio no servidor
      const response = await followUpService.createStep(stepData);
      
      if (response.success) {
        // Obter o estágio criado
        const createdStep = response.data;
        
        // Criar um novo objeto CampaignStep com os dados retornados
        const newCampaignStep: CampaignStep = {
          id: createdStep.id,
          stage_id: createdStep.funnel_stage_id,
          stage_name: funnelStages.find(s => s.id === createdStep.funnel_stage_id)?.name || 'Estágio desconhecido',
          template_name: createdStep.template_name,
          wait_time: createdStep.wait_time,
          message: createdStep.message_content,
          category: createdStep.message_category,
          auto_respond: createdStep.auto_respond
        };
        
        // Atualizar o estado local
        const updatedSteps = [...campaignSteps, newCampaignStep];
        setCampaignSteps(updatedSteps);
        
        // Atualizar também o formulário
        methods.setValue('steps', updatedSteps);
        
        return true;
      } else {
        alert('Erro ao adicionar estágio');
        return false;
      }
    } catch (error) {
      console.error('Erro ao adicionar estágio:', error);
      alert('Ocorreu um erro ao adicionar o estágio');
      return false;
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // Função para atualizar um estágio
  const handleUpdateStep = async (index: number, updatedStep: CampaignStep): Promise<boolean> => {
    setIsLoadingSteps(true);
    
    try {
      if (!updatedStep.id) {
        console.error('Estágio sem ID não pode ser atualizado');
        alert('Erro: Estágio sem identificação não pode ser atualizado');
        return false;
      }

      // Mapear dados para o formato esperado pela API
      const stepData = {
        id: updatedStep.id,
        funnel_stage_id: updatedStep.stage_id,
        name: updatedStep.template_name,
        template_name: updatedStep.template_name,
        wait_time: updatedStep.wait_time,
        message_content: updatedStep.message,
        message_category: updatedStep.category || 'Utility',
        auto_respond: updatedStep.auto_respond !== undefined ? updatedStep.auto_respond : true
      };

      // Atualizar o estágio no servidor
      const response = await followUpService.updateStep(updatedStep.id, stepData);
      
      if (response.success) {
        // Atualizar o estado local
        const newSteps = [...campaignSteps];
        newSteps[index] = updatedStep;
        setCampaignSteps(newSteps);
        
        // Atualizar também o formulário
        methods.setValue('steps', newSteps);
        
        return true;
      } else {
        alert('Erro ao atualizar estágio');
        return false;
      }
    } catch (error) {
      console.error('Erro ao atualizar estágio:', error);
      alert('Ocorreu um erro ao atualizar o estágio');
      return false;
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // Função para adicionar uma etapa do funil
  const handleAddFunnelStage = async (newStage: Omit<FunnelStage, 'id'>): Promise<boolean> => {
    try {
      // Adicionar o ID da campanha ao criar um novo estágio
      const createdStage = await followUpService.createFunnelStage(
        newStage.name,
        newStage.description,
        newStage.order,
        campaignId
      );

      // Atualizar apenas a lista de estágios
      const stages = await followUpService.getFunnelStages(campaignId);
      setFunnelStages(stages);

      return true;
    } catch (error) {
      console.error('Erro ao adicionar estágio do funil:', error);
      return false;
    }
  };

  // Função para atualizar uma etapa do funil
  const handleUpdateFunnelStage = async (stageId: string, updatedStage: Partial<FunnelStage>): Promise<boolean> => {
    try {
      console.log('Atualizando estágio do funil:', stageId, updatedStage);
      
      if (!updatedStage.name) {
        console.error('Nome do estágio é obrigatório');
        alert('Nome do estágio é obrigatório');
        return false;
      }
      
      const result = await followUpService.updateFunnelStage(stageId, {
        name: updatedStage.name,
        description: updatedStage.description,
        order: updatedStage.order
      });
      
      if (!result) {
        throw new Error('Resposta da API não contém dados');
      }

      // Atualizar apenas a lista de estágios
      const stages = await followUpService.getFunnelStages(campaignId);
      setFunnelStages(stages);

      return true;
    } catch (error) {
      console.error('Erro ao atualizar estágio do funil:', error);
      alert('Erro ao atualizar estágio do funil');
      return false;
    }
  };

  // Função para remover uma etapa do funil
  const handleRemoveFunnelStage = async (stageId: string): Promise<boolean> => {
    try {
      // Primeiro verificar se há passos associados a esta etapa na campanha atual
      const currentSteps = campaignSteps.filter((step: any) => step.stage_id === stageId);
      
      if (currentSteps.length > 0) {
        // Perguntar ao usuário se deseja remover todos os passos junto com a etapa
        if (!confirm(`Esta etapa contém ${currentSteps.length} estágios. Todos eles serão removidos. Deseja continuar?`)) {
          return false;
        }
        
        // Remover cada passo associado à etapa
        for (const step of currentSteps) {
          if (step.id) {
            try {
              await followUpService.deleteStep(step.id);
            } catch (stepError) {
              console.error(`Erro ao remover passo ${step.id}:`, stepError);
              // Continuar removendo os outros passos
            }
          }
        }
      }
      
      // Agora remover a etapa do funil
      await followUpService.deleteFunnelStage(stageId);

      // Atualizar dados 
      const [stages, updatedSteps] = await Promise.all([
        followUpService.getFunnelStages(campaignId),
        followUpService.getCampaignSteps(campaignId)
      ]);

      setFunnelStages(stages);
      setCampaignSteps(updatedSteps);
      methods.setValue('steps', updatedSteps);

      return true;
    } catch (error: any) {
      console.error('Erro ao remover estágio do funil:', error);
      alert(`Erro ao remover etapa: ${error.message || 'Erro desconhecido'}`);
      return false;
    }
  };

  // Handler para submit do formulário
  const onSubmit = methods.handleSubmit(async (data) => {
    setIsSubmitting(true);
    
    try {
      // Atualizar a campanha no servidor
      const response = await followUpService.updateCampaign(campaignId, {
        name: data.name,
        description: data.description,
        steps: data.steps
      });
      
      if (response.success) {
        alert('Campanha atualizada com sucesso!');
        // Recarregar os dados para garantir consistência
        fetchAllData();
      } else {
        alert('Erro ao atualizar campanha');
      }
    } catch (error) {
      console.error('Erro ao atualizar campanha:', error);
      setError('Erro ao atualizar campanha');
    } finally {
      setIsSubmitting(false);
    }
  });

  // Renderização condicional baseada no estado de carregamento
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <MainNavigation />
        <main className="flex-1 container mx-auto px-4 py-6">
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <MainNavigation />

      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-center mb-6">
          <Link
            href="/follow-up/campaigns"
            className="text-gray-400 hover:text-white mr-2"
          >
            ← Voltar para Campanhas
          </Link>
          <h1 className="text-2xl font-bold">
            {campaign ? `Editar Campanha: ${campaign.name}` : 'Campanha não encontrada'}
          </h1>
        </div>

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

        {campaign && (
          <FormProvider {...methods}>
            <CampaignFormHook
              funnelStages={funnelStages}
              campaignSteps={campaignSteps}
              onSubmit={onSubmit}
              onCancel={() => router.push('/follow-up/campaigns')}
              isLoading={isSubmitting || isLoadingSteps}
              onAddStep={handleAddStep}
              onUpdateStep={handleUpdateStep}
              onRemoveStep={handleRemoveStep}
              onAddFunnelStage={handleAddFunnelStage}
              onUpdateFunnelStage={handleUpdateFunnelStage}
              onRemoveFunnelStage={handleRemoveFunnelStage}
              onRefreshCampaign={fetchAllData}
              campaignId={campaignId}
            />
          </FormProvider>
        )}
      </main>

      <Footer />
    </div>
  );
}