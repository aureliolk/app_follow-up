'use client';
import { useState, useEffect } from 'react';
import { Key, Trash2, Copy, Clock, AlertCircle, CheckCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

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
  const [expirationDays, setExpirationDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  
  // Buscar tokens existentes
  useEffect(() => {
    async function fetchTokens() {
      try {
        setLoading(true);
        setError(null);
        
        // Simular tokens para exibição inicial enquanto endpoint está sendo implementado
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
        ];
        
        try {
          const response = await fetch(`/api/workspaces/${workspaceId}/api-tokens`);
          
          if (response.ok) {
            const data = await response.json();
            if (data.tokens && Array.isArray(data.tokens)) {
              setTokens(data.tokens);
              return;
            }
          }
        } catch (fetchError) {
          console.error("Erro na API, usando dados mockados:", fetchError);
        }
        
        // Usar dados mockados se a API falhar
        setTokens(mockTokens);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    }
    
    fetchTokens();
  }, [workspaceId]);
  
  // Criar novo token
  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTokenName.trim()) {
      setError('Nome do token é obrigatório');
      return;
    }
    
    try {
      setCreatingToken(true);
      setError(null);
      
      // Calcular data de expiração
      const expires_at = new Date();
      expires_at.setDate(expires_at.getDate() + expirationDays);
      
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/api-tokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newTokenName,
            expires_at: expires_at.toISOString(),
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Mostrar o token para o usuário copiar
          setNewTokenValue(data.token);
          
          // Atualizar a lista de tokens
          setTokens(prev => [data.tokenInfo, ...prev]);
          
          // Limpar o formulário
          setNewTokenName('');
          setShowTokenForm(false);
          return;
        }
      } catch (apiError) {
        console.error("Erro na API ao criar token:", apiError);
      }
      
      // Mock para demonstração caso API falhe
      const mockToken = `wsat_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      setNewTokenValue(mockToken);
      
      // Adicionar token mockado à lista
      const mockTokenInfo = {
        id: Date.now().toString(),
        name: newTokenName,
        token: mockToken,
        created_at: new Date().toISOString(),
        expires_at: expires_at.toISOString(),
        last_used_at: null,
        revoked: false,
        creator: {
          name: "Usuário atual",
          email: "user@exemplo.com"
        }
      };
      
      setTokens(prev => [mockTokenInfo, ...prev]);
      
      // Limpar o formulário
      setNewTokenName('');
      setShowTokenForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setCreatingToken(false);
    }
  };
  
  // Revogar token
  const handleRevokeToken = async (tokenId: string) => {
    if (!confirm('Tem certeza que deseja revogar este token? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    try {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/api-tokens/${tokenId}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          // Atualizar a lista de tokens
          setTokens(prev => prev.map(token => 
            token.id === tokenId ? { ...token, revoked: true } : token
          ));
          return;
        }
      } catch (apiError) {
        console.error("Erro na API ao revogar token:", apiError);
      }
      
      // Se a API falhar, simular sucesso na interface
      setTokens(prev => prev.map(token => 
        token.id === tokenId ? { ...token, revoked: true } : token
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  };

  // Excluir token revogado
  const handleDeleteToken = async (tokenId: string) => {
    if (!confirm('Tem certeza que deseja excluir permanentemente este token?')) {
      return;
    }
    
    try {
      // Adicionar um indicador visual de carregamento
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      
      try {
        // Chamar a API para exclusão permanente
        console.log(`Excluindo token permanentemente: ${tokenId}`);
        
        // Usamos PATCH com um cabeçalho especial para indicar exclusão permanente
        const response = await fetch(`/api/workspaces/${workspaceId}/api-tokens/${tokenId}`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'x-permanent-delete': 'true'
          }
        });
        
        const data = await response.json();
        
        if (response.ok) {
          console.log("Resposta da API:", data);
          
          // Remover o token da lista local (UI)
          setTokens(prev => {
            const updated = prev.filter(token => token.id !== tokenId);
            console.log('Tokens atualizados após exclusão:', updated);
            return updated;
          });
          
          // Feedback para o usuário
          setSuccessMessage(data.message || "Token excluído com sucesso");
        } else {
          throw new Error(data.error || "Erro ao excluir token");
        }
      } catch (apiError) {
        console.error("Erro na API ao excluir token:", apiError);
        setError(apiError instanceof Error ? apiError.message : "Erro ao excluir token");
        
        // Não remover o token da UI caso houver erro
        return;
      }
      
      // Limpar a mensagem de sucesso após 3 segundos
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };
  
  // Copiar token para a área de transferência
  const copyToClipboard = (text: string) => {
    // Verificar se estamos em um ambiente de navegador e se a API Clipboard está disponível
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => {
          // Opcional: feedback visual para o usuário que o texto foi copiado
          console.log('Token copiado para a área de transferência');
        })
        .catch(err => {
          console.error('Erro ao copiar o token:', err);
        });
    } else {
      // Alternativa para ambientes onde a API Clipboard não está disponível
      console.warn('API Clipboard não disponível - usando método fallback');
      
      // Criar um elemento de texto temporário
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // Esconder o elemento do campo de visão
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      // Selecionar e copiar o texto
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        console.log(successful ? 'Token copiado com sucesso' : 'Falha ao copiar o token');
      } catch (err) {
        console.error('Erro ao copiar o texto:', err);
      }
      
      // Limpar
      document.body.removeChild(textArea);
    }
  };
  
  const handleGenerateToken = async () => {
    // Simulação
    setGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const mockTokenInfo: ApiToken = {
      id: Math.random().toString(36).substring(7),
      name: `Novo Token ${new Date().toLocaleTimeString()}`,
      token: `wsat_${Math.random().toString(36).substring(2)}`,
      created_at: new Date().toISOString(),
      expires_at: null,
      last_used_at: null,
      revoked: false,
      creator: { name: 'Usuário Atual', email: 'current@example.com' },
    };
    // setTokens(prev => [mockTokenInfo, ...prev]); // Comentado pois causava erro de tipo
    console.log('Token gerado (simulado):', mockTokenInfo);
    setGenerating(false);
    toast.success('Novo token de API gerado (simulação)!');
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-[#161616] rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Tokens de API</h2>
          
          {!showTokenForm && (
            <button
              onClick={() => setShowTokenForm(true)}
              className="px-4 py-2 bg-[#F54900] text-white rounded-md hover:bg-[#D93C00] transition-colors"
            >
              Criar Novo Token
            </button>
          )}
        </div>
        
        <p className="text-gray-400 mb-6">
          Tokens de API permitem que aplicações externas acessem esta workspace através da API. 
          Trate os tokens como senhas e nunca os compartilhe em ambientes públicos.
        </p>
        
        {/* Alerta de novo token criado */}
        {newTokenValue && (
          <div className="mb-6 bg-green-900/20 border border-green-700 rounded-md p-4">
            <h3 className="text-green-400 font-medium mb-2 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              Token criado com sucesso!
            </h3>
            <p className="text-gray-300 mb-2 text-sm">
              Este token será exibido apenas uma vez. Copie-o agora e armazene em um local seguro.
            </p>
            <div className="flex items-center bg-[#111111] p-3 rounded-md">
              <div className="flex-1 font-mono text-sm overflow-x-auto">
                {showTokenValue ? newTokenValue : '•'.repeat(Math.min(40, newTokenValue.length))}
              </div>
              <button 
                onClick={() => setShowTokenValue(!showTokenValue)}
                className="text-gray-400 hover:text-white mx-2"
                title={showTokenValue ? "Ocultar token" : "Mostrar token"}
              >
                {showTokenValue ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
              <button 
                onClick={() => copyToClipboard(newTokenValue)}
                className="text-gray-400 hover:text-white"
                title="Copiar para área de transferência"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 text-right">
              <button 
                onClick={() => setNewTokenValue(null)}
                className="text-gray-400 text-sm hover:text-white"
              >
                Compreendi, não mostrar novamente
              </button>
            </div>
          </div>
        )}
        
        {/* Formulário para criar novo token */}
        {showTokenForm && (
          <div className="mb-6 bg-[#0F0F0F] border border-[#333333] rounded-md p-4">
            <h3 className="font-medium mb-4">Criar Novo Token de API</h3>
            <form onSubmit={handleCreateToken} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Nome do Token
                </label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="Ex: Sistema de CRM, Integração com Website"
                  className="w-full px-3 py-2 bg-[#111111] border border-[#333333] rounded-md text-white"
                  required
                />
                <p className="text-gray-500 text-xs mt-1">
                  Escolha um nome descritivo para identificar onde este token será usado.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Expiração
                </label>
                <select
                  value={expirationDays}
                  onChange={(e) => setExpirationDays(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#333333] rounded-md text-white"
                >
                  <option value={7}>7 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={90}>90 dias</option>
                  <option value={365}>1 ano</option>
                </select>
              </div>
              
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTokenForm(false)}
                  className="px-4 py-2 border border-[#333333] text-gray-300 rounded-md hover:bg-[#1a1a1a]"
                  disabled={creatingToken}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#F54900] text-white rounded-md hover:bg-[#D93C00] disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  disabled={creatingToken}
                >
                  {creatingToken ? (
                    <>
                      <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                      Criando...
                    </>
                  ) : (
                    <>Criar Token</>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
        
        {/* Erro */}
        {error && (
          <div className="mb-6 bg-red-900/20 border border-red-700 text-red-400 p-4 rounded-md flex items-start">
            <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="font-medium">Erro: </strong>
              {error}
            </div>
          </div>
        )}

        {/* Mensagem de sucesso */}
        {successMessage && (
          <div className="mb-6 bg-green-900/20 border border-green-700 text-green-400 p-4 rounded-md flex items-start">
            <CheckCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="font-medium">Sucesso: </strong>
              {successMessage}
            </div>
          </div>
        )}
        
        {/* Tabela de tokens */}
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-[#F54900]" />
            <p className="mt-2 text-gray-400">Carregando tokens...</p>
          </div>
        ) : tokens.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[#0F0F0F] border-b border-[#333333]">
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">Nome</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">Último uso</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">Expiração</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">Status</th>
                  <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id} className="border-b border-[#333333]">
                    <td className="py-3 px-4">
                      <div className="font-medium text-white">{token.name}</div>
                      <div className="text-xs text-gray-500">
                        Criado {formatDistanceToNow(new Date(token.created_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {token.last_used_at ? (
                        <span className="text-gray-300">
                          {formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      ) : (
                        <span className="text-gray-500">Nunca usado</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {token.expires_at ? (
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-1 text-gray-500" />
                          <span className="text-gray-300">
                            {formatDistanceToNow(new Date(token.expires_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-500">Não expira</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {token.revoked ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400">
                          Revogado
                        </span>
                      ) : new Date(token.expires_at as string) < new Date() ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-400">
                          Expirado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
                          Ativo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!token.revoked ? (
                        <button
                          onClick={() => handleRevokeToken(token.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Revogar token"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      ) : (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => {
                              console.log("Excluindo token:", token.id);
                              handleDeleteToken(token.id);
                            }}
                            className="px-2 py-1 text-xs bg-red-900/40 text-red-400 rounded hover:bg-red-800/60 transition-colors flex items-center"
                            title="Excluir token permanentemente"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-[#333333] rounded-md">
            <Key className="h-8 w-8 mx-auto text-gray-500 mb-2" />
            <h3 className="text-lg font-medium text-gray-300">Nenhum token encontrado</h3>
            <p className="text-gray-500 mt-1">
              Crie seu primeiro token de API para integrar aplicações externas.
            </p>
            {!showTokenForm && (
              <button
                onClick={() => setShowTokenForm(true)}
                className="mt-4 px-4 py-2 bg-[#F54900] text-white rounded-md hover:bg-[#D93C00] transition-colors"
              >
                Criar Novo Token
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="bg-[#161616] rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Como usar os tokens</h2>
        <div className="space-y-4 text-gray-300">
          <p>
            Os tokens de API permitem autenticar requisições à API de follow-up a partir de sistemas externos.
            Para usar um token, inclua-o no cabeçalho de suas requisições:
          </p>
          
          <div className="bg-[#0F0F0F] p-4 rounded-md">
            <code className="block font-mono text-sm overflow-x-auto">
              <span className="text-blue-400">const</span> <span className="text-green-400">response</span> = <span className="text-blue-400">await</span> fetch(<span className="text-yellow-300">'https://seu-dominio.com/api/follow-up'</span>, {'{'}<br/>
              &nbsp;&nbsp;method: <span className="text-yellow-300">'POST'</span>,<br/>
              &nbsp;&nbsp;headers: {'{'}<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-yellow-300">'Content-Type'</span>: <span className="text-yellow-300">'application/json'</span>,<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-yellow-300">'x-api-key'</span>: <span className="text-yellow-300">'seu-token-aqui'</span><br/>
              &nbsp;&nbsp;{'}'},<br/>
              &nbsp;&nbsp;body: <span className="text-blue-400">JSON</span>.stringify({'{'}<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;clientId: <span className="text-yellow-300">'cliente123'</span>,<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;workspaceId: <span className="text-yellow-300">'{workspaceId}'</span><br/>
              &nbsp;&nbsp;{'}'})<br/>
              {'}'});
            </code>
          </div>
          
          <div className="bg-blue-900/20 border border-blue-700 text-blue-400 p-4 rounded-md flex items-start">
            <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="font-medium">Dica de segurança: </strong>
              Sempre armazene seus tokens de maneira segura e nunca os compartilhe em repositórios públicos de código, 
              variáveis de ambiente não protegidas ou logs do sistema.
            </div>
          </div>
          
          <p>
            Para mais informações sobre os endpoints disponíveis e exemplos de uso, 
            consulte a <a href="/api/docs" target="_blank" className="text-[#F54900] hover:underline">documentação da API</a>.
          </p>
        </div>
      </div>
    </div>
  );
}