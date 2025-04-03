// app/workspace/[slug]/clients/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '../../../../../../apps/next-app/context/workspace-context';
import { Loader2, PlusCircle, Users } from 'lucide-react'; // Ícone Users para o botão
import { Button } from '../../../../../../apps/next-app/components/ui/button';
import ClientList from './components/ClientList';
import ClientFormModal from './components/ClientFormModal';
import ErrorMessage from '../../../../../../apps/next-app/components/ui/ErrorMessage';
import LoadingSpinner from '../../../../../../apps/next-app/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import type { Client } from '../../../../../../apps/next-app/app/types';
import { useClient } from '../../../../../../apps/next-app/context/client-context'; // <<< Usar hook do Cliente

export default function WorkspaceClientsPage() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const {
    clients,          // <<< Usar estado do contexto
    loadingClients,   // <<< Usar loading do contexto
    clientsError,     // <<< Usar erro do contexto
    fetchClients,     // <<< Usar função do contexto
    deleteClient,     // <<< Usar função do contexto
    clearClientsError // <<< Função para limpar erro
  } = useClient();

  // Estado do Modal e Deleção permanecem locais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null); // Para erros específicos da página (deleção)

  // Função para buscar clientes (chama o contexto)
  const loadClients = useCallback(async () => {
    if (!workspace) return;
    setPageError(null); // Limpa erros da página antes de buscar
    clearClientsError(); // Limpa erros do contexto
    try {
      console.log(`ClientsPage: Chamando fetchClients do contexto para workspace: ${workspace.id}`);
      await fetchClients(workspace.id);
      console.log("ClientsPage: fetchClients concluído.");
    } catch (err) {
      console.error('ClientsPage: Erro ao chamar fetchClients do contexto:', err);
      // O erro já deve estar em clientsError
    }
  }, [workspace, fetchClients, clearClientsError]); // Adicionar clearClientsError

  // Carregar clientes inicialmente ou quando o workspace mudar
  useEffect(() => {
    if (workspace && !workspaceLoading) {
      loadClients();
    }
    // Cleanup opcional
    // return () => { /* ... */ };
  }, [workspace, workspaceLoading, loadClients]); // Usar loadClients

  // --- Handlers do Modal ---
  const handleOpenCreateModal = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (client: Client) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
  };

  // --- Handler de Exclusão (usa contexto) ---
  const handleDeleteClient = async (clientId: string) => {
     if (!workspace) return;
     if (!confirm('Tem certeza que deseja excluir este cliente? Todas as conversas e mensagens associadas também serão removidas. Esta ação não pode ser desfeita.')) {
       return;
     }
     setIsDeleting(clientId);
     setPageError(null); // Limpa erro da página
     clearClientsError(); // Limpa erro do contexto
     try {
       console.log(`ClientsPage: Chamando deleteClient do contexto para ID: ${clientId}`);
       await deleteClient(clientId, workspace.id); // <<< Chama a função do contexto
       toast.success('Cliente excluído com sucesso.');
       // A lista deve ser atualizada automaticamente pelo contexto
     } catch (err: any) {
       console.error('ClientsPage: Erro ao excluir cliente via contexto:', err);
       const message = err.response?.data?.error || err.message || 'Falha ao excluir cliente.';
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
  const displayError = pageError || clientsError;

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-muted-foreground text-sm">Gerencie os clientes do workspace: {workspace.name}</p>
        </div>
        <Button onClick={handleOpenCreateModal} className="w-full sm:w-auto">
          <Users className="h-4 w-4 mr-2" /> {/* Ícone de Users */}
          Novo Cliente
        </Button>
      </div>

      {/* Exibe erro geral da página ou do contexto */}
      <ErrorMessage message={displayError} onDismiss={() => { setPageError(null); clearClientsError(); }} />

       {/* Usa loadingClients do contexto */}
      {loadingClients && clients.length === 0 ? ( // Mostra spinner inicial
        <LoadingSpinner message="Carregando clientes..." />
      ) : (
        <ClientList
          // clients={clients} // Não precisa passar, ClientList usa o hook
          onEdit={handleOpenEditModal}
          onDelete={handleDeleteClient}
          deletingId={isDeleting}
        />
      )}

      {/* Renderiza o Modal */}
      <ClientFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        initialData={editingClient}
      />
    </div>
  );
}