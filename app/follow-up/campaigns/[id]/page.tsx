//app/follow-up/campaigns/[id]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { ErrorMessage, Footer, MainNavigation } from '../../campaigns/_components/index';
import CampaignFormHook from '../../campaigns/_components/CampaignFormHook';
import Link from 'next/link';
import followUpService from '../../_services/followUpService';
import { toast } from 'react-hot-toast';

// Tipo simplificado para os dados da campanha
interface CampaignFormData {
  name: string;
  description: string;
  steps: any[];
}

export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Array.isArray(params.id) ? params.id[0] : params.id as string;

  // Estados simplificados
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dados da campanha
  const [campaignData, setCampaignData] = useState<any>(null);
  
  // Inicializar react-hook-form
  const methods = useForm<CampaignFormData>({
    defaultValues: {
      name: '',
      description: '',
      steps: []
    }
  });

  // Função para carregar os dados da campanha
  const fetchCampaignData = async () => {
    console.log('🔄 Recarregando dados da campanha...');
    setIsLoading(true);
    setError(null);

    try {
      // Forçar a limpeza completa do cache
      followUpService.clearCampaignCache();
      
      // Esperar um pequeno tempo para garantir que as alterações estão no banco de dados
      // Isso é importante quando há transações recentes
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Carregar a campanha - esta é a única chamada de API necessária
      // O parâmetro timestamp está sendo adicionado na função getCampaign para evitar cache do navegador
      const data = await followUpService.getCampaign(campaignId);
      
      console.log('✅ Dados da campanha carregados:', data.name, 'com', data.steps?.length || 0, 'estágios');
      
      // Armazenar os dados da campanha
      setCampaignData(data);
      // Atualizar o formulário com os dados carregados
      methods.reset({
        name: data.name,
        description: data.description || '',
        steps: Array.isArray(data.steps) ? data.steps : []
      });
    } catch (err: any) {
      console.error('Erro ao carregar dados da campanha:', err);
      setError(err.message || 'Erro ao carregar dados da campanha');
      toast.error('Falha ao carregar campanha. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  // Carregar dados quando a página é montada
  useEffect(() => {
    fetchCampaignData();
  }, [campaignId]);

  // Função para remover um estágio
  const handleRemoveStep = async (index: number, step?: any): Promise<boolean> => {
    if (!campaignData || !campaignData.steps) return false;
    
    // Obter o estágio a ser removido
    const stepToRemove = step || campaignData.steps[index];
    
    // Validar o estágio
    if (!stepToRemove || !stepToRemove.id) {
      toast.error('Erro: Estágio inválido ou sem identificação');
      return false;
    }

    // Confirmar remoção
    if (!confirm(`Tem certeza que deseja remover o estágio "${stepToRemove.template_name}" da etapa "${stepToRemove.stage_name}"?`)) {
      return false;
    }

    setIsSubmitting(true);

    try {
      // Limpar o cache antes da operação
      followUpService.clearCampaignCache();
      
      console.log(`🗑️ Removendo estágio ID: ${stepToRemove.id}`);
      
      // Excluir o estágio no servidor
      const success = await followUpService.deleteStep(stepToRemove.id);
      
      if (success) {
        console.log('✅ Estágio removido com sucesso, recarregando dados...');
        // Limpar cache novamente
        followUpService.clearCampaignCache();
        
        // Recarregar a campanha para obter os dados atualizados com um delay
        setTimeout(async () => {
          await fetchCampaignData();
          toast.success('Estágio removido com sucesso');
        }, 500);
        
        return true;
      } else {
        toast.error('Falha ao remover estágio');
        return false;
      }
    } catch (error) {
      console.error('Erro ao remover estágio:', error);
      toast.error('Ocorreu um erro ao remover o estágio');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para adicionar um estágio
  const handleAddStep = async (newStep: any): Promise<boolean> => {
    if (!newStep.stage_id || !newStep.template_name || !newStep.wait_time || !newStep.message) {
      const missingFields = [];
      if (!newStep.stage_id) missingFields.push('etapa do funil');
      if (!newStep.template_name) missingFields.push('nome do template');
      if (!newStep.wait_time) missingFields.push('tempo de espera');
      if (!newStep.message) missingFields.push('mensagem');
      
      toast.error(`Por favor, preencha todos os campos obrigatórios: ${missingFields.join(', ')}`);
      return false;
    }

    setIsSubmitting(true);

    try {
      // Limpar o cache antes da operação
      followUpService.clearCampaignCache();
      
      // Mapear dados para o formato esperado pela API
      const stepData = {
        funnel_stage_id: newStep.stage_id,
        campaign_id: campaignId, // Adicionar o ID da campanha explicitamente
        name: newStep.template_name,
        template_name: newStep.template_name,
        wait_time: newStep.wait_time,
        message_content: newStep.message,
        message_category: newStep.category || 'Utility',
        auto_respond: newStep.auto_respond !== undefined ? newStep.auto_respond : true
      };

      // Adicionar o estágio no servidor
      const response = await followUpService.createStep(stepData);
      
      if (response.success) {
        console.log('✅ Estágio adicionado com sucesso, recarregando dados...');
        // Limpar cache novamente
        followUpService.clearCampaignCache();
        
        // Recarregar a campanha para obter os dados atualizados com um delay
        // O delay ajuda a garantir que o banco de dados terminou de processar a mudança
        setTimeout(async () => {
          await fetchCampaignData();
          toast.success('Estágio adicionado com sucesso');
        }, 500);
        
        return true;
      } else {
        toast.error('Falha ao adicionar estágio');
        return false;
      }
    } catch (error) {
      console.error('Erro ao adicionar estágio:', error);
      toast.error('Ocorreu um erro ao adicionar o estágio');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para atualizar um estágio
  const handleUpdateStep = async (index: number, updatedStep: any): Promise<boolean> => {
    if (!updatedStep.id) {
      toast.error('Erro: Estágio sem identificação não pode ser atualizado');
      return false;
    }

    setIsSubmitting(true);

    try {
      // Limpar o cache antes da operação
      followUpService.clearCampaignCache();
      
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

      console.log('⚡ Iniciando processo de edição do estágio');

      // Atualizar o estágio no servidor
      const response = await followUpService.updateStep(updatedStep.id, stepData);

      console.log('📋 Resposta da API:', response);
      
      if (response.success) {
        console.log('✅ Estágio atualizado com sucesso, recarregando dados...');
        // Limpar cache novamente
        followUpService.clearCampaignCache();
        
        // Recarregar a campanha para obter os dados atualizados com um delay
        setTimeout(async () => {
          await fetchCampaignData();
          toast.success('Estágio atualizado com sucesso');
        }, 500);
        
        return true;
      } else {
        toast.error('Falha ao atualizar estágio');
        return false;
      }
    } catch (error) {
      console.error('Erro ao atualizar estágio:', error);
      toast.error('Ocorreu um erro ao atualizar o estágio');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para adicionar uma etapa do funil
  const handleAddFunnelStage = async (newStage: any): Promise<boolean> => {
    setIsSubmitting(true);
    
    try {
      // Adicionar etapa vinculada à campanha
      await followUpService.createFunnelStage(
        newStage.name,
        newStage.description,
        newStage.order,
        campaignId
      );

      // Recarregar os dados da campanha
      await fetchCampaignData();
      toast.success('Etapa do funil adicionada com sucesso');
      return true;
    } catch (error) {
      console.error('Erro ao adicionar etapa do funil:', error);
      toast.error('Falha ao adicionar etapa do funil');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para atualizar uma etapa do funil
  const handleUpdateFunnelStage = async (stageId: string, updatedStage: any): Promise<boolean> => {
    if (!updatedStage.name) {
      toast.error('Nome da etapa é obrigatório');
      return false;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log('Atualizando estágio do funil:', { 
        id: stageId, 
        ...updatedStage 
      });
      
      // Limpar o cache antes da operação
      followUpService.clearCampaignCache();
      
      // Chamar a API com todos os dados necessários
      await followUpService.updateFunnelStage(stageId, {
        name: updatedStage.name,
        description: updatedStage.description || null,
        order: updatedStage.order || 1 // Garantir que a ordem seja um número válido
      });
      
      // Limpar o cache novamente depois da operação
      followUpService.clearCampaignCache();
      
      // Esperar um pouco para garantir que as alterações foram processadas
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Recarregar os dados da campanha
      await fetchCampaignData();
      toast.success('Etapa do funil atualizada com sucesso');
      return true;
    } catch (error) {
      console.error('Erro ao atualizar etapa do funil:', error);
      toast.error('Falha ao atualizar etapa do funil');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Função para remover uma etapa do funil
  const handleRemoveFunnelStage = async (stageId: string): Promise<boolean> => {
    if (!campaignData || !campaignData.steps) return false;
    
    // Verificar se há passos associados a esta etapa
    const stepsInStage = campaignData.steps.filter((step: any) => step.stage_id === stageId);
    
    if (stepsInStage.length > 0) {
      // Confirmar com o usuário
      if (!confirm(`Esta etapa contém ${stepsInStage.length} estágios. Todos eles serão removidos. Deseja continuar?`)) {
        return false;
      }
    }
    
    setIsSubmitting(true);
    
    try {
      // Remover a etapa do funil
      await followUpService.deleteFunnelStage(stageId);
      
      // Recarregar dados da campanha
      await fetchCampaignData();
      toast.success('Etapa do funil removida com sucesso');
      return true;
    } catch (error: any) {
      console.error('Erro ao remover etapa do funil:', error);
      toast.error(`Falha ao remover etapa: ${error.message || 'Erro desconhecido'}`);
      return false;
    } finally {
      setIsSubmitting(false);
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
        toast.success('Campanha atualizada com sucesso!');
        // Recarregar os dados para garantir consistência
        await fetchCampaignData();
      } else {
        toast.error('Falha ao atualizar campanha');
      }
    } catch (error) {
      console.error('Erro ao atualizar campanha:', error);
      setError('Erro ao atualizar campanha');
      toast.error('Falha ao salvar alterações');
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

  // Se não houver dados da campanha
  if (!campaignData) {
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
            <h1 className="text-2xl font-bold">Campanha não encontrada</h1>
          </div>
          <div className="bg-red-900/50 border border-red-500 text-white p-4 rounded">
            Não foi possível carregar os dados da campanha. Verifique se o ID é válido.
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
            Editar Campanha: {campaignData.name}
          </h1>
        </div>

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

        <FormProvider {...methods}>
          <CampaignFormHook
            funnelStages={campaignData.stages || []}
            campaignSteps={campaignData.steps || []}
            onSubmit={onSubmit}
            onCancel={() => router.push('/follow-up/campaigns')}
            isLoading={isSubmitting}
            onAddStep={handleAddStep}
            onUpdateStep={handleUpdateStep}
            onRemoveStep={handleRemoveStep}
            onAddFunnelStage={handleAddFunnelStage}
            onUpdateFunnelStage={handleUpdateFunnelStage}
            onRemoveFunnelStage={handleRemoveFunnelStage}
            onRefreshCampaign={fetchCampaignData}
            campaignId={campaignId}
          />
        </FormProvider>
      </main>

      <Footer />
    </div>
  );
}