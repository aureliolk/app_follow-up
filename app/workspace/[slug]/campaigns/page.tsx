// app/workspace/[slug]/campaigns/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { followUpService } from '@/app/follow-up/_services/followUpService';
import { Loader2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CampaignList from './components/CampaignList';
import CampaignFormModal from './components/CampaignFormModal';
import ErrorMessage from '@/components/ui/ErrorMessage'; // Componente de erro (se tiver)
import LoadingSpinner from '@/components/ui/LoadingSpinner'; // Componente de loading (se tiver)
import { toast } from 'react-hot-toast'; // Ou outra lib de notificação

// Definir tipo Campaign (ajuste conforme seu schema Prisma/API real)
// --- DEFINIÇÕES DE TIPO CENTRALIZADAS ---
type Campaign = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  created_at: string; // Manter como string se a API retornar assim
  stepsCount?: number;
  activeFollowUps?: number;
  // Campos de IA
  ai_prompt_product_name?: string | null;
  ai_prompt_target_audience?: string | null;
  ai_prompt_pain_point?: string | null;
  ai_prompt_main_benefit?: string | null;
  ai_prompt_tone_of_voice?: string | null;
  ai_prompt_extra_instructions?: string | null;
  ai_prompt_cta_link?: string | null;
  ai_prompt_cta_text?: string | null;
};

// Tipo derivado para o formulário (sem campos não editáveis)
type CampaignFormData = Omit<Campaign, 'id' | 'created_at' | 'stepsCount' | 'activeFollowUps'>;

export default function WorkspaceCampaignsPage() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null); // ID da campanha sendo deletada

  // Função para buscar campanhas
  const fetchCampaigns = useCallback(async () => {
    if (!workspace) return;
    setLoadingData(true);
    setError(null);
    try {
      console.log(`Buscando campanhas para workspace: ${workspace.id}`);
      const fetchedCampaigns = await followUpService.getCampaigns(workspace.id);
       // Ordenar: Ativas primeiro, depois por data de criação decrescente
       const sortedCampaigns = fetchedCampaigns.sort((a, b) => {
        if (a.active !== b.active) {
          return a.active ? -1 : 1; // Ativas vêm primeiro
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // Mais recentes primeiro
      });
      setCampaigns(sortedCampaigns);
      console.log("Campanhas carregadas:", sortedCampaigns);
    } catch (err) {
      console.error('Erro ao carregar campanhas:', err);
      const message = err instanceof Error ? err.message : 'Falha ao carregar campanhas.';
      setError(message);
      toast.error(message);
    } finally {
      setLoadingData(false);
    }
  }, [workspace]);

  // Carregar campanhas inicialmente
  useEffect(() => {
    if (workspace && !workspaceLoading) {
      fetchCampaigns();
    }
     // Limpar o ID do workspace ativo se sair da página
     return () => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('activeWorkspaceId');
      }
    };
  }, [workspace, workspaceLoading, fetchCampaigns]);

  // --- Handlers do Modal ---
  const handleOpenCreateModal = () => {
    setEditingCampaign(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCampaign(null); // Limpa a campanha em edição ao fechar
  };

  // --- Handler de Submissão do Formulário (Criação/Edição) ---
  const handleFormSubmit = async (formData: CampaignFormData) => {
    if (!workspace) return;
    setIsSubmitting(true);
    setError(null);
    try {
      let updatedCampaign;
      if (editingCampaign) {
        // Edição
        console.log(`Atualizando campanha ${editingCampaign.id} com dados:`, formData);
        updatedCampaign = await followUpService.updateCampaign(editingCampaign.id, formData, workspace.id);
        toast.success(`Campanha "${updatedCampaign.data.name}" atualizada!`);
      } else {
        // Criação
        console.log("Criando nova campanha com dados:", formData);
        updatedCampaign = await followUpService.createCampaign(formData, workspace.id);
        toast.success(`Campanha "${updatedCampaign.name}" criada!`);
      }
      await fetchCampaigns(); // Rebusca a lista
      handleCloseModal();
    } catch (err) {
      console.error('Erro ao salvar campanha:', err);
      const message = err instanceof Error ? err.message : 'Falha ao salvar campanha.';
      setError(message); // Mostra erro perto do formulário ou no modal
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Handler de Exclusão ---
  const handleDeleteCampaign = async (campaignId: string) => {
     if (!workspace) return;
     if (!confirm('Tem certeza que deseja excluir esta campanha? Todas as etapas e follow-ups associados também serão removidos. Esta ação não pode ser desfeita.')) {
       return;
     }
     setIsDeleting(campaignId);
     setError(null);
     try {
       console.log(`Excluindo campanha ${campaignId} do workspace ${workspace.id}`);
       // *** Precisamos adicionar deleteCampaign ao followUpService ***
       // await followUpService.deleteCampaign(campaignId, workspace.id);
       // Por enquanto, simulamos a remoção da UI
        setCampaigns(prev => prev.filter(c => c.id !== campaignId));
       toast.success('Campanha excluída com sucesso.'); // Mudar após implementar a API
       console.warn(`Exclusão da campanha ${campaignId} simulada na UI. Implementar API e service.`);
     } catch (err) {
       console.error('Erro ao excluir campanha:', err);
       const message = err instanceof Error ? err.message : 'Falha ao excluir campanha.';
       setError(message);
       toast.error(message);
     } finally {
       setIsDeleting(null);
     }
   };

  // --- Renderização ---
  if (workspaceLoading) {
    return <LoadingSpinner message="Carregando workspace..." />;
  }

  if (!workspace) {
     // Idealmente, o layout já redirecionaria, mas como fallback:
     return <ErrorMessage message="Workspace não encontrado ou você não tem acesso." />;
  }

  return (
    <div className="p-4 md:p-6"> {/* Ajuste padding */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Campanhas de Follow-up</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas campanhas para o workspace: {workspace.name}</p>
        </div>
        <Button onClick={handleOpenCreateModal} className="w-full sm:w-auto">
          <PlusCircle className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {/* Exibe erro geral da página */}
      <ErrorMessage message={error} onDismiss={() => setError(null)} />

      {loadingData ? (
        <LoadingSpinner message="Carregando campanhas..." />
      ) : (
        <CampaignList
          onEdit={handleOpenEditModal}
          onDelete={handleDeleteCampaign}
          deletingId={isDeleting} // Passa o ID que está sendo deletado
        />
      )}

      {/* Renderiza o Modal */}
      <CampaignFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleFormSubmit} 
        initialData={editingCampaign} 
        workspaceId={workspace.id}
        isLoading={isSubmitting}
      />
    </div>
  );
}