'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  createEvolutionInstanceAction,
  fetchEvolutionInstanceStatusAction,
  deleteEvolutionInstanceAction
} from '@/lib/actions/workspaceSettingsActions';
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

interface ActionResult {
  success: boolean;
  error?: string;
}

interface EvolutionStatusResult extends ActionResult {
  connectionStatus?: string;
  instanceExists?: boolean;
  details?: {
    ownerJid?: string;
    profileName?: string;
    profilePicUrl?: string;
  };
  tokenHash?: string;
}

interface CreateEvolutionResult extends ActionResult {
  instanceData?: InstanceData;
  webhookSetupWarning?: string;
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [instanceTokenHash, setInstanceTokenHash] = useState<string | null>(null);

  const checkStatus = async () => {
    if (!workspaceId) return;
    console.log("[checkStatus] Iniciando verificação para:", workspaceId);
    try {
      const result: EvolutionStatusResult = await fetchEvolutionInstanceStatusAction({ instanceName: workspaceId });
      console.log("[checkStatus] Resultado da Action:", result);
      
      if (result.success && result.instanceExists) {
        console.log("[checkStatus] Instância existe.");
        if (result.connectionStatus === 'open') {
          console.log("[checkStatus] Status: open. Definindo connectionDetails e tokenHash.");
          setConnectionDetails({
            connectionStatus: result.connectionStatus,
            ownerJid: result.details?.ownerJid,
            profileName: result.details?.profileName,
            profilePicUrl: result.details?.profilePicUrl,
          });
          setInstanceTokenHash(result.tokenHash || null);
          setInstanceData(null);
          stopPolling();
          console.log('Evolution instance connected!', result.details);
          return true;
        } else {
          console.log(`[checkStatus] Status não é 'open': ${result.connectionStatus}. Definindo instanceData para mostrar QR/Connecting.`);
          // Se a instância existe mas não está 'open', precisamos mostrar a tela de "connecting"
          // A action fetchEvolutionInstanceStatusAction não retorna QR/Pairing code, então focamos no status e token.
          setInstanceData({
            instanceName: workspaceId, // Ou result.details?.instanceName se disponível e preferível
            status: result.connectionStatus || 'connecting', // Usar o status retornado
            token: result.tokenHash || '', // Usar o tokenHash retornado
            // qrCodeBase64, pairingCode serão nulos aqui, a UI deve lidar com isso
          });
          setConnectionDetails(null); // Garantir que não estamos no estado "conectado"
          setInstanceTokenHash(result.tokenHash || null); // Manter o token hash visível
          // O useEffect que depende de instanceData deve iniciar o polling automaticamente
          // startPolling(); // Não precisa chamar diretamente, o useEffect [instanceData, connectionDetails] cuida disso.
        }
      } else if (result.success && !result.instanceExists) {
        console.log("[checkStatus] Instância NÃO existe. Limpando estados.");
        setConnectionDetails(null);
        setInstanceData(null);
        setInstanceTokenHash(null);
      } else if (!result.success) {
        console.error("[checkStatus] Action falhou:", result.error);
        setError(result.error || 'Falha ao buscar status da instância.');
        stopPolling();
      }
    } catch (e) {
      console.error("[checkStatus] Erro inesperado:", e);
      setError('Erro inesperado ao buscar status.');
      stopPolling();
    }
    console.log("[checkStatus] Verificação concluída.");
    return false;
  };

  useEffect(() => {
    console.log("[useEffect inicial] Montado. Chamando checkStatus.");
    setIsLoadingInitialStatus(true);
    checkStatus().finally(() => {
      console.log("[useEffect inicial] checkStatus concluído. Removendo loading inicial.");
      setIsLoadingInitialStatus(false);
    });
    return () => {
      console.log("[useEffect inicial] Desmontado. Parando polling.");
      stopPolling();
    }
  }, [workspaceId]);

  useEffect(() => {
    // Este useEffect só inicia o polling se instanceData for definido (pelo handleSubmit)
    // e a conexão ainda não estiver estabelecida.
    if (instanceData && instanceData.status !== 'connected' && !connectionDetails) {
       console.log("[useEffect polling] Condição atendida. Iniciando polling.");
      startPolling();
    } else {
        console.log("[useEffect polling] Condição NÃO atendida. Polling não iniciado ou será parado.");
    }
    return () => {
        // console.log("[useEffect polling] Desmontado ou dependência mudou. Parando polling.");
        // stopPolling(); // stopPolling já é chamado no cleanup do outro useEffect e dentro de checkStatus
    }
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
    setInstanceTokenHash(null);
    stopPolling();

    startTransition(async () => {
      const result: CreateEvolutionResult = await createEvolutionInstanceAction({
        workspaceId,
      });

      if (result.success && result.instanceData) {
        setInstanceData(result.instanceData);
        setInstanceTokenHash(result.instanceData.token);
        toast.success(`Instância ${result.instanceData.instanceName} conectando! Status: ${result.instanceData.status}`);
        if (result.instanceData.pairingCode) {
          toast(`Use o código de pareamento: ${result.instanceData.pairingCode}`, { icon: 'ℹ️' });
        }
        if (result.webhookSetupWarning) {
            toast(result.webhookSetupWarning, { icon: '⚠️', duration: 6000 });
        }
      } else {
        setError(result.error || 'Falha ao criar/conectar instância Evolution.');
        toast.error(result.error || 'Falha ao criar/conectar instância Evolution.');
      }
    });
  };

  const handleDeleteInstance = async () => {
    if (!workspaceId) {
      toast.error('ID do Workspace não encontrado para deletar.');
      return;
    }

    if (!confirm('Tem certeza que deseja cancelar a conexão e deletar esta instância da Evolution API?')) {
        return;
    }

    setIsDeleting(true);
    setError(null);
    stopPolling();
    const toastId = toast.loading('Deletando instância...');

    try {
      const result = await deleteEvolutionInstanceAction({ instanceName: workspaceId });

      if (result.success) {
        toast.success('Instância deletada com sucesso!', { id: toastId });
        setConnectionDetails(null);
        setInstanceData(null);
        setInstanceTokenHash(null);
      } else {
        throw new Error(result.error || 'Falha ao deletar instância.');
      }
    } catch (e: any) {
      console.error("Error deleting instance:", e);
      setError(e.message || 'Erro inesperado ao deletar.');
      toast.error(`Erro: ${e.message || 'Falha ao deletar.'}`, { id: toastId });
    } finally {
      setIsDeleting(false);
    }
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
              {instanceTokenHash && (
                 <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Token Instância:</span> {instanceTokenHash}</p>
              )}
            </div>
          </div>
           <Button 
             variant="destructive" 
             onClick={handleDeleteInstance} 
             disabled={isDeleting}
             className="mt-4"
           >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
            Desconectar Instância
           </Button>
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
         <CardFooter className="flex flex-col items-start space-y-2">
             <p className="text-xs text-muted-foreground">
                 Use o app WhatsApp no seu celular para escanear o QR Code ou inserir o código de pareamento.
             </p>
             <Button 
               variant="destructive" 
               size="sm" 
               onClick={handleDeleteInstance} 
               disabled={isDeleting}
               className="mt-2"
             >
               {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
               Cancelar / Deletar Instância
             </Button>
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