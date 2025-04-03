// app/workspace/[slug]/campaigns/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '@/apps/next-app/context/workspace-context';
// import { followUpService } from '@/app/follow-up/_services/followUpService'; // <<< REMOVER importação direta do service
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Button } from '@/apps/next-app/components/ui/button';
import CampaignList from './components/CampaignList';
import CampaignFormModal from './components/CampaignFormModal';
import ErrorMessage from '@/apps/next-app/components/ui/ErrorMessage';
import LoadingSpinner from '@/apps/next-app/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import type { Campaign } from '@/apps/next-app/app/types'; // <<< Usar tipo centralizado
import { useFollowUp } from '@/apps/next-app/context/follow-up-context'; // <<< Importar hook do contexto

// Tipos Campaign e CampaignFormData não são mais necessários aqui, pois vêm de @/app/types

export default function WorkspaceCampaignsPage() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const {
    campaigns, // <<< Usar estado do contexto
    loadingCampaigns, // <<< Usar estado de loading do contexto
    campaignsError, // <<< Usar estado de erro do contexto
    fetchCampaigns, // <<< Usar função do contexto
    deleteCampaign, // <<< Usar função do contexto
  } = useFollowUp();

  // Estado do Modal permanece local da página
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  // const [isSubmitting, setIsSubmitting] = useState(false); // REMOVIDO (Modal controla isso)
  const [isDeleting, setIsDeleting] = useState<string | null>(null); // MANTIDO (para UI de deleção)
  const [pageError, setPageError] = useState<string | null>(null); // MANTIDO (para erros de deleção, etc.)

  // Função para buscar campanhas (agora chama o contexto)
  const loadCampaigns = useCallback(async () => {
    if (!workspace) return;
    setPageError(null); // Limpa erros da página antes de buscar
    try {
      console.log(`Page: Chamando fetchCampaigns do contexto para workspace: ${workspace.id}`);
      await fetchCampaigns(workspace.id);
      console.log("Page: fetchCampaigns concluído.");
    } catch (err) {
      // O contexto já deve definir `campaignsError`, mas podemos logar ou definir `pageError` se necessário
      console.error('Page: Erro ao chamar fetchCampaigns do contexto:', err);
      // setPageError(err instanceof Error ? err.message : 'Falha ao carregar campanhas.');
    }
  }, [workspace, fetchCampaigns]); // Adicionar fetchCampaigns às dependências

  // Carregar campanhas inicialmente ou quando o workspace mudar
  useEffect(() => {
    if (workspace && !workspaceLoading) {
      loadCampaigns();
    }
    // Cleanup opcional
    // return () => { /* ... */ };
  }, [workspace, workspaceLoading, loadCampaigns]); // Usar loadCampaigns

  // --- Handlers do Modal (sem mudanças) ---
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
    setEditingCampaign(null);
  };

  // --- handleFormSubmit REMOVIDO ---

  // --- Handler de Exclusão (agora usa contexto) ---
  const handleDeleteCampaign = async (campaignId: string) => {
     if (!workspace) return;
     if (!confirm('Tem certeza que deseja excluir esta campanha? Todas as etapas e follow-ups associados também serão removidos. Esta ação não pode ser desfeita.')) {
       return;
     }
     setIsDeleting(campaignId);
     setPageError(null);
     try {
       console.log(`Page: Chamando deleteCampaign do contexto para ID: ${campaignId}`);
       await deleteCampaign(campaignId, workspace.id); // <<< Chama a função do contexto
       toast.success('Campanha excluída com sucesso.');
       // A lista deve ser atualizada automaticamente pelo contexto
     } catch (err: any) {
       console.error('Page: Erro ao excluir campanha via contexto:', err);
       const message = err.response?.data?.error || err.response?.data?.message || err.message || 'Falha ao excluir campanha.';
       setPageError(message); // Exibe erro na página
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
     return <ErrorMessage message="Workspace não encontrado ou você não tem acesso." />;
  }

  // Exibe erro geral da página ou erro do contexto
  const displayError = pageError || campaignsError;

  return (
    <div className="p-4 md:p-6">
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

      {/* Exibe erro geral da página ou do contexto */}
      <ErrorMessage message={displayError} onDismiss={() => { setPageError(null); /* O erro do contexto deve ser limpo por ele */ }} />

       {/* Usa loadingCampaigns do contexto */}
      {loadingCampaigns && campaigns.length === 0 ? ( // Mostra spinner inicial
        <LoadingSpinner message="Carregando campanhas..." />
      ) : (
        <CampaignList
          // Não precisa mais passar `campaigns` aqui se CampaignList usar o hook useFollowUp
          onEdit={handleOpenEditModal}
          onDelete={handleDeleteCampaign}
          deletingId={isDeleting}
        />
      )}

      {/* Renderiza o Modal SEM onSubmit e isLoading */}
      <CampaignFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        initialData={editingCampaign}
        // workspaceId={workspace.id} // REMOVIDO
      />
    </div>
  );
}