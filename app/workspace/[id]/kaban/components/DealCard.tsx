'use client';

import { useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, StickyNote, CheckSquare } from 'lucide-react';
import type { DealWithClient } from '@/lib/types/pipeline'; // Import the correct type
import { useRouter } from 'next/navigation'; // IMPORT useRouter
import { useConversationContext } from '@/context/ConversationContext'; // IMPORT ConversationContext
import { toast } from 'react-hot-toast'; // IMPORT toast for error handling
// import DealDetailModal from './DealDetailModal'; // Placeholder for detail modal

interface DealCardProps {
  deal: DealWithClient; // Use the imported type
  index: number;
}

// Helper to format currency (consider moving to lib/utils if used elsewhere)
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

export default function DealCard({ deal, index }: DealCardProps) {
  const router = useRouter(); // INIT router
  const { selectConversationForClient } = useConversationContext(); // GET selectConversationForClient from context

  // REMOVE Modal state and functions
  // const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  // const openDetailModal = () => { ... };
  // const closeDetailModal = () => { ... };

  const handleCardClick = async () => {
    if (!deal.client?.id || !deal.workspace_id) {
      toast.error("Dados do cliente ou workspace ausentes no deal.");
      console.warn("[DealCard] Client ID or Workspace ID missing from deal:", deal);
      return;
    }
    
    console.log(`[DealCard] Card clicado. Tentando navegar para conversa do cliente: ${deal.client.id} (Deal: ${deal.id}) no workspace: ${deal.workspace_id}`);

    const conversation = await selectConversationForClient(deal.client.id, deal.workspace_id);

    if (conversation) {
      router.push(`/workspace/${deal.workspace_id}/conversations`);
    } else {
      // selectConversationForClient já deve ter mostrado um toast de erro.
      console.warn(`[DealCard] Não foi possível selecionar ou encontrar conversa para cliente ${deal.client.id}. Navegação cancelada.`);
    }
  };

  // Extract potential counts (handle if not present)
  // const notesCount = deal._count?.notes ?? 0;
  // const tasksCount = deal._count?.tasks ?? 0;
  const notesCount = 0; // Placeholder
  const tasksCount = 0; // Placeholder

  return (
    <>
      <Draggable draggableId={deal.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps} // Attach drag handle here
            className={`mb-2 transition-shadow duration-200 ease-in-out ${snapshot.isDragging ? 'shadow-lg' : 'shadow'}`}
            style={{
              ...provided.draggableProps.style, // Apply styles from dnd
            }}
            onClick={handleCardClick} // UPDATED onClick handler
            title={`Conversar com ${deal.client?.name || deal.name}`}
          >
            <Card className="p-3 bg-card hover:bg-card/90 cursor-pointer">
              {/* Card Header: Name and AI Badge */}
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-semibold leading-tight mr-2">{deal.name}</h4>
                {deal.ai_controlled && (
                  <Badge variant="secondary" className="px-1.5 py-0.5 text-xs">
                    <Bot className="h-3 w-3 mr-1"/> IA
                  </Badge>
                )}
              </div>
              
              {/* Client Name */}
              {deal.client?.name && (
                <p className="text-xs text-muted-foreground mb-1">{deal.client.name}</p>
              )}
              
              {/* Deal Value */}
              {deal.value != null && (
                <p className="text-sm font-semibold mb-2">{formatCurrency(deal.value)}</p>
              )}

              {/* Card Footer: Icons for notes, tasks etc. */}
              {(notesCount > 0 || tasksCount > 0) && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/50">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                          {notesCount > 0 && (
                              <span className="flex items-center text-xs" title={`${notesCount} notas`}>
                                  <StickyNote className="h-3 w-3 mr-1" /> {notesCount}
                              </span>
                          )}
                          {tasksCount > 0 && (
                              <span className="flex items-center text-xs" title={`${tasksCount} tarefas`}>
                                  <CheckSquare className="h-3 w-3 mr-1" /> {tasksCount}
                              </span>
                          )}
                      </div>
                      {/* Placeholder for maybe an avatar or due date */}
                      {/* <Avatar className="h-5 w-5">...</Avatar> */}
                  </div>
              )}
            </Card>
          </div>
        )}
      </Draggable>

      {/* REMOVE Modal rendering */}
      {/* {isDetailModalOpen && <DealDetailModal dealId={deal.id} onClose={closeDetailModal} />} */}
    </>
  );
} 