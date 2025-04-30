'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import KanbanColumn from './KanbanColumn';
import { updateDealStage } from '@/lib/actions/pipelineActions'; 
import type { PipelineStageBasic, DealWithClient } from '@/lib/types/pipeline';
import { toast } from 'react-hot-toast'; // Import toast

interface DealsByStage {
  [stageId: string]: DealWithClient[];
}

interface KanbanBoardProps {
  workspaceId: string;
  initialStages: PipelineStageBasic[];
  initialDeals: DealWithClient[];
}

export default function KanbanBoard({ 
  workspaceId, 
  initialStages, 
  initialDeals 
}: KanbanBoardProps) {
  const [stages, setStages] = useState<PipelineStageBasic[]>(initialStages);
  const [deals, setDeals] = useState<DealsByStage>(() => {
    const dealsByStage: DealsByStage = {};
    initialStages.forEach(stage => {
      dealsByStage[stage.id] = [];
    });
    initialDeals.forEach(deal => {
       if (dealsByStage[deal.stage_id]) {
         dealsByStage[deal.stage_id].push(deal);
       } else {
         console.warn(`[KanbanBoard] Deal ${deal.id} has unknown stage_id ${deal.stage_id}`);
       }
    });
    return dealsByStage;
  });

  // Update state if props change (e.g., after adding a new deal)
  useEffect(() => {
    setStages(initialStages);
    const dealsByStage: DealsByStage = {};
    initialStages.forEach(stage => {
        dealsByStage[stage.id] = [];
    });
    initialDeals.forEach(deal => {
        if (dealsByStage[deal.stage_id]) {
            dealsByStage[deal.stage_id].push(deal);
        } else {
            console.warn(`[KanbanBoard] Deal ${deal.id} has unknown stage_id ${deal.stage_id} during prop update`);
        }
    });
    setDeals(dealsByStage);
  }, [initialStages, initialDeals]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    
    if (!destination || 
        (destination.droppableId === source.droppableId && 
         destination.index === source.index)) {
      return;
    }

    const startStageId = source.droppableId;
    const finishStageId = destination.droppableId;
    
    // Find the moved deal from the current state
    const sourceDeals = deals[startStageId] ?? [];
    const movedDealIndex = sourceDeals.findIndex(deal => deal.id === draggableId);
    if (movedDealIndex < 0) {
      console.error("[KanbanBoard] Could not find moved deal in source column state.");
      toast.error("Erro: Não foi possível encontrar o card movido.");
      return;
    }
    const movedDeal = { ...sourceDeals[movedDealIndex] };

    // Prepare new state for optimistic update
    const newDealsState = { ...deals };
    const newSourceDeals = Array.from(sourceDeals);
    newSourceDeals.splice(movedDealIndex, 1);
    newDealsState[startStageId] = newSourceDeals;

    const newFinishDeals = Array.from(deals[finishStageId] ?? []);
    // IMPORTANT: Update the stage_id on the moved deal object for optimistic rendering
    movedDeal.stage_id = finishStageId; 
    newFinishDeals.splice(destination.index, 0, movedDeal);
    newDealsState[finishStageId] = newFinishDeals;

    // Keep the previous state for potential revert
    const previousDealsState = deals;
    
    // Apply Optimistic Update
    setDeals(newDealsState);
    const toastId = toast.loading('Movendo negociação...'); // Loading toast
    
    // Call API action
    try {
      await updateDealStage(draggableId, finishStageId, workspaceId);
      console.log(`[KanbanBoard] Deal ${draggableId} stage updated via action.`);
      toast.success('Negociação movida com sucesso!', { id: toastId }); // Success toast
    } catch (err) {
      console.error('[KanbanBoard] Erro ao atualizar estágio do deal via action:', err);
      // Revert Optimistic Update on error
      setDeals(previousDealsState);
      const message = err instanceof Error ? err.message : 'Falha ao mover o card.';
      toast.error(`Erro ao mover: ${message}`, { id: toastId }); // Error toast
    }
  };


  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex overflow-x-auto pb-4 gap-4 h-full min-w-full"> {/* Ensure container stretches */}
        {stages.map((stage) => (
          <KanbanColumn 
            key={stage.id}
            stage={stage}
            deals={deals[stage.id] || []} // Pass deals for this specific stage
          />
        ))}
        {stages.length === 0 && (
          <div className="text-muted-foreground p-4">
            Nenhuma etapa encontrada. Crie a primeira etapa nas configurações.
          </div>
        )}
      </div>
    </DragDropContext>
  );
} 