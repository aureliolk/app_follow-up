'use client';
import { useState, useEffect } from 'react';
import { Key, Trash2, Copy, Clock, AlertCircle, CheckCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from '@/lib/utils';

type ApiToken = {
  id: string;
  name: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked: boolean;
  creator: {
    name: string;
    email: string;
  };
};

export default function ApiTokenManager({ workspaceId }: { workspaceId: string }) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [showTokenValue, setShowTokenValue] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [expirationDays, setExpirationDays] = useState('30');
  const [deletingTokenId, setDeletingTokenId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTokens() {
      try {
        setLoading(true);
        setError(null);
        setSuccessMessage(null);

        const mockTokens = [
          {
            id: '1',
            name: 'Token de Integração X',
            token: 'mock_token_1...xyz',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            last_used_at: null,
            revoked: false,
            creator: { name: 'Alice', email: 'alice@example.com' },
          },
          {
            id: '2',
            name: 'Token de Teste API',
            token: 'mock_token_2...abc',
            created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            expires_at: null,
            last_used_at: new Date().toISOString(),
            revoked: true,
            creator: { name: 'Bob', email: 'bob@example.com' },
          },
          {
            id: '3',
            name: 'Token Expirado',
            token: 'mock_token_3...def',
            created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
            expires_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            last_used_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
            revoked: false,
            creator: { name: 'Charlie', email: 'charlie@example.com' },
          },
        ];

        try {
          const response = await fetch(`/api/workspaces/${workspaceId}/api-tokens`);

          if (response.ok) {
            const data = await response.json();
            if (data.tokens && Array.isArray(data.tokens)) {
              const sortedTokens = data.tokens.sort((a: ApiToken, b: ApiToken) => {
                const aIsActive = !a.revoked && (!a.expires_at || new Date(a.expires_at) > new Date());
                const bIsActive = !b.revoked && (!b.expires_at || new Date(b.expires_at) > new Date());
                if (aIsActive && !bIsActive) return -1;
                if (!aIsActive && bIsActive) return 1;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              });
              setTokens(sortedTokens);
              setLoading(false);
              return;
            } else {
               throw new Error("Formato de resposta da API inválido.");
            }
          } else {
             const errorData = await response.json().catch(() => ({ error: "Erro ao buscar tokens" }));
             throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`);
          }
        } catch (fetchError) {
          console.error("Erro ao buscar tokens da API, usando dados mockados:", fetchError);
          const sortedMockTokens = mockTokens.sort((a, b) => {
            const aIsActive = !a.revoked && (!a.expires_at || new Date(a.expires_at) > new Date());
            const bIsActive = !b.revoked && (!b.expires_at || new Date(b.expires_at) > new Date());
            if (aIsActive && !bIsActive) return -1;
            if (!aIsActive && bIsActive) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          setTokens(sortedMockTokens);
          setError('Falha ao carregar tokens da API. Exibindo dados de exemplo.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido ao carregar tokens.');
        setTokens([]);
      } finally {
        setLoading(false);
      }
    }

    fetchTokens();
  }, [workspaceId]);

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) {
      setError('Nome do token é obrigatório.');
      toast.error('Nome do token é obrigatório.');
      return;
    }

    setCreatingToken(true);
    setError(null);
    setSuccessMessage(null);
    setNewTokenValue(null);

    let expires_at_iso: string | null = null;
    if (expirationDays !== 'never') {
       const expires_at = new Date();
       expires_at.setDate(expires_at.getDate() + parseInt(expirationDays, 10));
       expires_at_iso = expires_at.toISOString();
    }

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/api-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newTokenName.trim(),
          expires_at: expires_at_iso,
        }),
      });

       const data = await response.json();

      if (response.ok) {
        if (data.token && data.tokenInfo) {
            setNewTokenValue(data.token);
            setTokens(prev => [data.tokenInfo, ...prev]);
            setNewTokenName('');
            setExpirationDays('30');
            setShowTokenForm(false);
            setShowTokenValue(false);
            toast.success('Token criado com sucesso!');
         } else {
            throw new Error("Resposta da API ao criar token incompleta.");
         }
      } else {
         throw new Error(data.error || `Erro ${response.status} ao criar token.`);
      }
    } catch (err) {
       console.error("Erro ao criar token:", err);
       const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao criar o token.';
       setError(errorMessage);
       toast.error(`Falha ao criar token: ${errorMessage}`);
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
     if (!confirm('Tem certeza que deseja revogar este token? Aplicações usando este token perderão o acesso.')) {
       return;
     }

    setError(null);
    setSuccessMessage(null);
    const originalTokens = [...tokens];

    setTokens(prev => prev.map(token =>
      token.id === tokenId ? { ...token, revoked: true } : token
    ));

    try {
       const response = await fetch(`/api/workspaces/${workspaceId}/api-tokens/${tokenId}`, {
        method: 'DELETE',
      });

       const data = await response.json();

      if (!response.ok) {
         throw new Error(data.error || `Erro ${response.status} ao revogar token.`);
      }

      setSuccessMessage(data.message || 'Token revogado com sucesso.');
      toast.success('Token revogado.');

    } catch (err) {
      console.error("Erro ao revogar token:", err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao revogar token.';
      setError(errorMessage);
      toast.error(`Falha ao revogar token: ${errorMessage}`);
      setTokens(originalTokens);
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
     if (!confirm('Tem certeza que deseja excluir permanentemente este token revogado? Esta ação não pode ser desfeita.')) {
       return;
     }

    setDeletingTokenId(tokenId);
    setError(null);
    setSuccessMessage(null);
    const originalTokens = [...tokens];

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/api-tokens/${tokenId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Permanent-Delete': 'true'
        }
      });

      const data = await response.json();

      if (response.ok) {
        setTokens(prev => prev.filter(token => token.id !== tokenId));
        setSuccessMessage(data.message || "Token excluído permanentemente.");
        toast.success("Token excluído permanentemente.");
      } else {
        throw new Error(data.error || `Erro ${response.status} ao excluir token.`);
      }
    } catch (err) {
      console.error("Erro ao excluir token permanentemente:", err);
       const errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao excluir token.";
       setError(errorMessage);
       toast.error(`Falha ao excluir token: ${errorMessage}`);
    } finally {
      setDeletingTokenId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast.success('Token copiado para a área de transferência!');
      })
      .catch(err => {
        console.error('Erro ao copiar o token:', err);
        toast.error('Falha ao copiar o token.');
      });
  };

  const getTokenStatus = (token: ApiToken): { text: string; colorClass: string; variant: "default" | "destructive" | "warning" | "success" } => {
    if (token.revoked) {
      return { text: 'Revogado', colorClass: 'text-red-500 bg-red-500/10', variant: 'destructive' };
    }
    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      return { text: 'Expirado', colorClass: 'text-yellow-500 bg-yellow-500/10', variant: 'warning' };
    }
    return { text: 'Ativo', colorClass: 'text-green-500 bg-green-500/10', variant: 'success' };
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Gerenciar Tokens</CardTitle>
            {!showTokenForm && (
              <Button onClick={() => setShowTokenForm(true)}>
                <Key className="mr-2 h-4 w-4" /> Criar Novo Token
              </Button>
            )}
          </div>
          <CardDescription>
            Crie e gerencie tokens de API para permitir acesso externo seguro.
          </CardDescription>
        </CardHeader>
        <CardContent>
           {newTokenValue && (
             <Alert variant="default" className="mb-6 border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400">
               <CheckCircle className="h-5 w-5" />
               <AlertTitle>Token Criado com Sucesso!</AlertTitle>
               <AlertDescription>
                 <p className="mb-3">Copie este token agora. Ele não será exibido novamente por motivos de segurança.</p>
                 <div className="flex items-center bg-muted p-3 rounded-md border">
                   <span className={cn(
                     "flex-1 font-mono text-sm overflow-x-auto mr-2",
                     !showTokenValue && "blur-sm select-none"
                   )}>
                     {newTokenValue}
                   </span>
                   <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowTokenValue(!showTokenValue)}
                      className="mr-1"
                      title={showTokenValue ? "Ocultar token" : "Mostrar token"}
                    >
                      {showTokenValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                   <Button
                     variant="ghost"
                     size="icon"
                     onClick={() => copyToClipboard(newTokenValue)}
                     title="Copiar para área de transferência"
                   >
                     <Copy className="h-4 w-4" />
                   </Button>
                 </div>
                 <div className="mt-4 text-right">
                   <Button variant="link" onClick={() => setNewTokenValue(null)} className="text-muted-foreground h-auto p-0">
                     Entendido, fechar
                   </Button>
                 </div>
               </AlertDescription>
             </Alert>
           )}

          {showTokenForm && (
            <Card className="mb-6 bg-muted/50 border">
               <CardHeader>
                  <CardTitle className="text-base">Criar Novo Token de API</CardTitle>
               </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateToken} className="space-y-4">
                  <div>
                    <Label htmlFor="tokenName">Nome do Token</Label>
                    <Input
                      id="tokenName"
                      type="text"
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                      placeholder="Ex: Integração CRM, Script de Backup"
                      required
                      className="mt-1"
                      disabled={creatingToken}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Um nome descritivo para identificar o uso do token.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="tokenExpiration">Expiração</Label>
                     <Select
                        value={expirationDays}
                        onValueChange={setExpirationDays}
                        disabled={creatingToken}
                      >
                        <SelectTrigger id="tokenExpiration" className="mt-1">
                          <SelectValue placeholder="Selecione a expiração" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 dias</SelectItem>
                          <SelectItem value="30">30 dias</SelectItem>
                          <SelectItem value="90">90 dias</SelectItem>
                          <SelectItem value="365">1 ano</SelectItem>
                           <SelectItem value="never">Nunca expira</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>

                  <div className="flex justify-end space-x-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowTokenForm(false)}
                      disabled={creatingToken}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={creatingToken || !newTokenName.trim()}
                    >
                      {creatingToken ? (
                        <>
                          <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                          Criando...
                        </>
                      ) : (
                        'Criar Token'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

           {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && !newTokenValue && (
            <Alert variant="default" className="mb-6 border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
              <AlertTitle>Sucesso</AlertTitle>
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

           {loading ? (
             <div className="space-y-4 mt-6">
               <Skeleton className="h-10 w-full" />
               <Skeleton className="h-10 w-full" />
               <Skeleton className="h-10 w-full" />
             </div>
           ) : tokens.length > 0 ? (
            <div className="border rounded-lg overflow-hidden mt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Último Uso</TableHead>
                    <TableHead>Expiração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((token) => {
                     const status = getTokenStatus(token);
                     const isExpired = status.text === 'Expirado';
                     const isRevoked = status.text === 'Revogado';
                     const isBeingDeleted = deletingTokenId === token.id;

                     return (
                      <TableRow key={token.id} className={cn(isRevoked && "opacity-60")}>
                        <TableCell>
                          <div className="font-medium">{token.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Criado {formatDistanceToNow(new Date(token.created_at), { addSuffix: true, locale: ptBR })}
                            {token.creator?.name && ` por ${token.creator.name}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {token.last_used_at ? (
                            formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true, locale: ptBR })
                          ) : (
                            'Nunca'
                          )}
                        </TableCell>
                         <TableCell className="text-sm text-muted-foreground">
                          {token.expires_at ? (
                             <span className={cn(isExpired && "text-yellow-600 dark:text-yellow-500")}>
                               {formatDistanceToNow(new Date(token.expires_at), { addSuffix: true, locale: ptBR })}
                             </span>
                          ) : (
                            'Não expira'
                          )}
                        </TableCell>
                        <TableCell>
                           <span className={cn(
                             "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                              status.colorClass
                           )}>
                             {status.text}
                           </span>
                        </TableCell>
                        <TableCell className="text-right">
                           {isRevoked || isExpired ? (
                             <Button
                               variant="destructive"
                               size="sm"
                               onClick={() => handleDeleteToken(token.id)}
                               disabled={isBeingDeleted}
                               title="Excluir token permanentemente"
                              >
                               {isBeingDeleted ? (
                                 <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                               ) : (
                                  <Trash2 className="h-4 w-4 mr-1" />
                               )}
                               Excluir
                             </Button>
                           ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRevokeToken(token.id)}
                              className="text-muted-foreground hover:text-destructive"
                              title="Revogar token"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
             <Card className="mt-6 border-dashed text-center py-12">
               <CardHeader className="items-center">
                  <Key className="h-10 w-10 text-muted-foreground mb-3" />
                  <CardTitle>Nenhum Token de API Encontrado</CardTitle>
                  <CardDescription>
                     Crie seu primeiro token para começar a usar a API.
                  </CardDescription>
               </CardHeader>
                <CardContent>
                  {!showTokenForm && (
                     <Button onClick={() => setShowTokenForm(true)} className="mt-2">
                       <Key className="mr-2 h-4 w-4" /> Criar Primeiro Token
                     </Button>
                  )}
                </CardContent>
             </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Como Usar os Tokens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Para autenticar requisições à API, inclua seu token no cabeçalho HTTP <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">x-api-key</code>.
          </p>

          <div className="bg-muted p-4 rounded-md border">
            <pre className="overflow-x-auto">
              <code className="text-xs font-mono">
                {`fetch('/api/some-endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'SEU_TOKEN_AQUI'
  },
  body: JSON.stringify({ /* seu payload */ })
});`}
              </code>
            </pre>
          </div>

          <Alert variant="default" className="border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle>Dica de Segurança</AlertTitle>
            <AlertDescription>
              Mantenha seus tokens seguros como senhas. Nunca os exponha em código-fonte público ou em logs. Revogue tokens comprometidos imediatamente.
            </AlertDescription>
          </Alert>

          <p className="text-muted-foreground">
            Consulte a <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">documentação completa da API</a> para mais detalhes e endpoints disponíveis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}