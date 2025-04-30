import {
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Avatar, 
  AvatarFallback, 
  AvatarImage 
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getRecentActivities, ActivityLog } from "@/lib/actions/dashboardActions";
import Link from 'next/link'; // Import Link

// Helper function to render badge based on activity source
const renderSourceBadge = (source: ActivityLog['source']) => {
    switch (source) {
      case 'AI': return <Badge variant="secondary">IA</Badge>;
      case 'USER': return <Badge variant="outline">Usuário</Badge>;
      case 'SYSTEM': return <Badge variant="destructive">Sistema</Badge>; // Maybe use default or secondary?
      default: return null;
    }
};

// Async Server Component: Fetches its own data
export default async function RecentActivityList({ workspaceId }: { workspaceId: string }) {
  let activities: ActivityLog[] = [];
  let fetchError: string | null = null;

  try {
    activities = await getRecentActivities(workspaceId, 5); // Fetch latest 5 activities
  } catch (error) {
     console.error("[RecentActivityList] Failed to fetch activities:", error);
     fetchError = "Falha ao carregar atividades recentes.";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade Recente (Pipeline)</CardTitle>
      </CardHeader>
      <CardContent>
        {fetchError ? (
          <p className="text-destructive text-sm">{fetchError}</p>
        ) : activities.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma atividade recente no pipeline.</p>
        ) : (
          <ul className="space-y-4">
            {activities.map((activity) => (
              <li key={activity.id} className="flex items-start space-x-3">
                <Avatar className="h-8 w-8 border">
                  <AvatarImage 
                    src={activity.user?.image ?? undefined} 
                    alt={activity.user?.name ?? activity.source}
                  />
                  <AvatarFallback className="text-xs">
                    {activity.user?.name 
                      ? activity.user.name.split(' ').map(n => n[0]).join('').toUpperCase()
                      : activity.source.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-sm">
                  <p className="font-medium leading-none">
                    {activity.action} 
                    {activity.deal?.id && activity.deal?.name && (
                      <>
                        {" "}em{" "}
                        {/* Link to the specific deal if possible (requires deal page) */}
                        <Link href={`/workspace/${workspaceId}/kaban?dealId=${activity.deal.id}`} // Example link
                              className="text-primary hover:underline"
                        >
                          "{activity.deal.name}"
                        </Link>
                      </>
                    )}
                  </p>
                  {activity.message && (
                    <p className="text-muted-foreground mt-0.5">{activity.message}</p>
                  )}
                  <div className="flex items-center space-x-2 mt-1">
                     {renderSourceBadge(activity.source)}
                     <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
} 