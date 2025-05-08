import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardGeneralStats, DashboardGeneralStatsData } from "@/lib/actions/dashboardActions"; 
import Link from 'next/link';
import { ArrowUpRight, MessageSquare, Users, Contact, DollarSign, Activity, CheckCircle2 } from 'lucide-react';

// Function to format currency (consider moving to lib/utils)
const formatCurrencyBRL = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Async Server Component: Fetches its own data
async function getStats(workspaceId: string): Promise<DashboardGeneralStatsData> {
  try {
    // Directly call the server action
    const stats = await getDashboardGeneralStats(workspaceId);
    return stats;
  } catch (error) {
    console.error("[DashboardStats] Failed to fetch stats:", error);
    // Return zero counts on error to prevent breaking the UI
    return {
      activeConversationsCount: 0, 
      totalClientsCount: 0,
      teamMembersCount: 0,
      activeFollowUpsCount: 0,
      convertedFollowUpsCount: 0,
    };
  }
}

// Async Server Component
export default async function DashboardStats({ workspaceId }: { workspaceId: string }) {
  const stats = await getStats(workspaceId);

  // TODO: Add more stats like Total Deals Value, Conversion Rate when available in actions

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {/* Active Conversations Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Conversas Ativas</CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeConversationsCount}</div>
          <Link href={`/workspace/${workspaceId}/conversations`} className="text-xs text-muted-foreground hover:text-primary flex items-center pt-1">
            Ver todas <ArrowUpRight className="h-3 w-3 ml-1" />
          </Link>
        </CardContent>
      </Card>
      
      {/* Total Clients Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Clientes Totais</CardTitle>
          <Contact className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalClientsCount}</div>
           <Link href={`/workspace/${workspaceId}/clients`} className="text-xs text-muted-foreground hover:text-primary flex items-center pt-1">
            Gerenciar clientes <ArrowUpRight className="h-3 w-3 ml-1" />
          </Link>
        </CardContent>
      </Card>

      {/* Team Members Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Membros da Equipe</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.teamMembersCount}</div>
          <Link href={`/workspace/${workspaceId}/members`} className="text-xs text-muted-foreground hover:text-primary flex items-center pt-1">
            Convidar / Gerenciar <ArrowUpRight className="h-3 w-3 ml-1" />
          </Link>
        </CardContent>
      </Card>

      {/* Active Follow-ups Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Follow-ups Ativos</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeFollowUpsCount}</div>
          <Link href={`/workspace/${workspaceId}/follow-ups?status=active`} className="text-xs text-muted-foreground hover:text-primary flex items-center pt-1">
            Ver ativos <ArrowUpRight className="h-3 w-3 ml-1" />
          </Link>
        </CardContent>
      </Card>

      {/* Converted Follow-ups Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Follow-ups Convertidos</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.convertedFollowUpsCount}</div>
          <Link href={`/workspace/${workspaceId}/follow-ups?status=converted`} className="text-xs text-muted-foreground hover:text-primary flex items-center pt-1">
            Ver convertidos <ArrowUpRight className="h-3 w-3 ml-1" />
          </Link>
        </CardContent>
      </Card>

      {/* Placeholder for Total Deals Value */}
      {/* 
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Valor Total (Pipeline)</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrencyBRL(stats.totalDealsValue ?? 0)}</div>
          <Link href={`/workspace/${workspaceId}/kaban`} className="text-xs text-muted-foreground hover:text-primary flex items-center pt-1">
            Ver pipeline <ArrowUpRight className="h-3 w-3 ml-1" />
          </Link>
        </CardContent>
      </Card>
      */}
    </div>
  );
} 