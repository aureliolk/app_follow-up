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
      // Executar carregamentos sequencialmente para garantir consistência
      // console.log('Iniciando carregamento de dados para campanha:', campaignId);

      // Primeiro, carregar a campanha
      const campaignData = await followUpService.getCampaign(campaignId);
      // console.log(`Campanha carregada: ${campaignData.name}`);
      
      // Depois buscar os estágios específicos desta campanha
      const stages = await followUpService.getFunnelStages(campaignId);
      // console.log(`Estágios do funil carregados: ${stages.length}`);
      
      // Verificar se os estágios têm IDs válidos
      if (stages.length > 0) {
        // console.log('Primeiro estágio:', stages[0].name, 'ID:', stages[0].id);
      }
      
      // Por fim, buscar os passos específicos desta campanha
      const steps = await followUpService.getCampaignSteps(campaignId);
      // console.log(`Passos da campanha carregados: ${steps.length}`);
      
      // Verificar quais estágios tem passos associados
      if (steps.length > 0) {
        // console.log('Passos por estágio:');
        const stepsByStage = steps.reduce((acc: Record<string, number>, step: any) => {
          const stageName = step.stage_name || 'Sem estágio';
          acc[stageName] = (acc[stageName] || 0) + 1;
          return acc;
        }, {});
        // console.log(stepsByStage);
      }

      // Atualizar os estados com os dados carregados
      setCampaign(campaignData);
      setFunnelStages(stages);
      setCampaignSteps(steps);
      
      // console.log('Todos os dados carregados com sucesso');
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
      // console.log('Atualizando apenas os passos da campanha');
      const steps = await followUpService.getCampaignSteps(campaignId);
      // console.log(`${steps.length} passos carregados`);
      setCampaignSteps(steps);
    } catch (err: any) {
      console.error('Erro ao carregar passos:', err);
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // Efeito para carregar todos os dados de uma só vez
  useEffect(() => {
    // console.log(`Carregando dados para campanha ${campaignId}`);
    
    // Limpar dados antigos quando o ID da campanha mudar
    setFunnelStages([]);
    setCampaignSteps([]);
    
    // Limpar o cache para garantir dados atualizados
    followUpService.clearCampaignCache(campaignId);
    
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
        console.error('Dados incompletos para criar um novo estágio:', newStep);
        
        const missingFields = [];
        if (!newStep.stage_id) missingFields.push('etapa do funil');
        if (!newStep.template_name) missingFields.push('nome do template');
        if (!newStep.wait_time) missingFields.push('tempo de espera');
        if (!newStep.message) missingFields.push('mensagem');
        
        alert(`Por favor, preencha todos os campos obrigatórios: ${missingFields.join(', ')}`);
        return false;
      }

      // Verificar se a etapa (funnel_stage) existe
      const stageExists = funnelStages.find(stage => stage.id === newStep.stage_id);
      if (!stageExists) {
        console.error(`Etapa de funil com ID ${newStep.stage_id} não encontrada`);
        alert('Erro: A etapa do funil selecionada não existe ou foi removida. Por favor, selecione outra etapa.');
        return false;
      }

      // console.log('Tentando adicionar novo estágio para etapa:', stageExists.name);

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

      // console.log('Dados formatados para API:', stepData);

      // Usar a API POST para criar um novo passo
      try {
        // console.log('Enviando dados para a API:', JSON.stringify(stepData, null, 2));
        const response = await axios.post('/api/follow-up/funnel-steps', stepData);
        // console.log('Resposta da API:', response.data);
        
        if (response.data.success) {
          // console.log('Novo estágio criado com sucesso:', response.data);

          // Atualizar a campanha com o novo estágio
          const updatedStep = response.data.data;
          // console.log(`Estágio criado com ID: ${updatedStep.id} para o funil: ${updatedStep.funnel_stage_id}`);
          
          // Buscar a campanha atual
          const currentCampaign = await followUpService.getCampaign(campaignId);
          
          // Obter os passos atuais da campanha
          let campaignSteps = [];
          if (typeof currentCampaign.steps === 'string') {
            try {
              campaignSteps = JSON.parse(currentCampaign.steps);
            } catch (err) {
              console.error('Erro ao analisar steps da campanha:', err);
              campaignSteps = [];
            }
          } else if (Array.isArray(currentCampaign.steps)) {
            campaignSteps = currentCampaign.steps;
          }
          
          // Adicionar o novo estágio à lista de passos da campanha
          const funnelStage = funnelStages.find(s => s.id === updatedStep.funnel_stage_id);
          const newCampaignStep = {
            id: updatedStep.id,
            stage_id: updatedStep.funnel_stage_id,
            stage_name: funnelStage?.name || 'Estágio desconhecido',
            template_name: updatedStep.template_name,
            wait_time: updatedStep.wait_time,
            message: updatedStep.message_content,
            category: updatedStep.message_category,
            auto_respond: updatedStep.auto_respond
          };
          
          campaignSteps.push(newCampaignStep);
          
          // Atualizar a campanha com os novos passos
          // console.log(`Atualizando campanha ${campaignId} com total de ${campaignSteps.length} passos`);
          await followUpService.updateCampaign(campaignId, {
            name: currentCampaign.name, // Incluir nome obrigatório da campanha
            description: currentCampaign.description || '', // Incluir descrição opcional
            steps: campaignSteps
          });

          // Atualizar os dados na tela
          await fetchAllData();
          return true;
        } else {
          console.error('Erro ao criar estágio:', response.data);
          alert(`Erro: ${response.data.error || 'Falha ao criar estágio'}`);
          return false;
        }
      } catch (err: any) {
        console.error('Erro detalhado na requisição:', err);
        console.error('Dados da requisição que falharam:', stepData);
        if (err.response) {
          console.error('Resposta do servidor:', err.response.data);
          alert(`Erro do servidor: ${err.response.data.error || 'Erro não especificado'}`);
        } else {
          alert(`Erro ao adicionar estágio: ${err.message}`);
        }
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

      // console.log(`Tentando atualizar estágio com índice: ${index}, ID: ${updatedStep.id}`, updatedStep);

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

      // console.log('Dados formatados para API:', stepData);

      // Chamar a função específica para atualizar passo
      const result = await followUpService.updateStep(updatedStep.id, stepData);
      // console.log('Resultado da atualização:', result);

      if (result.success) {
        // Buscar a campanha atual
        const currentCampaign = await followUpService.getCampaign(campaignId);
        
        // Obter os passos atuais da campanha
        let campaignSteps = [];
        if (typeof currentCampaign.steps === 'string') {
          try {
            campaignSteps = JSON.parse(currentCampaign.steps);
          } catch (err) {
            console.error('Erro ao analisar steps da campanha:', err);
            campaignSteps = [];
          }
        } else if (Array.isArray(currentCampaign.steps)) {
          campaignSteps = currentCampaign.steps;
        }
        
        // Encontrar e atualizar o estágio específico na lista de passos da campanha
        const stepIndex = campaignSteps.findIndex((s: any) => s.id === updatedStep.id);
        
        if (stepIndex >= 0) {
          // Atualizar o estágio existente
          const funnelStage = funnelStages.find(s => s.id === stepData.funnel_stage_id);
          campaignSteps[stepIndex] = {
            id: updatedStep.id,
            stage_id: stepData.funnel_stage_id,
            stage_name: funnelStage?.name || 'Estágio desconhecido',
            template_name: stepData.template_name,
            wait_time: stepData.wait_time,
            message: stepData.message_content,
            category: stepData.message_category,
            auto_respond: stepData.auto_respond
          };
          
          // Atualizar a campanha com os passos atualizados
          // console.log(`Atualizando estágio ${updatedStep.id} na campanha ${campaignId}`);
          await followUpService.updateCampaign(campaignId, {
            name: currentCampaign.name, // Incluir nome obrigatório da campanha
            description: currentCampaign.description || '', // Incluir descrição opcional
            steps: campaignSteps
          });
        } else {
          console.warn(`Estágio ${updatedStep.id} não encontrado nos passos da campanha`);
        }

        // Atualizar os dados para refletir as mudanças
        await fetchAllData();
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

      // console.log(`Tentando remover estágio com índice: ${index}, ID: ${step.id}`, step);

      // Confirmar remoção
      if (!confirm(`Tem certeza que deseja remover o estágio "${step.template_name || 'selecionado'}"?`)) {
        return false;
      }

      // Chamar a função específica para excluir passo
      const result = await followUpService.deleteStep(step.id);
      // console.log('Resultado da remoção:', result);

      if (result.success) {
        // Buscar a campanha atual
        const currentCampaign = await followUpService.getCampaign(campaignId);
        
        // Obter os passos atuais da campanha
        let campaignSteps = [];
        if (typeof currentCampaign.steps === 'string') {
          try {
            campaignSteps = JSON.parse(currentCampaign.steps);
          } catch (err) {
            console.error('Erro ao analisar steps da campanha:', err);
            campaignSteps = [];
          }
        } else if (Array.isArray(currentCampaign.steps)) {
          campaignSteps = currentCampaign.steps;
        }
        
        // Filtrar o estágio removido da lista de passos da campanha
        const filteredSteps = campaignSteps.filter((s: any) => s.id !== step.id);
        
        if (filteredSteps.length !== campaignSteps.length) {
          // Atualizar a campanha sem o estágio removido
          // console.log(`Removendo estágio ${step.id} da campanha ${campaignId}`);
          await followUpService.updateCampaign(campaignId, {
            name: currentCampaign.name, // Incluir nome obrigatório da campanha
            description: currentCampaign.description || '', // Incluir descrição opcional
            steps: filteredSteps
          });
        } else {
          console.warn(`Estágio ${step.id} não encontrado nos passos da campanha`);
        }

        // Atualizar os dados para refletir as mudanças
        await fetchAllData();
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
      // Adicionar o ID da campanha ao criar um novo estágio
      const createdStage = await followUpService.createFunnelStage(
        newStage.name,
        newStage.description,
        newStage.order,
        campaignId // Passar o ID da campanha atual
      );

      // console.log('Nova etapa criada para campanha específica:', createdStage);

      // Atualizar apenas a lista de estágios - usando o ID da campanha 
      // para garantir que só obtemos os estágios dessa campanha
      const stages = await followUpService.getFunnelStages(campaignId);
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
      // console.log(`Atualizando etapa ${stageId} da campanha ${campaignId}:`, updatedStage);

      await followUpService.updateFunnelStage(stageId, {
        name: updatedStage.name || '',
        description: updatedStage.description,
        order: updatedStage.order
      });

      // Atualizar apenas a lista de estágios específicos desta campanha
      const stages = await followUpService.getFunnelStages(campaignId);
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
      // console.log(`Preparando para remover a etapa do funil ${stageId}`);
      
      // Primeiro verificar se há passos associados a esta etapa na campanha atual
      const currentSteps = campaignSteps.filter((step: any) => step.stage_id === stageId);
      
      if (currentSteps.length > 0) {
        // console.log(`A etapa ${stageId} tem ${currentSteps.length} passos associados na campanha`);
        
        // Perguntar ao usuário se deseja remover todos os passos junto com a etapa
        if (!confirm(`Esta etapa contém ${currentSteps.length} estágios. Todos eles serão removidos. Deseja continuar?`)) {
          setIsLoadingFunnelStage(false);
          return false;
        }
        
        // Remover cada passo associado à etapa
        // console.log("Removendo passos associados à etapa...");
        for (const step of currentSteps) {
          if (step.id) {
            try {
              // console.log(`Removendo passo ${step.id} da etapa ${stageId}`);
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

      // Atualizar dados diretamente - usando o ID da campanha para garantir 
      // que obtemos apenas os estágios e passos desta campanha específica
      const [stages, updatedSteps] = await Promise.all([
        followUpService.getFunnelStages(campaignId),
        followUpService.getCampaignSteps(campaignId)
      ]);

      setFunnelStages(stages);
      setCampaignSteps(updatedSteps);

      // console.log(`Etapa de funil ${stageId} removida com sucesso da campanha ${campaignId}, dados atualizados`);
      return true;
    } catch (error: any) {
      console.error('Erro ao remover estágio do funil:', error);
      alert(`Erro ao remover etapa: ${error.message || 'Erro desconhecido'}`);
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