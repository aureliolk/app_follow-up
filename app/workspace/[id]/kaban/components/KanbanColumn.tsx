'use client';

import { Droppable } from '@hello-pangea/dnd';
import DealCard from './DealCard'; 
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { PipelineStageBasic, DealWithClient } from '@/lib/types/pipeline';

interface KanbanColumnProps {
  stage: PipelineStageBasic;
  deals: DealWithClient[];
}

export default function KanbanColumn({ stage, deals }: KanbanColumnProps) {
  return (
    <div 
      className="flex-shrink-0 w-72 rounded-lg shadow-sm bg-muted/40 flex flex-col h-full" // Let board control height
    >
      {/* Column Header */}
      <div 
        className="p-3 font-semibold text-sm sticky top-0 bg-muted/60 backdrop-blur-sm z-10 rounded-t-lg border-b"
        style={{ borderTop: `3px solid ${stage.color || '#cccccc'}` }} 
      >
        {stage.name} 
        <span className="ml-2 font-normal text-xs text-muted-foreground">({deals.length})</span>
      </div>
      
      {/* Droppable Area for Deals */}
      <Droppable droppableId={stage.id} type="DEAL"> 
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            // Enable vertical scrolling within the column content area
            className={`flex-grow p-2 overflow-y-auto transition-colors duration-200 ease-in-out ${snapshot.isDraggingOver ? 'bg-primary/10' : ''}`}
            style={{ minHeight: '100px' }} // Ensure droppable area has some height
          >
            {deals.length > 0 ? (
              deals.map((deal, index) => (
                <DealCard 
                  key={deal.id} 
                  deal={deal} 
                  index={index} 
                />
              ))
            ) : (
              // Optional: Placeholder when column is empty
              !snapshot.isDraggingOver && (
                  <div className="text-center text-xs text-muted-foreground mt-4 p-2">
                      Arraste cards para esta etapa.
                  </div>
              )
            )}
            {provided.placeholder} {/* Placeholder for dragging space */}
          </div>
        )}
      </Droppable>
    </div>
  );
} 