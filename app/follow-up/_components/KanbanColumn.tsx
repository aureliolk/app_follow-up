'use client';

import React from 'react';
import { FollowUp } from './FollowUpTable';
import { FunnelStage } from './KanbanBoard';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  stage: FunnelStage;
  clients: FollowUp[];
  onDragStart: (followUpId: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: () => void;
  onClientSelect: (followUp: FollowUp) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  stage,
  clients,
  onDragStart,
  onDragOver,
  onDrop,
  onClientSelect
}) => {
  return (
    <div 
      className="flex-shrink-0 w-80 bg-gray-800 rounded-lg overflow-hidden"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="p-3 border-b border-gray-700 bg-gray-700">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-white">{stage.name}</h3>
          <span className="px-2 py-1 bg-gray-600 rounded-full text-xs text-white">
            {clients.length}
          </span>
        </div>
        {stage.description && (
          <p className="text-xs text-gray-400 mt-1">{stage.description}</p>
        )}
      </div>
      
      <div className="p-2 max-h-[calc(100vh-220px)] overflow-y-auto">
        {clients.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-sm">
            Nenhum cliente nesta etapa
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map(client => (
              <KanbanCard
                key={client.id}
                followUp={client}
                onDragStart={() => onDragStart(client.id)}
                onClick={() => onClientSelect(client)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default KanbanColumn;