// app/workspace/[slug]/clients/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { Loader2, PlusCircle, Users, Search } from 'lucide-react'; // Ícone Users para o botão, Search para busca
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Importar Input
import ClientList from './components/ClientList';
import ClientFormModal from './components/ClientFormModal';
import ErrorMessage from '@/components/ui/ErrorMessage';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import type { Client } from '@/app/types';
import { useClient } from '@/context/client-context';
import { Card, CardContent } from '@/components/ui/card';

// Definir o número de clientes por página
const CLIENTS_PER_PAGE = 20;

export default function WorkspaceClientsPage() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const {
    clients,
    loadingClients,
    clientsError,
    fetchClients,
    deleteClient,
    clearClientsError,
    hasMoreClients, // <<< Esperado do contexto
    isLoadingMoreClients // <<< Esperado do contexto para loading de "load more"
  } = useClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1); // Reset page on new search
    // A busca será acionada pelo useEffect abaixo
  };

  const loadClients = useCallback(async (page: number, search: string, append: boolean = false) => {
    if (!workspace) return;
    setPageError(null);
    if (page === 1 && !append) { // Limpa erros do contexto apenas na carga inicial ou nova busca
        clearClientsError();
    }
    try {
      // A função fetchClients no contexto precisará ser atualizada para lidar com 'append'
      await fetchClients(workspace.id, search, page, CLIENTS_PER_PAGE, append);
    } catch (err) {
      console.error('ClientsPage: Erro ao chamar fetchClients:', err);
      // O erro já deve estar em clientsError ou ser tratado no contexto
    }
  }, [workspace, fetchClients, clearClientsError]);

  // Efeito para carregar clientes na montagem, mudança de workspace, termo de busca ou página
  useEffect(() => {
    if (workspace && !workspaceLoading) {
      // Carrega a primeira página quando o termo de busca muda ou o workspace é carregado
      loadClients(1, searchTerm, false);
    }
  }, [workspace, workspaceLoading, searchTerm, loadClients]); // Não incluir currentPage aqui para evitar loops com o loadMore


  // Função para carregar mais clientes (infinite scroll)
  const loadMoreClients = () => {
    if (!loadingClients && !isLoadingMoreClients && hasMoreClients && workspace) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage); // Atualiza a página atual
      loadClients(nextPage, searchTerm, true); // Chama loadClients para buscar e anexar
    }
  };
  
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
  const handleDeleteClient = async (clientId: string, skipConfirm?: boolean) => {
     if (!workspace) return;
     if (!skipConfirm) {
       if (!confirm('Tem certeza que deseja excluir este cliente? Todas as conversas e mensagens associadas também serão removidas. Esta ação não pode ser desfeita.')) {
         return;
       }
     }
     setIsDeleting(clientId);
     setPageError(null); // Limpa erro da página
     clearClientsError(); // Limpa erro do contexto
     try {
       await deleteClient(clientId, workspace.id); // <<< Chama a função do contexto
       toast.success('Cliente excluído com sucesso.');
       // Recarregar os clientes da página atual após a exclusão, respeitando o searchterm
       setCurrentPage(1); // Reset to first page after delete or ensure list is refreshed correctly
       loadClients(1, searchTerm, false);
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

      {/* Campo de Busca - Adicionado abaixo do cabeçalho e acima do Erro/Card */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, telefone ou tags:nomedatag"
            className="w-full pl-10 pr-4 py-2 border rounded-lg shadow-sm"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1 ml-1">
          Dica: Use o formato <span className="font-mono bg-muted px-1 rounded">tags:nomedatag</span> para filtrar por tags específicas.
        </p>
      </div>

      {/* Exibe erro geral da página ou do contexto */}
      {displayError && (
          <div className="mb-6"> {/* Adiciona margem abaixo se houver erro */}
              <ErrorMessage message={displayError} onDismiss={() => { setPageError(null); clearClientsError(); }} />
          </div>
      )}

      {/* Card para a Lista de Clientes - Aplicar rounded-xl e shadow-md */}
      <Card className="border-border bg-card shadow-md rounded-xl">
         {/* Opcional: Adicionar CardHeader se desejar um título/descrição para a tabela */}
         {/* <CardHeader>
           <CardTitle>Lista de Clientes</CardTitle>
           <CardDescription>Clientes cadastrados neste workspace.</CardDescription>
         </CardHeader> */}
         <CardContent className="p-0"> {/* Remover padding do CardContent se a tabela já tiver */}
            {/* Usa loadingClients do contexto */}
           {loadingClients && clients.length === 0 && currentPage === 1 ? ( // Mostra spinner inicial apenas na primeira carga da primeira página
             <div className="p-6"> {/* Adicionar padding interno para o spinner */}
                <LoadingSpinner message="Carregando clientes..." />
             </div>
           ) : (
            <>
             {workspace && ( // Renderize ClientList only when workspace is loaded
               <ClientList
                 // clients={clients} // Não precisa passar, ClientList usa o hook useClient()
                 workspaceId={workspace.id} // Now workspace.id is guaranteed to be defined
                 onEdit={handleOpenEditModal}
                 onDelete={handleDeleteClient}
                 deletingId={isDeleting}
                 // Passar a função loadMoreClients e hasMoreClients para o ClientList
                 // para que ele possa adicionar um observer ou botão de "Carregar Mais"
                 loadMoreClients={loadMoreClients}
                 hasMoreClients={hasMoreClients}
                 isLoadingMoreClients={isLoadingMoreClients}
               />
             )}
            </>
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