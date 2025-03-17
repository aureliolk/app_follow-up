// app/follow-up/campaigns/[id]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ErrorMessage, Footer, MainNavigation, CampaignForm } from '../../campaigns/_components/index';
import Link from 'next/link';
import followUpService from '../../_services/followUpService';
import { Campaign, CampaignStep, FunnelStage } from '../../_types';
import axios from 'axios';

// Componente principal de edição de campanha
export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Array.isArray(params.id) ? params.id[0] : params.id as any;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignSteps, setCampaignSteps] = useState<CampaignStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSteps, setIsLoadingSteps] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [isLoadingFunnelStage, setIsLoadingFunnelStage] = useState(false);

  // Buscar todos os dados necessários com uma única função
  const fetchAllData = async () => {
    setIsLoading(true);
    setIsLoadingSteps(true);

    try {
      // Executar chamadas em paralelo para maior eficiência
      console.log('Iniciando carregamento de dados');

      const [campaignData, stages, steps] = await Promise.all([
        followUpService.getCampaign(campaignId),
        followUpService.getFunnelStages(),
        followUpService.getCampaignSteps(campaignId)
      ]);

      console.log(`Dados carregados: campanha, ${stages.length} estágios, ${steps.length} passos`);

      setCampaign(campaignData);
      setFunnelStages(stages);
      setCampaignSteps(steps);
    } catch (err: any) {
      console.error('Erro ao carregar dados:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
      setIsLoadingSteps(false);
    }
  };

  const fetchStepsOnly = async () => {
    setIsLoadingSteps(true);
    try {
      console.log('Atualizando apenas os passos da campanha');
      const steps = await followUpService.getCampaignSteps(campaignId);
      console.log(`${steps.length} passos carregados`);
      setCampaignSteps(steps);
    } catch (err: any) {
      console.error('Erro ao carregar passos:', err);
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // Efeito para carregar todos os dados de uma só vez
  useEffect(() => {
    fetchAllData();
  }, [campaignId]);

  // Função para atualizar a campanha completa
  const handleUpdateCampaign = async (formData: any) => {
    setIsSubmitting(true);
    try {
      // Usar o serviço centralizado para atualizar a campanha completa
      const response = await followUpService.updateCampaign(campaignId, formData);
      
      // Limpar o cache para esta campanha
      followUpService.clearCampaignCache(campaignId);
      
      // Recarregar os dados
      fetchAllData();
      
      alert('Campanha atualizada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao atualizar campanha:', err);
      setError(err.message || 'Erro ao atualizar campanha');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para adicionar um estágio (passo) diretamente
  const handleAddStep = async (newStep: any) => {
    try {
      setIsLoadingSteps(true);

      // Verificar se temos os dados mínimos necessários
      if (!newStep.stage_id || !newStep.template_name || !newStep.wait_time || !newStep.message) {
        console.error('Dados incompletos para criar um novo estágio');
        alert('Por favor, preencha todos os campos obrigatórios');
        return false;
      }

      console.log('Tentando adicionar novo estágio:', newStep);

      // Mapear dados para o formato esperado pela API
      const stepData = {
        funnel_stage_id: newStep.stage_id,
        name: newStep.template_name,
        template_name: newStep.template_name,
        wait_time: newStep.wait_time,
        message_content: newStep.message,
        message_category: newStep.category || 'Utility',
        auto_respond: newStep.auto_respond !== undefined ? newStep.auto_respond : true
      };

      console.log('Dados formatados para API:', stepData);

      // Usar a API POST para criar um novo passo
      const response = await axios.post('/api/follow-up/funnel-steps', stepData);

      if (response.data.success) {
        console.log('Novo estágio criado com sucesso:', response.data);

        // Atualizar apenas os passos
        await fetchStepsOnly();
        return true;
      } else {
        console.error('Erro ao criar estágio:', response.data);
        alert(`Erro: ${response.data.error || 'Falha ao criar estágio'}`);
        return false;
      }
    } catch (error: any) {
      console.error('Erro detalhado ao adicionar estágio:', error);
      alert(`Erro ao adicionar estágio: ${error.message || 'Erro desconhecido'}`);
      return false;
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // Função para atualizar um estágio
  const handleUpdateStep = async (index: number, updatedStep: any) => {
    try {
      setIsLoadingSteps(true);

      if (!updatedStep.id) {
        console.error('Estágio sem ID não pode ser atualizado');
        alert('Erro: Estágio sem identificação não pode ser atualizado');
        return false;
      }

      console.log(`Tentando atualizar estágio com índice: ${index}, ID: ${updatedStep.id}`, updatedStep);

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

      console.log('Dados formatados para API:', stepData);

      // Chamar a função específica para atualizar passo
      const result = await followUpService.updateStep(updatedStep.id, stepData);
      console.log('Resultado da atualização:', result);

      if (result.success) {
        // Atualizar apenas os passos em vez de todos os dados
        await fetchStepsOnly();
        return true;
      } else {
        alert(`Erro: ${result.error || 'Falha ao atualizar'}`);
        return false;
      }
    } catch (error: any) {
      console.error('Erro detalhado ao atualizar estágio:', error);
      alert(`Erro ao atualizar: ${error.message || 'Erro desconhecido'}`);
      return false;
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // Função para remover um estágio
  const handleRemoveStep = async (index: number, step: any) => {
    try {
      setIsLoadingSteps(true);

      if (!step.id) {
        console.error('Estágio sem ID não pode ser removido');
        alert('Erro: Estágio sem identificação não pode ser removido');
        return false;
      }

      console.log(`Tentando remover estágio com índice: ${index}, ID: ${step.id}`, step);

      // Confirmar remoção
      if (!confirm(`Tem certeza que deseja remover o estágio "${step.template_name || 'selecionado'}"?`)) {
        return false;
      }

      // Chamar a função específica para excluir passo
      const result = await followUpService.deleteStep(step.id);
      console.log('Resultado da remoção:', result);

      if (result.success) {
        // Atualizar apenas os passos em vez de todos os dados
        await fetchStepsOnly();
        return true;
      } else {
        alert(`Erro: ${result.error || 'Falha ao remover'}`);
        return false;
      }
    } catch (error: any) {
      console.error('Erro detalhado ao remover estágio:', error);
      alert(`Erro ao remover: ${error.message || 'Erro desconhecido'}`);
      return false;
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // Função para adicionar um estágio de funil
  const handleAddFunnelStage = async (newStage: Omit<FunnelStage, 'id'>) => {
    setIsLoadingFunnelStage(true);
    try {
      const createdStage = await followUpService.createFunnelStage(
        newStage.name,
        newStage.description,
        newStage.order
      );

      console.log('Nova etapa criada:', createdStage);

      // Atualizar apenas a lista de estágios
      const stages = await followUpService.getFunnelStages();
      setFunnelStages(stages);

      return true;
    } catch (error) {
      console.error('Erro ao adicionar estágio do funil:', error);
      return false;
    } finally {
      setIsLoadingFunnelStage(false);
    }
  };

  // Função para atualizar um estágio de funil
  const handleUpdateFunnelStage = async (stageId: string, updatedStage: Partial<FunnelStage>) => {
    setIsLoadingFunnelStage(true);
    try {
      console.log(`Atualizando etapa ${stageId}:`, updatedStage);

      await followUpService.updateFunnelStage(stageId, {
        name: updatedStage.name || '',
        description: updatedStage.description,
        order: updatedStage.order
      });

      // Atualizar apenas a lista de estágios
      const stages = await followUpService.getFunnelStages();
      setFunnelStages(stages);

      return true;
    } catch (error) {
      console.error('Erro ao atualizar estágio do funil:', error);
      return false;
    } finally {
      setIsLoadingFunnelStage(false);
    }
  };

  // Função para remover um estágio de funil
  const handleRemoveFunnelStage = async (stageId: string) => {
    setIsLoadingFunnelStage(true);
    try {
      await followUpService.deleteFunnelStage(stageId);

      // Atualizar dados diretamente
      const [stages, steps] = await Promise.all([
        followUpService.getFunnelStages(),
        followUpService.getCampaignSteps(campaignId)
      ]);

      setFunnelStages(stages);
      setCampaignSteps(steps);

      console.log('Etapa de funil removida com sucesso, dados atualizados');
      return true;
    } catch (error) {
      console.error('Erro ao remover estágio do funil:', error);
      return false;
    } finally {
      setIsLoadingFunnelStage(false);
    }
  };

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
            {isLoading ? 'Carregando...' : `Editar Campanha: ${campaign?.name}`}
          </h1>
        </div>

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
          </div>
        ) : campaign ? (
          <>
            {/* CampaignForm único para toda a edição */}
            <CampaignForm
              funnelStages={funnelStages}
              initialData={{
                ...campaign,
                // Incluímos todos os passos carregados do servidor para esta campanha
                steps: campaignSteps.length > 0
                  ? campaignSteps.map(step => ({
                    id: step.id || `step-${Math.random().toString(36).substring(2, 11)}`,
                    stage_id: step.stage_id || '',
                    stage_name: step.etapa || step.stage_name || '',
                    template_name: step.template_name || '',
                    wait_time: step.tempo_de_espera || step.wait_time || '',
                    message: step.message || step.mensagem || '',
                    auto_respond: true
                  }))
                  : campaign?.steps || []
              }}
              onSubmit={handleUpdateCampaign}
              onCancel={() => router.push('/follow-up/campaigns')}
              isLoading={isSubmitting || isLoadingSteps}
              // Operações individuais de estágios
              onAddStep={handleAddStep}
              onUpdateStep={handleUpdateStep}
              onRemoveStep={handleRemoveStep}
              onAddFunnelStage={handleAddFunnelStage}
              onUpdateFunnelStage={handleUpdateFunnelStage}
              onRemoveFunnelStage={handleRemoveFunnelStage}
              immediateUpdate={true} // Ativar a persistência imediata
            />
          </>
        ) : (
          <div className="bg-gray-800 p-6 rounded-lg">
            <p className="text-gray-400 text-center">
              Campanha não encontrada ou foi removida.
            </p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}