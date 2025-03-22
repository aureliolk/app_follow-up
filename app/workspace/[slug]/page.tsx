'use client';
import { useWorkspace } from '@/context/workspace-context';
import { Loader2 } from 'lucide-react';

export default function WorkspaceDashboard() {
  const { workspace, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-[#F54900]" />
      </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4 text-white">Bem-vindo ao {workspace.name}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Atividade Recente */}
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-6">
          <h2 className="text-lg font-medium text-white mb-4">Atividade Recente</h2>
          <p className="text-gray-400 text-sm">Nenhuma atividade recente encontrada.</p>
        </div>
        
        {/* Card Campanhas */}
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-6">
          <h2 className="text-lg font-medium text-white mb-4">Campanhas</h2>
          <p className="text-gray-400 text-sm">Nenhuma campanha encontrada.</p>
        </div>
        
        {/* Card Equipe */}
        <div className="bg-[#111111] border border-[#333333] rounded-lg p-6">
          <h2 className="text-lg font-medium text-white mb-4">Equipe</h2>
          <p className="text-gray-400 text-sm">Informações do workspace serão exibidas aqui.</p>
        </div>
      </div>
    </div>
  );
}