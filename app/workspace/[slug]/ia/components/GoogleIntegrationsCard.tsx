// app/workspace/[slug]/ia/components/GoogleIntegrationsCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/workspace-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Link as LinkIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function GoogleIntegrationsCard() {
  const { workspace, isLoading: workspaceLoading, refreshWorkspaces } = useWorkspace();
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnect = () => {
    if (!workspace) return;
    setIsConnecting(true);
    router.push(`/api/google-auth/connect?workspaceId=${workspace.id}`);
  };

  const handleDisconnect = async () => {
    if (!workspace) return;
    setIsDisconnecting(true);
    const toastId = toast.loading('Desconectando conta Google...');

    try {
        const response = await fetch(`/api/google-auth/disconnect?workspaceId=${workspace.id}`, {
             method: 'POST',
        });

        if (!response.ok) {
             const errorData = await response.json();
             throw new Error(errorData.error || 'Falha ao desconectar.');
        }

        await refreshWorkspaces();
        toast.success('Conta Google desconectada com sucesso!', { id: toastId });

    } catch (error: any) {
        console.error("Erro ao desconectar conta Google:", error);
        toast.error(`Erro: ${error.message}`, { id: toastId });
    } finally {
        setIsDisconnecting(false);
    }
  };

  const isConnected = workspace?.google_refresh_token && workspace.google_refresh_token.trim() !== '';

  return (
    <Card className="border-border bg-card w-full rounded-xl shadow-md">
      <CardHeader>
        <CardTitle className="text-card-foreground">Integrações Google</CardTitle>
        <CardDescription>
          Conecte uma conta Google para permitir que a IA acesse serviços como o Google Calendar neste workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {workspaceLoading && !workspace ? (
          <LoadingSpinner message="Verificando status da integração..." />
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-md bg-background/30">
            <div className='flex flex-col'>
              <span className="text-sm font-medium text-foreground mb-1">Google Calendar</span>
               {isConnected ? (
                 <div className="flex items-center text-xs text-emerald-500">
                   <CheckCircle className="h-4 w-4 mr-1.5 flex-shrink-0" />
                   Conectado
                   {workspace?.google_account_email && (
                       <span className="text-muted-foreground ml-2 hidden sm:inline">({workspace.google_account_email})</span>
                   )}
                 </div>
               ) : (
                 <div className="flex items-center text-xs text-destructive">
                   <XCircle className="h-4 w-4 mr-1.5 flex-shrink-0" />
                   Não conectado
                 </div>
               )}
               {isConnected && workspace?.google_account_email && (
                   <span className="text-xs text-muted-foreground sm:hidden mt-1">({workspace.google_account_email})</span>
               )}
            </div>

            <div className="flex-shrink-0 w-full sm:w-auto pt-2 sm:pt-0">
                {!isConnected ? (
                    <Button
                      onClick={handleConnect}
                      disabled={isConnecting || workspaceLoading}
                      size="sm"
                      className="w-full sm:w-auto"
                    >
                        {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                        {isConnecting ? 'Redirecionando...' : 'Conectar Google Calendar'}
                    </Button>
                ) : (
                     <Button
                       variant="destructive"
                       onClick={handleDisconnect}
                       disabled={isDisconnecting || workspaceLoading}
                       size="sm"
                       className="w-full sm:w-auto"
                     >
                        {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {isDisconnecting ? 'Desconectando...' : 'Desconectar'}
                     </Button>
                )}
            </div>
          </div>
        )}
      </CardContent>
       <CardFooter>
        <p className="text-xs text-muted-foreground">
            A conexão permite que a IA agende eventos diretamente no calendário Google associado a este workspace.
        </p>
      </CardFooter>
    </Card>
  );
}

