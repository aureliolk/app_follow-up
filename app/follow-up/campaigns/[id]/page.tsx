// app/follow-up/campaigns/[id]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ErrorMessage, Footer } from '../../_components';
import MainNavigation from '../../_components/MainNavigation';
import { CampaignForm } from '../../_components';
import Link from 'next/link';
import followUpService from '../../_services/followUpService';
import { Campaign, CampaignStep, FunnelStage } from '../../_types';

// Componente principal de edição de campanha
export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Array.isArray(params.id) ? params.id[0] : params.id as any;
  
  const [campaign, setCampaign] = useState<Campaign | null >(null);
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
      
      setCampaign(campaignData );
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
      
      // Atualizar todos os dados de uma vez após o salvamento
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
      // Buscar a campanha atual para obter os passos existentes
      const currentCampaign = await followUpService.getCampaign(campaignId);
      
      // Criar uma nova lista de passos incluindo o novo
      const updatedSteps = [...(currentCampaign.steps || []), newStep];
      
      // Atualizar a campanha com a nova lista de passos
      await followUpService.updateCampaign(campaignId, {
        ...currentCampaign,
        steps: updatedSteps
      });
      
      // Atualizar dados locais
      fetchAllData();
      
      return true;
    } catch (error) {
      console.error('Erro ao adicionar estágio:', error);
      return false;
    }
  };
  
  // Função para atualizar um estágio (passo) existente
  const handleUpdateStep = async (index: number, updatedStep: any) => {
    try {
      // Buscar a campanha atual para obter os passos existentes
      const currentCampaign = await followUpService.getCampaign(campaignId);
      
      // Verificar se o índice é válido
      if (!currentCampaign.steps || index >= currentCampaign.steps.length) {
        console.error('Índice do estágio inválido');
        return false;
      }
      
      // Atualizar o passo específico
      const updatedSteps = [...currentCampaign.steps];
      updatedSteps[index] = updatedStep;
      
      // Atualizar a campanha com a lista de passos atualizada
      await followUpService.updateCampaign(campaignId, {
        ...currentCampaign,
        steps: updatedSteps
      });
      
      // Atualizar dados locais
      fetchAllData();
      
      return true;
    } catch (error) {
      console.error('Erro ao atualizar estágio:', error);
      return false;
    }
  };
  
  // Função para remover um estágio (passo)
  const handleRemoveStep = async (index: number, step: any) => {
    try {
      console.log(`Removendo estágio no índice ${index}:`, step);
      
      // Buscar a campanha atual para obter os passos existentes
      const currentCampaign = await followUpService.getCampaign(campaignId);
      console.log('Campanha atual:', currentCampaign);
      
      // Verificar se a campanha tem passos
      if (!currentCampaign.steps || !Array.isArray(currentCampaign.steps)) {
        console.error('Campanha não tem passos ou formato inválido');
        return false;
      }
      
      // Verificar se o índice é válido
      if (index < 0 || index >= currentCampaign.steps.length) {
        console.error(`Índice do estágio inválido: ${index} (total: ${currentCampaign.steps.length})`);
        
        // Tentar encontrar o estágio pelo ID como fallback
        if (step.id) {
          const stepIndex = currentCampaign.steps.findIndex((s: any) => s.id === step.id);
          if (stepIndex !== -1) {
            console.log(`Encontrado índice pelo ID: ${stepIndex}`);
            index = stepIndex;
          } else {
            return false;
          }
        } else {
          return false;
        }
      }
      
      // Remover o passo específico
      const updatedSteps = [...currentCampaign.steps];
      updatedSteps.splice(index, 1);
      
      console.log(`Atualizando campanha após remoção. Total de passos: ${updatedSteps.length}`);
      
      // Atualizar a campanha com a lista de passos atualizada
      await followUpService.updateCampaign(campaignId, {
        ...currentCampaign,
        steps: updatedSteps
      });
      
      // Atualizar dados locais
      await fetchAllData();
      
      return true;
    } catch (error) {
      console.error('Erro ao remover estágio:', error);
      return false;
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
        
        {error && <ErrorMessage message={error} onClose={() => setError(null)} />}
        
        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
          </div>
        ) : campaign ? (
          <>
            {/* Removemos as abas de navegação, já que o formulário agora contém as etapas integradas */}
            
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