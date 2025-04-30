// apps/next-app/app/workspace/[slug]/page.tsx
import { useWorkspace } from '@/context/workspace-context';
import { ArrowUpRight, Users, BarChart2 } from 'lucide-react';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
// Remover import do serviço, vamos usar o contexto
// import { followUpService } from '../../follow-up/_services/followUpService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// <<< IMPORTAR O CONTEXTO DE FOLLOW-UP >>>
import { useConversationContext } from '@/context/ConversationContext'; // <<< Importar hook correto
import type { Campaign, ClientConversation } from '@/app/types'; // <<< Importar tipos se necessário

// Importa os componentes específicos do Dashboard
import DashboardStats from './dashboard/components/DashboardStats';
import DealsByStageChart from './dashboard/components/DealsByStageChart';
import RecentActivityList from './dashboard/components/RecentActivityList';

// Importa a action necessária para o gráfico
import { getDealsByStageData } from '@/lib/actions/dashboardActions';

interface WorkspaceDashboardPageProps {
  params: { id: string }; // Espera o ID da URL
}

// Componente Wrapper para o Gráfico (Busca dados e renderiza o componente)
async function DealsByStageChartWrapper({ workspaceId }: { workspaceId: string }) {
  try {
    const chartData = await getDealsByStageData(workspaceId);
    return <DealsByStageChart data={chartData} />;
  } catch (error) {
    console.error("[DealsByStageChartWrapper] Error fetching chart data:", error);
    return <Card><CardHeader><CardTitle>Negócios por Etapa</CardTitle></CardHeader><CardContent><p className="text-destructive">Erro ao carregar gráfico.</p></CardContent></Card>;
  }
}

// Componente Wrapper para a Lista de Atividades (Chama o componente que busca seus dados)
async function RecentActivityListWrapper({ workspaceId }: { workspaceId: string }) {
  try {
    return <RecentActivityList workspaceId={workspaceId} />;
  } catch (error) {
    console.error("[RecentActivityListWrapper] Error rendering activity list:", error);
    return <Card><CardHeader><CardTitle>Atividade Recente</CardTitle></CardHeader><CardContent><p className="text-destructive">Erro ao carregar atividades.</p></CardContent></Card>;
  }
}

// Página Principal (Async Server Component)
export default async function WorkspaceDashboardPage({ params }: WorkspaceDashboardPageProps) {
  const { id: workspaceId } = await params;

  // Não precisamos mais do useWorkspace aqui se não formos exibir o nome
  // A validação de acesso deve ocorrer no layout ou middleware

  // Se workspaceId não estiver presente, pode indicar um erro de rota
  if (!workspaceId) {
      return <div className="container mx-auto text-center py-10 text-destructive">ID do Workspace não encontrado na URL.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8">
      {/* Título - Pode ser removido se já estiver no layout */}
      {/* <h1 className="text-3xl font-bold text-foreground mb-4">Dashboard</h1> */}
      
      {/* Componente de Estatísticas Gerais (Server Component que busca seus dados) */}
      <Suspense fallback={<LoadingSpinner message="Carregando estatísticas..." />}>
        <DashboardStats workspaceId={workspaceId} />
      </Suspense>
      
      {/* Grid para Gráfico e Lista de Atividades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Wrapper do Gráfico (Server Component que busca dados) */}
        <Suspense fallback={<Card><CardHeader><CardTitle>Negócios por Etapa</CardTitle></CardHeader><CardContent><LoadingSpinner /></CardContent></Card>}>
          <DealsByStageChartWrapper workspaceId={workspaceId} /> 
        </Suspense>
        
        {/* Wrapper da Lista de Atividades (Server Component que chama outro Server Component) */}
        <Suspense fallback={<Card><CardHeader><CardTitle>Atividade Recente</CardTitle></CardHeader><CardContent><LoadingSpinner /></CardContent></Card>}>
          <RecentActivityListWrapper workspaceId={workspaceId} />
        </Suspense>
      </div>
    </div>
  );
}