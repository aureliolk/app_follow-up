'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from 'react-hot-toast';
import { Loader2, Info } from 'lucide-react';
import { WhatsappIntegrationType } from '@prisma/client'; // Importar o Enum
import { saveEvolutionApiSettings } from '@/lib/actions/workspaceSettingsActions'; // Importar a Server Action

// Tipo para as propriedades recebidas
interface EvolutionApiSettingsFormProps {
  currentSettings: {
    workspaceId: string;
    activeIntegration: WhatsappIntegrationType;
    evolutionApiEndpoint: string;
    evolutionApiInstanceName: string;
    isEvolutionApiKeySet: boolean; // Apenas para saber se a chave está definida
  };
}

export default function EvolutionApiSettingsForm({ currentSettings }: EvolutionApiSettingsFormProps) {
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState(''); // Começa vazio por segurança
  const [instanceName, setInstanceName] = useState('');
  const [activeIntegration, setActiveIntegration] = useState<WhatsappIntegrationType>(WhatsappIntegrationType.WHATSAPP_CLOUD_API);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentSettings) {
      setEndpoint(currentSettings.evolutionApiEndpoint || '');
      setInstanceName(currentSettings.evolutionApiInstanceName || '');
      setActiveIntegration(currentSettings.activeIntegration || WhatsappIntegrationType.WHATSAPP_CLOUD_API);
      // Não preenchemos a API Key por segurança, mas podemos indicar se ela está salva
    }
  }, [currentSettings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    // Preparar dados para a action
    const dataToSend = {
      workspaceId: currentSettings.workspaceId,
      endpoint: endpoint || '', // Enviar string vazia se null/undefined
      apiKey: apiKey || undefined, // Enviar undefined se vazio, a action saberá não atualizar
      instanceName: instanceName || '', // Enviar string vazia se null/undefined
      activeIntegration
    };

    console.log('Enviando para saveEvolutionApiSettings:', { 
      ...dataToSend, 
      apiKey: dataToSend.apiKey ? '********' : undefined 
    });

    try {
      const result = await saveEvolutionApiSettings(dataToSend);

      if (result.success) {
        toast.success('Configurações da Evolution API salvas com sucesso!');
        setApiKey(''); // Limpar campo da chave após salvar
      } else {
        setError(result.error || 'Ocorreu um erro desconhecido ao salvar.');
        toast.error(`Erro ao salvar: ${result.error || 'Erro desconhecido'}`);
      }

    } catch (err: any) {
      console.error("Erro inesperado ao chamar saveEvolutionApiSettings:", err);
      const message = err.message || 'Ocorreu um erro inesperado.';
      setError(message);
      toast.error(`Erro: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
       {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md">
              {error}
            </div>
        )}

      <div className="space-y-1.5">
        <Label htmlFor="active_integration" className="text-foreground">
          Integração Ativa
        </Label>
        <Select
            name="active_integration"
            value={activeIntegration}
            onValueChange={(value) => setActiveIntegration(value as WhatsappIntegrationType)}
            disabled={isSaving}
        >
          <SelectTrigger className="w-full md:w-1/2 bg-input border-input">
            <SelectValue placeholder="Selecione a integração a ser usada..." />
          </SelectTrigger>
          <SelectContent>
              <SelectItem value={WhatsappIntegrationType.WHATSAPP_CLOUD_API}>
                  WhatsApp Cloud API (Oficial)
              </SelectItem>
              <SelectItem value={WhatsappIntegrationType.EVOLUTION_API}>
                  Evolution API (Não Oficial)
              </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
            Selecione qual integração este workspace deve usar para enviar e receber mensagens.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="evolution_endpoint" className="text-foreground">
          Endpoint da API Evolution
        </Label>
        <Input
          id="evolution_endpoint"
          name="evolution_endpoint"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="Ex: https://sua-evolution-api.com"
          className="bg-input border-input"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">
          A URL base da sua instância da Evolution API.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="evolution_api_key" className="text-foreground">
          Chave da API (API Key)
        </Label>
        <Input
          id="evolution_api_key"
          name="evolution_api_key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={currentSettings.isEvolutionApiKeySet ? 'Chave API definida (insira para alterar)' : 'Cole sua API Key aqui'}
          className="bg-input border-input"
          disabled={isSaving}
        />
         <p className="text-xs text-muted-foreground">
            Sua chave de API para autenticar com a Evolution API. Deixe em branco para não alterar.
         </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="evolution_instance_name" className="text-foreground">
          Nome da Instância (Opcional)
        </Label>
        <Input
          id="evolution_instance_name"
          name="evolution_instance_name"
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value)}
          placeholder="Ex: minha-instancia-principal"
          className="bg-input border-input"
          disabled={isSaving}
        />
         <p className="text-xs text-muted-foreground">
            O nome da instância específica que você deseja usar na Evolution API.
         </p>
      </div>

      <div>
        <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isSaving ? 'Salvando...' : 'Salvar Configurações da Evolution API'}
        </Button>
      </div>

    </form>
  );
} 