import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import KanbanBoard from './components/KanbanBoard';
// Import actions and types
import { 
  getPipelineStages, 
  getDeals, 
  getClientsForWorkspace // Import new action
} from '@/lib/actions/pipelineActions';
import type { 
  PipelineStageBasic, 
  DealWithClient, 
  ClientBasic // Import new type
} from '@/lib/types/pipeline';
import { AddDealModal } from './components/AddDealModal'; // Import the modal

// Define PageProps type for clarity
interface KanbanPageProps {
  params: { id: string };
}

// Use PageProps type and ensure component is async
export default async function KanbanPage({ params }: KanbanPageProps) {
  const { id: workspaceId } = params;

  // Fetch data on the server
  let stages: PipelineStageBasic[] = [];
  let deals: DealWithClient[] = [];
  let clients: ClientBasic[] = []; // Add state for clients
  let fetchError: string | null = null;

  try {
    // Fetch stages, deals, and clients concurrently
    [stages, deals, clients] = await Promise.all([
      getPipelineStages(workspaceId),
      getDeals(workspaceId),
      getClientsForWorkspace(workspaceId) // Fetch clients
    ]);
  } catch (error) {
    console.error("[KanbanPage] Failed to fetch pipeline/client data:", error);
    fetchError = error instanceof Error ? error.message : "Erro desconhecido ao carregar dados.";
    // Optionally return an error component or display message directly
  }

  return (
    <div className="flex flex-col h-full p-4 md:p-6">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h1 className="text-3xl font-bold text-foreground">Pipeline de Vendas</h1>
        <div className="flex gap-2">
          {/* Pass clients to AddDealModal */}
          <AddDealModal workspaceId={workspaceId} stages={stages} clients={clients}>
            <Button 
              disabled={!!fetchError || stages.length === 0} // Only disable if no stages or error
              title={stages.length === 0 ? "Crie uma etapa primeiro nas Configurações" : clients.length === 0 ? "Nenhum cliente encontrado para criar negociação" : undefined}
            >
              Nova Negociação
            </Button>
          </AddDealModal>
          <Button variant="outline" asChild>
            <Link href={`/workspace/${workspaceId}/kaban/settings`}>
              Configurações
            </Link>
          </Button>
        </div>
      </div>
      
      {/* Render error message or the board */}
      <div className="flex-grow overflow-x-auto pb-4"> {/* Allow horizontal scrolling */}
        {fetchError ? (
          <div className="flex items-center justify-center h-full text-destructive">
            Erro ao carregar dados: {fetchError}
          </div>
        ) : (
          <Suspense fallback={<div className="flex items-center justify-center h-full">Carregando pipeline...</div>}>
            {/* Pass fetched stages and deals to KanbanBoard */}
            <KanbanBoard 
              workspaceId={workspaceId} 
              initialStages={stages} 
              initialDeals={deals} 
            />
          </Suspense>
        )}
      </div>
    </div>
  );
} 