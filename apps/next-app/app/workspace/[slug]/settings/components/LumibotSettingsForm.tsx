// app/workspace/[slug]/settings/components/LumibotSettingsForm.tsx
'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useWorkspace } from '../../../../../../../apps/next-app/context/workspace-context';
import { Button } from '../../../../../../../apps/next-app/components/ui/button';
import { Input } from '../../../../../../../apps/next-app/components/ui/input';
import { Label } from '../../../../../../../apps/next-app/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../../../../../apps/next-app/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import axios from 'axios'; // Usaremos axios para a chamada PATCH

export default function LumibotSettingsForm() {
  const { workspace, isLoading: workspaceLoading, refreshWorkspaces } = useWorkspace();

  const [accountId, setAccountId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Popula o formulário quando o workspace é carregado/atualizado
  useEffect(() => {
    if (workspace) {
      setAccountId(workspace.lumibot_account_id || '');
      // Não preenchemos o token por segurança, mas você pode decidir fazer isso
      // setApiToken(workspace.lumibot_api_token || '');
      setApiToken(''); // Começa vazio para o usuário inserir/confirmar
    }
  }, [workspace]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspace) return;

    setIsSaving(true);
    setError(null);

    const dataToUpdate: { lumibot_account_id?: string; lumibot_api_token?: string } = {};
    if (accountId !== (workspace.lumibot_account_id || '')) {
        dataToUpdate.lumibot_account_id = accountId;
    }
     // Só envia o token se um novo valor foi digitado
    if (apiToken) {
        dataToUpdate.lumibot_api_token = apiToken;
    }

    // Se nada mudou (e nenhum token novo foi digitado), não faz a chamada
    if (Object.keys(dataToUpdate).length === 0) {
        toast.success('Nenhuma alteração para salvar.');
        setIsSaving(false);
        return;
    }


    try {
        // Usar a API PATCH existente para Workspaces
      const response = await axios.patch(`/api/workspaces/${workspace.id}`, dataToUpdate);

      if (response.status === 200) {
        toast.success('Configurações da Lumibot salvas com sucesso!');
        await refreshWorkspaces(); // Atualiza os dados do workspace no contexto
        setApiToken(''); // Limpa o campo do token após salvar
      } else {
        throw new Error(response.data.message || 'Falha ao salvar configurações');
      }
    } catch (err: any) {
      console.error("Erro ao salvar configurações Lumibot:", err);
      const message = err.response?.data?.message || err.message || 'Ocorreu um erro.';
      setError(message);
      toast.error(`Erro: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (workspaceLoading) {
    return <p className="text-muted-foreground">Carregando dados do workspace...</p>;
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-card-foreground">Integração Lumibot/Chatwoot</CardTitle>
        <CardDescription>
          Configure as credenciais para permitir o envio de respostas da IA através da sua conta Lumibot.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
           {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md">
                {error}
              </div>
           )}
          <div className="space-y-1.5">
            <Label htmlFor="lumibot_account_id" className="text-foreground">
              Lumibot Account ID
            </Label>
            <Input
              id="lumibot_account_id"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="Insira o ID da sua conta Lumibot"
              className="bg-input border-input"
              disabled={isSaving}
            />
             <p className="text-xs text-muted-foreground">
               Encontrado na URL do seu painel Lumibot (app.lumibot.com.br/accounts/<strong>ID_AQUI</strong>/...).
             </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lumibot_api_token" className="text-foreground">
              Lumibot API Access Token (Agente)
            </Label>
            <Input
              id="lumibot_api_token"
              type="password" // Mascara o token
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Insira o token de API do agente (ou deixe em branco para manter)"
              className="bg-input border-input font-mono" // Fonte mono para tokens
              disabled={isSaving}
            />
             <p className="text-xs text-muted-foreground">
                Gere um token no perfil do agente que será usado para enviar as mensagens via API. Mantenha este token seguro.
             </p>
          </div>
        </CardContent>
        <CardFooter className="border-t border-border pt-4">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isSaving ? 'Salvando...' : 'Salvar Configurações Lumibot'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}