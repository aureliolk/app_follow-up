// apps/next-app/app/workspace/[slug]/conversations/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios'; // Importar axios
import { useWorkspace } from '@/context/workspace-context';
import ConversationList from './components/ConversationList';
import ConversationDetail from './components/ConversationDetail';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';

// Definir um tipo mais específico para a conversa formatada
interface FormattedConversation {
    id: string;
    status: string; // Ou um Enum se definido
    lastActivity: string;
    client: {
        id: string;
        name: string | null;
        phone_number: string | null;
    } | null;
    lastMessageSnippet: string;
    isAiActive: boolean;
    // followUpStatus?: string; // Adicionar se a API retornar
}

export default function ConversationsPage() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const [conversations, setConversations] = useState<FormattedConversation[]>([]); // Usar tipo específico
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Função para buscar conversas
  const fetchConversations = useCallback(async () => {
    if (!workspace?.id) return;

    setIsLoadingConversations(true);
    setError(null);
    try {
      console.log(`[ConversationsPage] Buscando conversas para workspace: ${workspace.id}`);
      const response = await axios.get(`/api/conversations?workspaceId=${workspace.id}`);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Falha ao buscar conversas');
      }
      setConversations(response.data.data || []);
      console.log(`[ConversationsPage] ${response.data.data?.length || 0} conversas carregadas.`);
    } catch (err: any) {
      console.error("[ConversationsPage] Erro ao buscar conversas:", err);
      setError(err.message || 'Erro ao carregar conversas.');
      setConversations([]); // Limpa em caso de erro
    } finally {
      setIsLoadingConversations(false);
    }
  }, [workspace?.id]); // Depende do workspace.id

  // Busca inicial
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSelectConversation = (id: string) => {
    console.log(`[ConversationsPage] Conversa selecionada: ${id}`);
    setSelectedConversationId(id);
    // TODO: Buscar mensagens e detalhes do follow-up para esta conversa
  };

  // (Restante do JSX do componente page.tsx permanece o mesmo)
   if (workspaceLoading) {
     return <LoadingSpinner message="Carregando workspace..." />;
   }

   if (!workspace) {
     return <ErrorMessage message="Workspace não encontrado." />;
   }

   return (
     <div className="flex h-full border border-border rounded-lg overflow-hidden bg-card">
       {/* Coluna da Lista */}
       <div className="w-1/3 lg:w-1/4 flex-shrink-0 h-full">
         {isLoadingConversations ? (
           <LoadingSpinner message="Carregando conversas..." />
         ) : error ? (
           <ErrorMessage message={error} onDismiss={() => setError(null)} />
         ) : (
           <ConversationList
             conversations={conversations} // Passa os dados formatados
             onSelectConversation={handleSelectConversation}
             selectedConversationId={selectedConversationId}
           />
         )}
       </div>

       {/* Coluna de Detalhes */}
       <div className="flex-grow h-full">
         <ConversationDetail conversationId={selectedConversationId} />
       </div>
     </div>
   );
}