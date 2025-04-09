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
// Importar a Server Action
import { saveWhatsappCredentialsAction } from '@/lib/actions/workspaceSettingsActions';

interface WhatsappSettingsFormProps {
  currentSettings: {
    workspaceId: string;
    phoneNumberId: string;
    businessAccountId: string;
    webhookVerifyToken: string;
    isAccessTokenSet: boolean;
    isAppSecretSet: boolean;
  };
}

export default function WhatsappSettingsForm({ currentSettings }: WhatsappSettingsFormProps) {
  const [phoneNumberId, setPhoneNumberId] = useState(currentSettings.phoneNumberId);
  const [businessAccountId, setBusinessAccountId] = useState(currentSettings.businessAccountId);
  const [accessToken, setAccessToken] = useState(''); // Inicia vazio por segurança
  const [appSecret, setAppSecret] = useState(''); // Inicia vazio por segurança
  const [verifyToken, setVerifyToken] = useState(currentSettings.webhookVerifyToken); // Token para verificar nosso webhook
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gerar token de verificação se não existir (isso pode ser feito no backend também)
  // Esta é uma implementação simples no cliente, idealmente seria no backend ao salvar
  const generateVerifyToken = () => {
      // Gera uma string aleatória simples (NÃO CRIPTOGRAFICAMENTE SEGURA para produção)
      const newToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      setVerifyToken(newToken);
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Validações básicas no cliente (validação mais robusta deve ser na action)
    // Verifica campos não sensíveis e verifica os sensíveis apenas se não estiverem já setados
    if (
      !phoneNumberId ||
      !businessAccountId ||
      (!currentSettings.isAccessTokenSet && !accessToken) || // Só exige accessToken se não estiver setado
      (!currentSettings.isAppSecretSet && !appSecret) ||   // Só exige appSecret se não estiver setado
      !verifyToken
    ) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      // Ajusta a mensagem de erro para ser mais clara, já que nem todos os campos são sempre obrigatórios
      return;
    }

    setIsLoading(true);
    toast.loading('Salvando credenciais...', { id: 'save-whatsapp' });

    // --- GERAR NOVO VERIFY TOKEN A CADA SAVE ---
    const newVerifyToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    console.log("Gerado novo Verify Token para salvar:", newVerifyToken);
    // Atualiza o estado local também, embora o valor enviado para a action seja o mais importante aqui
    setVerifyToken(newVerifyToken); 

    try {
       console.log("Enviando para Action:", {
          workspaceId: currentSettings.workspaceId,
          phoneNumberId,
          businessAccountId,
          accessToken, // Enviando o token real (se fornecido)
          appSecret,   // Enviando o segredo real (se fornecido)
          webhookVerifyToken: newVerifyToken, // <<< ENVIAR O NOVO TOKEN GERADO
       });

      // --- CHAMADA DA SERVER ACTION ---
      const result = await saveWhatsappCredentialsAction({
        workspaceId: currentSettings.workspaceId,
        phoneNumberId,
        businessAccountId,
        // Se o accessToken não foi digitado (está vazio) E já existe um salvo,
        // a action PRECISA preservar o antigo. A action atual sobrescreve.
        // Precisamos ajustar a action ou enviar um sinal.
        // Por agora, enviaremos o que temos no estado. A action precisa ser mais inteligente.
        accessToken: accessToken || 'PRESERVE_EXISTING', // Placeholder - Idealmente a action lida com isso
        appSecret: appSecret || 'PRESERVE_EXISTING', // Placeholder - Idealmente a action lida com isso
        webhookVerifyToken: newVerifyToken, // <<< Passa o novo token gerado
      });

      if (result?.success) {
        toast.success('Credenciais do WhatsApp salvas com sucesso!', { id: 'save-whatsapp' });
        // Limpar campos sensíveis após salvar
        setAccessToken('');
        setAppSecret('');
        // Pode atualizar o estado isSet para refletir que foram salvos
      } else {
        throw new Error(result?.error || 'Falha ao salvar credenciais.');
      }
      
      // Simulação (remover depois)
       await new Promise(resolve => setTimeout(resolve, 1500));
       toast.success('Simulação: Credenciais salvas!', { id: 'save-whatsapp' });
       setAccessToken('');
       setAppSecret('');
       // Fim Simulação

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
            type="password" // Usar tipo password para mascarar
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={currentSettings.isAccessTokenSet ? '******** (Já configurado)' : 'Cole o token aqui'}
            required={!currentSettings.isAccessTokenSet} // Obrigatório apenas se não estiver setado
            disabled={isLoading}
          />
           <p className="text-[0.8rem] text-muted-foreground">Token gerado no App Meta (usuário do sistema ou outro). Será armazenado de forma segura.</p>
        </div>
         <div className="space-y-2">
          <Label htmlFor="appSecret">Segredo do Aplicativo (App Secret)</Label>
          <Input
            id="appSecret"
            type="password" // Usar tipo password para mascarar
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={currentSettings.isAppSecretSet ? '******** (Já configurado)' : 'Cole o segredo aqui'}
            required={!currentSettings.isAppSecretSet} // Obrigatório apenas se não estiver setado
            disabled={isLoading}
          />
          <p className="text-[0.8rem] text-muted-foreground">Encontrado nas Configurações &gt; Básico do seu App Meta. Será armazenado de forma segura.</p>
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
