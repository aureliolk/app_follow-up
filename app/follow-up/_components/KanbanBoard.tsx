'use client';

import React, { useState } from 'react';
import KanbanColumn from './KanbanColumn';
import { FollowUp } from './FollowUpTable';

export interface FunnelStage {
  id: string;
  name: string;
  order: number;
  description?: string;
}

interface KanbanBoardProps {
  stages: FunnelStage[];
  followUps: FollowUp[];
  isLoading: boolean;
  onMoveClient: (followUpId: string, targetStageId: string) => Promise<void>;
  onClientSelect: (followUp: FollowUp) => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ 
  stages, 
  followUps, 
  isLoading, 
  onMoveClient,
  onClientSelect
}) => {
  const [draggingClient, setDraggingClient] = useState<string | null>(null);

  // Agrupar follow-ups por etapa do funil
  const followUpsByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = followUps.filter(followUp => 
      followUp.current_stage_id === stage.id || 
      followUp.current_stage_name === stage.name
    );
    return acc;
  }, {} as Record<string, FollowUp[]>);

  // Calcular clientes sem etapa definida
  const unassignedFollowUps = followUps.filter(followUp => 
    !followUp.current_stage_id && !followUp.current_stage_name
  );

  if (unassignedFollowUps.length > 0) {
    // Adicionar uma "etapa" para clientes não classificados
    followUpsByStage['unassigned'] = unassignedFollowUps;
  }

  const handleDragStart = (followUpId: string) => {
    setDraggingClient(followUpId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = async (stageId: string) => {
    if (draggingClient) {
      await onMoveClient(draggingClient, stageId);
      setDraggingClient(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex space-x-4 p-4 min-w-max">
        {stages.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            clients={followUpsByStage[stage.id] || []}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(stage.id)}
            onClientSelect={onClientSelect}
          />
        ))}
        
        {unassignedFollowUps.length > 0 && (
          <KanbanColumn
            key="unassigned"
            stage={{ 
              id: 'unassigned', 
              name: 'Não Classificados', 
              order: stages.length + 1 
            }}
            clients={unassignedFollowUps}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop('unassigned')}
            onClientSelect={onClientSelect}
          />
        )}
      </div>
    </div>
  );
};

export default KanbanBoard;