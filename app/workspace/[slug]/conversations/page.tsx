// apps/next-app/app/workspace/[slug]/conversations/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWorkspace } from '@/context/workspace-context';
import { useFollowUp } from '@/context/follow-up-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import ConversationList from './components/ConversationList';
import ConversationDetail from './components/ConversationDetail';
import type { ClientConversation } from '@/app/types';
import { Button } from '@/components/ui/button'; // Import Button
import { cn } from '@/lib/utils'; // Corrigido

export default function ConversationsPage() {
  const { workspace, isLoading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { selectedConversation, selectConversation } = useFollowUp(); // Obtém do contexto
  const [conversations, setConversations] = useState<ClientConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // <<< NOVO ESTADO PARA FILTRO >>>
  const [activeFilter, setActiveFilter] = useState<'ATIVAS' | 'CONVERTIDAS' | 'CANCELADAS' | 'COMPLETAS'>('ATIVAS'); // Padrão é Ativas

  // Modificar fetchConversations para aceitar o filtro
  const fetchConversations = useCallback(async (wsId: string, filter: string) => {
    if (!workspaceLoading) { setIsLoading(true); }
    setError(null);
    console.log(`[ConversationsPage] Fetching conversations for ws: ${wsId}, filter: ${filter}`);
    try {
      const response = await axios.get<{ success: boolean, data?: ClientConversation[], error?: string }>(
        '/api/conversations',
        { params: { workspaceId: wsId, status: filter } } // <<< PASSA O FILTRO
      );
      // ... (resto da lógica de tratamento da resposta e seleção da conversa) ...
       if (!response.data.success || !response.data.data) throw new Error(response.data.error || 'Falha ao carregar conversas');
       setConversations(response.data.data);

       // Lógica de seleção/desseleção ao recarregar a lista filtrada
       const currentSelectedId = selectedConversation?.id;
       const listHasSelected = response.data.data.some(c => c.id === currentSelectedId);

       if (currentSelectedId && !listHasSelected) {
           // Se a selecionada não está mais na lista filtrada, desmarca
           selectConversation(null);
       } else if (!currentSelectedId && response.data.data.length > 0) {
           // Se nada selecionado e lista não vazia, seleciona a primeira
           selectConversation(response.data.data[0]);
       }
       // Se a selecionada ainda está na lista, não faz nada para manter a seleção

    } catch (err: any) { 
      console.error("[ConversationsPage] Erro ao buscar conversas:", err);
        const message = err.response?.data?.error || err.message || 'Erro ao buscar conversas.';
        setError(message);
        setConversations([]);
        selectConversation(null); // Desmarca em caso de erro
    }
      finally { if (!workspaceLoading) { setIsLoading(false); } }
  }, [workspaceLoading, selectConversation, selectedConversation]); // Removi workspaceContext.workspace?.id

  // Modificar useEffect para usar o filtro ativo
  useEffect(() => {
    const wsId = workspace?.id;
    if (wsId && !workspaceLoading) {
        console.log(`[ConversationsPage] useEffect triggered: Fetching for wsId ${wsId} with filter ${activeFilter}`);
        fetchConversations(wsId, activeFilter); // <<< PASSA O FILTRO ATIVO
    }
    // ... (resto da lógica do useEffect) ...
  }, [workspace?.id, workspaceLoading, workspaceError, activeFilter, fetchConversations, selectConversation]); // <<< ADICIONA activeFilter como dependência


  // --- Renderização ---
  if (isLoading || workspaceLoading) { return <LoadingSpinner message="Carregando..." /> }
  const displayError = error || workspaceError;
  if (displayError) {  return <ErrorMessage message={displayError} /> }

  const filterOptions: typeof activeFilter[] = ['ATIVAS', 'CONVERTIDAS', 'CANCELADAS', 'COMPLETAS'];

  return (
    <div className="flex flex-col h-full"> {/* Alterado para flex-col */}
      {/* <<< ADICIONADO HEADER COM FILTROS >>> */}
      <div className="p-3 border-b border-border flex-shrink-0 bg-card/30 dark:bg-background">
         <div className="flex items-center space-x-2">
           <span className="text-sm font-medium text-muted-foreground">Mostrar:</span>
           {filterOptions.map(filter => (
               <Button
                   key={filter}
                   variant={activeFilter === filter ? "secondary" : "ghost"} // Destaca o ativo
                   size="sm"
                   onClick={() => {
                       if (activeFilter !== filter) {
                            setActiveFilter(filter);
                            selectConversation(null); // Desmarca ao mudar filtro
                       }
                   }}
                   className={cn("h-8 px-3", activeFilter === filter ? "bg-primary/15 text-primary" : "text-muted-foreground")}
               >
                   {filter.charAt(0) + filter.slice(1).toLowerCase()}
               </Button>
           ))}
         </div>
      </div>

      {/* Container Flex principal para as colunas */}
      <div className="flex flex-grow overflow-hidden"> {/* Adicionado flex-grow e overflow-hidden */}
        {/* Coluna Esquerda */}
        <div className="w-full md:w-1/3 lg:w-1/4 border-r border-border overflow-y-auto bg-card/50 dark:bg-background flex-shrink-0">
          {/* Mostra loading da lista */}
          {isLoading && conversations.length === 0 && (
             <div className="p-4"><LoadingSpinner size="small"/>asda</div>
          )}
          <ConversationList
            conversations={conversations}
            onSelectConversation={selectConversation}
            selectedConversationId={selectedConversation?.id}
          />
          {!isLoading && conversations.length === 0 && !error && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                  Nenhuma conversa encontrada para o filtro "{activeFilter.toLowerCase()}".
              </div>
          )}
        </div>

        {/* Coluna Direita */}
        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col bg-background">
          {/* Passa a selectedConversation do contexto */}
          <ConversationDetail />
        </div>
      </div>
    </div>
  );
}