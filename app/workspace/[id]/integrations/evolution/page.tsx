'use client';

import { useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import { createEvolutionInstanceAction } from '@/lib/actions/workspaceSettingsActions';
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

export default function EvolutionIntegrationPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [isConnecting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [instanceData, setInstanceData] = useState<InstanceData | null>(null);

  const handleSubmit = async () => {
    if (!workspaceId) {
      setError('ID do Workspace não encontrado.');
      return;
    }
    setError(null);
    setInstanceData(null);

    startTransition(async () => {
      const result = await createEvolutionInstanceAction({
        workspaceId,
      });

      if (result.success && result.instanceData) {
        setInstanceData(result.instanceData);
        toast.success(`Instância ${result.instanceData.instanceName} (${workspaceId}) conectando! Status: ${result.instanceData.status}`);
        if (result.instanceData.pairingCode) {
          toast(`Use o código de pareamento: ${result.instanceData.pairingCode}`, { icon: 'ℹ️' });
        }
      } else {
        setError(result.error || 'Falha ao criar/conectar instância Evolution.');
        toast.error(result.error || 'Falha ao criar/conectar instância Evolution.');
      }
    });
  };

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
            {instanceData?.status === 'connecting' ? 'Verificando Conexão...' : 'Criar/Conectar Instância Evolution'}
          </Button>
        </div>

        {error && (
          <div className="text-red-500 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="font-semibold">Erro:</p>
            <p>{error}</p>
          </div>
        )}

        {instanceData && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Status da Instância: {instanceData.instanceName}</CardTitle>
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
              {instanceData.status === 'connecting' && !instanceData.qrCodeBase64 && !instanceData.pairingCode && (
                 <div className="flex flex-col items-center text-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p className="text-muted-foreground">Aguardando QR Code ou Código de Pareamento...</p>
                    <p className="text-xs text-muted-foreground mt-1">Isso pode levar alguns segundos. Mantenha esta página aberta.</p>
                 </div>
              )}
            </CardContent>
            <CardFooter>
                <p className="text-xs text-muted-foreground">
                    Se o QR Code ou código de pareamento aparecerem, use o app WhatsApp no seu celular para escanear ou conectar.
                </p>
            </CardFooter>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}