'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createEvolutionInstanceAction, fetchEvolutionInstanceStatusAction } from '@/lib/actions/workspaceSettingsActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Image from 'next/image';

interface InstanceData {
  instanceName: string;
  status: string;
  token: string;
  pairingCode?: string;
  qrCodeBase64?: string;
  qrCodeCount?: number;
}

interface ConnectionDetails {
  ownerJid?: string;
  profileName?: string;
  profilePicUrl?: string;
  connectionStatus?: string;
}

export default function EvolutionIntegrationPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnecting, startTransition] = useTransition();
  const [isLoadingInitialStatus, setIsLoadingInitialStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instanceData, setInstanceData] = useState<InstanceData | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);

  const checkStatus = async () => {
    if (!workspaceId) return;
    try {
      const result = await fetchEvolutionInstanceStatusAction({ instanceName: workspaceId });
      if (result.success && result.instanceExists) {
        if (result.connectionStatus === 'open') {
          setConnectionDetails({
            connectionStatus: result.connectionStatus,
            ownerJid: result.details?.ownerJid,
            profileName: result.details?.profileName,
            profilePicUrl: result.details?.profilePicUrl,
          });
          setInstanceData(null);
          stopPolling();
          console.log('Evolution instance connected!', result.details);
          return true;
        } else {
          console.log('Evolution instance exists but not open, status:', result.connectionStatus);
        }
      } else if (result.success && !result.instanceExists) {
        setConnectionDetails(null);
        setInstanceData(null);
        console.log('Evolution instance does not exist.');
      } else if (!result.success) {
        setError(result.error || 'Falha ao buscar status da instância.');
        stopPolling();
      }
    } catch (e) {
      console.error("Error fetching status:", e);
      setError('Erro inesperado ao buscar status.');
      stopPolling();
    }
    return false;
  };

  useEffect(() => {
    setIsLoadingInitialStatus(true);
    checkStatus().finally(() => {
      setIsLoadingInitialStatus(false);
    });
    return () => stopPolling();
  }, [workspaceId]);

  useEffect(() => {
    if (instanceData && instanceData.status !== 'connected' && !connectionDetails) {
      startPolling();
    }
    return () => stopPolling();
  }, [instanceData, connectionDetails]);

  const startPolling = () => {
    stopPolling();
    console.log('Starting polling for Evolution connection status...');
    pollingIntervalRef.current = setInterval(async () => {
      console.log('Polling status...');
      const isConnected = await checkStatus();
      if (isConnected) {
         toast.success('WhatsApp conectado com sucesso!');
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('Polling stopped.');
    }
  };

  const handleSubmit = async () => {
    if (!workspaceId) {
      setError('ID do Workspace não encontrado.');
      return;
    }
    setError(null);
    setInstanceData(null);
    setConnectionDetails(null);
    stopPolling();

    startTransition(async () => {
      const result = await createEvolutionInstanceAction({
        workspaceId,
      });

      if (result.success && result.instanceData) {
        setInstanceData(result.instanceData);
        toast.success(`Instância ${result.instanceData.instanceName} conectando! Status: ${result.instanceData.status}`);
        if (result.instanceData.pairingCode) {
          toast(`Use o código de pareamento: ${result.instanceData.pairingCode}`, { icon: 'ℹ️' });
        }
      } else {
        setError(result.error || 'Falha ao criar/conectar instância Evolution.');
        toast.error(result.error || 'Falha ao criar/conectar instância Evolution.');
      }
    });
  };

  if (isLoadingInitialStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conectar API Evolution (Não Oficial)</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-40">
          <Loader2 className="mr-2 h-8 w-8 animate-spin text-primary" />
          <p>Verificando status da conexão...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
        <Card className="border-destructive">
            <CardHeader>
                <CardTitle className="text-destructive">Erro na Integração Evolution</CardTitle>
            </CardHeader>
            <CardContent>
                <p>{error}</p>
                <Button variant="outline" onClick={() => { setError(null); checkStatus(); }} className="mt-4">
                    Tentar Novamente
                </Button>
            </CardContent>
        </Card>
    );
  }

  if (connectionDetails && connectionDetails.connectionStatus === 'open') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Conectado (Evolution API)</CardTitle>
          <CardDescription>A instância está ativa e conectada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4 p-4 bg-muted rounded-md">
            <Image
              src={connectionDetails.profilePicUrl || '/placeholder-avatar.png'}
              alt={connectionDetails.profileName || 'Avatar do WhatsApp'}
              width={64}
              height={64}
              className="rounded-full border"
            />
            <div>
              <p className="font-semibold text-lg">{connectionDetails.profileName || 'Nome não disponível'}</p>
              <p className="text-sm text-muted-foreground">{connectionDetails.ownerJid || 'Número não disponível'}</p>
            </div>
          </div>
           <Button variant="destructive" disabled>Desconectar (Em breve)</Button>
        </CardContent>
      </Card>
    );
  }

  if (instanceData) {
    return (
      <Card>
         <CardHeader>
           <CardTitle>Conecte seu WhatsApp</CardTitle>
           <CardDescription>Status: <span className={`font-semibold ${instanceData.status === 'connecting' ? 'text-yellow-500' : instanceData.status === 'connected' ? 'text-green-500' : 'text-red-500'}`}>{instanceData.status}</span></CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           {instanceData.token && (
             <div>
               <p className="text-sm font-medium">Token da Instância (Hash):</p>
               <p className="text-xs bg-muted p-2 rounded break-all">{instanceData.token}</p>
             </div>
           )}
           {instanceData.pairingCode && (
             <div>
               <p className="text-sm font-medium">Código de Pareamento (para conectar no WhatsApp):</p>
               <p className="text-lg font-bold p-2 bg-primary/10 text-primary rounded text-center tracking-wider">{instanceData.pairingCode}</p>
             </div>
           )}
           {instanceData.qrCodeBase64 && (
             <div>
               <p className="text-sm font-medium text-center mb-2">Ou escaneie o QR Code:</p>
               <div className="flex justify-center">
                 <Image
                   src={instanceData.qrCodeBase64}
                   alt="QR Code para conexão Evolution API"
                   width={250}
                   height={250}
                   className="border rounded-md"
                 />
               </div>
             </div>
           )}
           {(instanceData.status === 'connecting' || !instanceData.qrCodeBase64 && !instanceData.pairingCode) && (
              <div className="flex flex-col items-center text-center p-4">
                 <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                 <p className="text-muted-foreground">Aguardando leitura do QR Code ou Código de Pareamento...</p>
                 <p className="text-xs text-muted-foreground mt-1">Verificando conexão automaticamente...</p>
              </div>
           )}
         </CardContent>
         <CardFooter>
             <p className="text-xs text-muted-foreground">
                 Use o app WhatsApp no seu celular para escanear o QR Code ou inserir o código de pareamento.
                 A conexão será detectada automaticamente.
             </p>
         </CardFooter>
       </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conectar API Evolution (Não Oficial)</CardTitle>
        <CardDescription>
          Clique no botão abaixo para iniciar a conexão com a API Evolution usando o ID deste workspace como nome da instância.
          Lembre-se de que esta é uma API não oficial e pode ter instabilidades.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Button onClick={handleSubmit} disabled={isConnecting || !workspaceId}>
            {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Criar/Conectar Instância Evolution
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}