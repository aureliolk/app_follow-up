'use client';

import React from 'react';
import { FollowUp } from './FollowUpTable';

interface KanbanCardProps {
  followUp: FollowUp;
  onDragStart: () => void;
  onClick: () => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ followUp, onDragStart, onClick }) => {
  // Calcular o tempo desde a última atualização
  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) {
      return `${diffMins}m`;
    } else if (diffMins < 1440) {
      return `${Math.floor(diffMins / 60)}h`;
    } else {
      return `${Math.floor(diffMins / 1440)}d`;
    }
  };

  // Extrair metadados se existirem
  const metadata = followUp.metadata ? 
    (typeof followUp.metadata === 'string' ? 
      JSON.parse(followUp.metadata) : followUp.metadata) : null;

  // Obter a última mensagem, se houver
  const lastMessage = followUp.messages && followUp.messages.length > 0 
    ? followUp.messages.sort((a, b) => 
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
      )[0] 
    : null;

  return (
    <div
      className="bg-gray-700 rounded-md p-3 cursor-pointer hover:bg-gray-650 transition-colors"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium text-white">{followUp.client_id}</div>
        <div className="flex items-center">
          {followUp.is_responsive && (
            <span className="bg-purple-600 rounded-full w-2 h-2 mr-1" title="Responsivo"></span>
          )}
          <span className="text-xs text-gray-400">
            {getTimeAgo(followUp.updated_at)}
          </span>
        </div>
      </div>
      
      {metadata && (metadata.name || metadata.email || metadata.phone) && (
        <div className="mb-2 text-sm text-gray-300">
          {metadata.name && <div>{metadata.name}</div>}
          {metadata.email && <div className="text-xs text-gray-400">{metadata.email}</div>}
          {metadata.phone && <div className="text-xs text-gray-400">{metadata.phone}</div>}
        </div>
      )}
      
      {lastMessage && (
        <div className="text-xs text-gray-400 line-clamp-2 mt-1">
          {lastMessage.content}
        </div>
      )}
      
      <div className="mt-2 flex justify-between items-center">
        <span className={`px-1.5 py-0.5 rounded text-xs ${
          followUp.status === 'active' ? 'bg-green-900/50 text-green-400' :
          followUp.status === 'paused' ? 'bg-yellow-900/50 text-yellow-400' :
          followUp.status === 'completed' ? 'bg-blue-900/50 text-blue-400' :
          'bg-red-900/50 text-red-400'
        }`}>
          {followUp.status}
        </span>
        
        <span className="text-xs text-gray-400">
          Etapa {followUp.current_step + 1}
        </span>
      </div>
    </div>
  );
};

export default KanbanCard;