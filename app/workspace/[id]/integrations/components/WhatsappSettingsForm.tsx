// app/workspace/[slug]/settings/integrations/whatsapp/components/WhatsappSettingsForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from 'lucide-react';
import { saveWhatsappCredentialsAction } from '@/lib/actions/workspaceSettingsActions';

interface WhatsappSettingsFormProps {
  currentSettings: {
    workspaceId: string;
    phoneNumberId: string;
    businessAccountId: string;
    webhookVerifyToken: string;
    isAccessTokenSet: string;
    isAppSecretSet: boolean;
  };
}

export default function WhatsappSettingsForm({ currentSettings }: WhatsappSettingsFormProps) {
  const [phoneNumberId, setPhoneNumberId] = useState(currentSettings.phoneNumberId);
  const [businessAccountId, setBusinessAccountId] = useState(currentSettings.businessAccountId);
  const [accessToken, setAccessToken] = useState(currentSettings.isAccessTokenSet);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const newVerifyToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    if (
      !phoneNumberId ||
      !businessAccountId ||
      (!currentSettings.isAccessTokenSet && !accessToken) || // Só exige accessToken se não estiver setado
      !newVerifyToken 
    ) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setIsLoading(true);
    toast.loading('Salvando credenciais...', { id: 'save-whatsapp' });

    try {
      const result = await saveWhatsappCredentialsAction({
        workspaceId: currentSettings.workspaceId,
        phoneNumberId,
        businessAccountId,
        accessToken: accessToken, 
        webhookVerifyToken: newVerifyToken, 
      });

      if (result?.success) {
        toast.success('Credenciais do WhatsApp salvas com sucesso!', { id: 'save-whatsapp' });
        setAccessToken('');
      } else {
        throw new Error(result?.error || 'Falha ao salvar credenciais.');
      }
      
    } catch (err: any) {
      console.error("Erro ao salvar credenciais:", err);
      const errorMessage = err.message || 'Ocorreu um erro inesperado.';
      setError(errorMessage);
      toast.error(`Erro: ${errorMessage}`, { id: 'save-whatsapp' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="phoneNumberId">ID do Número de Telefone</Label>
          <Input
            id="phoneNumberId"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Ex: 123456789012345"
            required
            disabled={isLoading}
          />
          <p className="text-[0.8rem] text-muted-foreground">Encontrado na Configuração da API do WhatsApp no seu App Meta.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="businessAccountId">ID da Conta do WhatsApp Business (WABA)</Label>
          <Input
            id="businessAccountId"
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
            placeholder="Ex: 987654321098765"
            required
            disabled={isLoading}
          />
           <p className="text-[0.8rem] text-muted-foreground">O ID da sua conta comercial principal.</p>
        </div>
         <div className="space-y-2">
          <Label htmlFor="accessToken">Token de Acesso Permanente</Label>
          <Input
            id="accessToken"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            required={!currentSettings.isAccessTokenSet} 
            disabled={isLoading}
          />
           <p className="text-[0.8rem] text-muted-foreground">Token gerado no App Meta (usuário do sistema ou outro). Será armazenado de forma segura.</p>
        </div>
         
      </div>
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>
    </form>
  );
}
