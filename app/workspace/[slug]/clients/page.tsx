// app/workspace/[slug]/clients/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { Loader2, PlusCircle, Users } from 'lucide-react'; // Ícone Users para o botão
import { Button } from '@/components/ui/button';
import ClientList from './components/ClientList';
import ClientFormModal from './components/ClientFormModal';
import ErrorMessage from '@/components/ui/ErrorMessage';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import type { Client } from '@/app/types';
import { useClient } from '@/context/client-context';
import { Card, CardContent } from '@/components/ui/card';

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
      {/* Cabeçalho da página (Título e Botão) - Fora do Card */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1> {/* Ajustado para font-bold */}
          <p className="text-muted-foreground text-sm">Gerencie os clientes do workspace: {workspace.name}</p>
        </div>
        <Button onClick={handleOpenCreateModal} className="w-full sm:w-auto">
          <Users className="h-4 w-4 mr-2" /> {/* Ícone de Users */}
          Novo Cliente
        </Button>
      </div>

      {/* Exibe erro geral da página ou do contexto */}
      {displayError && (
          <div className="mb-6"> {/* Adiciona margem abaixo se houver erro */}
              <ErrorMessage message={displayError} onDismiss={() => { setPageError(null); clearClientsError(); }} />
          </div>
      )}

      {/* Card para a Lista de Clientes */}
      <Card className="border-border bg-card shadow rounded-lg">
         {/* Opcional: Adicionar CardHeader se desejar um título/descrição para a tabela */}
         {/* <CardHeader>
           <CardTitle>Lista de Clientes</CardTitle>
           <CardDescription>Clientes cadastrados neste workspace.</CardDescription>
         </CardHeader> */}
         <CardContent className="p-0"> {/* Remover padding do CardContent se a tabela já tiver */}
            {/* Usa loadingClients do contexto */}
           {loadingClients && clients.length === 0 ? ( // Mostra spinner inicial
             <div className="p-6"> {/* Adicionar padding interno para o spinner */}
                <LoadingSpinner message="Carregando clientes..." />
             </div>
           ) : (
             <ClientList
               // clients={clients} // Não precisa passar, ClientList usa o hook
               onEdit={handleOpenEditModal}
               onDelete={handleDeleteClient}
               deletingId={isDeleting}
             />
           )}
         </CardContent>
      </Card>

      {/* Renderiza o Modal */}
      <ClientFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        initialData={editingClient}
      />
    </div>
  );
}