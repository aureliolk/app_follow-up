'use client';
import { useState, useEffect } from 'react';
import { Trash2, Copy, Clock, AlertCircle, CheckCircle, RefreshCw, Globe, Plus, Edit2, Key } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Webhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  creator: {
    name: string;
    email: string;
  };
};

export default function WebhookManager({ workspaceId }: { workspaceId: string }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null);
  
  // Form state
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['follow-up.created']);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  
  // Eventos disponíveis para webhooks
  const availableEvents = [
    { id: 'follow-up.created', label: 'Follow-up criado' },
    { id: 'follow-up.completed', label: 'Follow-up concluído' },
    { id: 'follow-up.cancelled', label: 'Follow-up cancelado' },
    { id: 'message.sent', label: 'Mensagem enviada' },
    { id: 'message.received', label: 'Resposta do cliente recebida' }
  ];
  
  // Buscar webhooks existentes
  useEffect(() => {
    async function fetchWebhooks() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/workspaces/${workspaceId}/webhooks`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.webhooks && Array.isArray(data.webhooks)) {
            setWebhooks(data.webhooks);
            return;
          }
        }
        
        // Usar dados mockados se a API falhar
        setWebhooks([
          {
            id: "mock-1",
            name: "Sistema CRM",
            url: "https://meu-crm.com/webhooks/callback",
            events: ["follow-up.created", "follow-up.completed"],
            active: true,
            created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            last_used_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            creator: {
              name: "Admin",
              email: "admin@exemplo.com"
            }
          }
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    }
    
    fetchWebhooks();
  }, [workspaceId]);
  
  // Criar novo webhook
  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!webhookName.trim() || !webhookUrl.trim() || webhookEvents.length === 0) {
      setError('Todos os campos são obrigatórios');
      return;
    }
    
    try {
      setCreatingWebhook(true);
      setError(null);
      
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: webhookName,
          url: webhookUrl,
          events: webhookEvents
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Mostrar o segredo para o usuário
        setNewSecret(data.secret);
        
        // Adicionar o novo webhook à lista
        const newWebhook: Webhook = {
          id: data.id,
          name: data.name,
          url: data.url,
          events: data.events,
          active: data.active,
          created_at: data.created_at,
          updated_at: data.created_at,
          last_used_at: null,
          creator: {
            name: "Usuário atual",
            email: "user@exemplo.com"
          }
        };
        
        setWebhooks(prev => [newWebhook, ...prev]);
        
        // Mostrar mensagem de sucesso
        setSuccessMessage("Webhook criado com sucesso");
        setTimeout(() => setSuccessMessage(null), 3000);
        
        // Limpar o formulário
        resetForm();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao criar webhook");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setCreatingWebhook(false);
    }
  };
  
  // Atualizar webhook
  const handleUpdateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!webhookName.trim() || !webhookUrl.trim() || webhookEvents.length === 0 || !editingWebhook) {
      setError('Todos os campos são obrigatórios');
      return;
    }
    
    try {
      setCreatingWebhook(true);
      setError(null);
      
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks/${editingWebhook}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: webhookName,
          url: webhookUrl,
          events: webhookEvents
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Atualizar o webhook na lista
        setWebhooks(prev => 
          prev.map(webhook => 
            webhook.id === editingWebhook 
              ? {
                  ...webhook,
                  name: data.name,
                  url: data.url,
                  events: data.events,
                  active: data.active,
                  updated_at: data.updated_at
                }
              : webhook
          )
        );
        
        // Mostrar mensagem de sucesso
        setSuccessMessage("Webhook atualizado com sucesso");
        setTimeout(() => setSuccessMessage(null), 3000);
        
        // Limpar o formulário
        resetForm();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao atualizar webhook");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setCreatingWebhook(false);
    }
  };
  
  // Regenerar segredo do webhook
  const handleRegenerateSecret = async (webhookId: string) => {
    if (!confirm('Tem certeza que deseja regenerar o segredo deste webhook? Os sistemas que usam este webhook deixarão de funcionar até que você atualize o segredo neles.')) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks/${webhookId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          regenerateSecret: true
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Mostrar o novo segredo ao usuário
        setNewSecret(data.secret);
        
        // Mostrar mensagem de sucesso
        setSuccessMessage("Segredo regenerado com sucesso");
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao regenerar segredo");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };
  
  // Excluir webhook
  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Tem certeza que deseja excluir este webhook? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks/${webhookId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Remover o webhook da lista
        setWebhooks(prev => prev.filter(webhook => webhook.id !== webhookId));
        
        // Mostrar mensagem de sucesso
        setSuccessMessage("Webhook excluído com sucesso");
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao excluir webhook");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };
  
  // Alternar status do webhook
  const handleToggleWebhookStatus = async (webhookId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks/${webhookId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          active: !currentStatus
        }),
      });
      
      if (response.ok) {
        // Atualizar o status na lista
        setWebhooks(prev => 
          prev.map(webhook => 
            webhook.id === webhookId 
              ? { ...webhook, active: !currentStatus }
              : webhook
          )
        );
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao alterar status do webhook");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  };
  
  // Copiar para a área de transferência
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Feedback visual opcional
        console.log('Copiado para a área de transferência');
      })
      .catch(err => {
        console.error('Erro ao copiar:', err);
      });
  };

  // Iniciar edição de um webhook
  const startEditingWebhook = (webhook: Webhook) => {
    setWebhookName(webhook.name);
    setWebhookUrl(webhook.url);
    setWebhookEvents(webhook.events);
    setEditingWebhook(webhook.id);
    setShowWebhookForm(true);
  };
  
  // Limpar formulário
  const resetForm = () => {
    setWebhookName('');
    setWebhookUrl('');
    setWebhookEvents(['follow-up.created']);
    setEditingWebhook(null);
    setShowWebhookForm(false);
  };
  
  // Toggle para eventos
  const toggleEvent = (eventId: string) => {
    if (webhookEvents.includes(eventId)) {
      setWebhookEvents(webhookEvents.filter(e => e !== eventId));
    } else {
      setWebhookEvents([...webhookEvents, eventId]);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-[#161616] rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Webhooks</h2>
          
          {!showWebhookForm && (
            <button
              onClick={() => setShowWebhookForm(true)}
              className="px-4 py-2 bg-[#F54900] text-white rounded-md hover:bg-[#D93C00] transition-colors flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Webhook
            </button>
          )}
        </div>
        
        <p className="text-gray-400 mb-6">
          Webhooks permitem que sua aplicação receba notificações em tempo real quando eventos ocorrem no sistema de follow-up.
        </p>
        
        {/* Alerta de novo segredo */}
        {newSecret && (
          <div className="mb-6 bg-green-900/20 border border-green-700 rounded-md p-4">
            <h3 className="text-green-400 font-medium mb-2 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              Segredo do Webhook
            </h3>
            <p className="text-gray-300 mb-2 text-sm">
              Este segredo será exibido apenas uma vez. Copie-o agora e armazene em um local seguro.
              Use-o para verificar a autenticidade das requisições enviadas para seu endpoint.
            </p>
            <div className="flex items-center bg-[#111111] p-3 rounded-md">
              <div className="flex-1 font-mono text-sm overflow-x-auto">
                {newSecret}
              </div>
              <button 
                onClick={() => copyToClipboard(newSecret)}
                className="text-gray-400 hover:text-white"
                title="Copiar para área de transferência"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 text-right">
              <button 
                onClick={() => setNewSecret(null)}
                className="text-gray-400 text-sm hover:text-white"
              >
                Compreendi, não mostrar novamente
              </button>
            </div>
          </div>
        )}
        
        {/* Formulário para criar/editar webhook */}
        {showWebhookForm && (
          <div className="mb-6 bg-[#0F0F0F] border border-[#333333] rounded-md p-4">
            <h3 className="font-medium mb-4">
              {editingWebhook ? 'Editar Webhook' : 'Criar Novo Webhook'}
            </h3>
            <form onSubmit={editingWebhook ? handleUpdateWebhook : handleCreateWebhook} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Nome do Webhook
                </label>
                <input
                  type="text"
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  placeholder="Ex: Integração com CRM, Notificações Slack"
                  className="w-full px-3 py-2 bg-[#111111] border border-[#333333] rounded-md text-white"
                  required
                />
                <p className="text-gray-500 text-xs mt-1">
                  Identificação para este webhook.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  URL do Endpoint
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://seu-app.com/api/webhooks/follow-up"
                  className="w-full px-3 py-2 bg-[#111111] border border-[#333333] rounded-md text-white"
                  required
                />
                <p className="text-gray-500 text-xs mt-1">
                  A URL que receberá as requisições POST com dados dos eventos.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Eventos
                </label>
                <div className="space-y-2 mt-2">
                  {availableEvents.map(event => (
                    <label key={event.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(event.id)}
                        onChange={() => toggleEvent(event.id)}
                        className="rounded bg-[#111111] border-[#333333] text-[#F54900] focus:ring-[#F54900]"
                      />
                      <span className="text-gray-300">{event.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  Selecione os eventos para os quais deseja receber notificações.
                </p>
              </div>
              
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-[#333333] text-gray-300 rounded-md hover:bg-[#1a1a1a]"
                  disabled={creatingWebhook}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#F54900] text-white rounded-md hover:bg-[#D93C00] disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  disabled={creatingWebhook}
                >
                  {creatingWebhook ? (
                    <>
                      <RefreshCw className="animate-spin h-4 w-4 mr-2" />
                      {editingWebhook ? 'Atualizando...' : 'Criando...'}
                    </>
                  ) : (
                    <>{editingWebhook ? 'Atualizar Webhook' : 'Criar Webhook'}</>
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
        
        {/* Lista de webhooks */}
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-[#F54900]" />
            <p className="mt-2 text-gray-400">Carregando webhooks...</p>
          </div>
        ) : webhooks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[#0F0F0F] border-b border-[#333333]">
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">Nome</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">URL</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">Eventos</th>
                  <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">Status</th>
                  <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook) => (
                  <tr key={webhook.id} className="border-b border-[#333333]">
                    <td className="py-3 px-4">
                      <div className="font-medium text-white">{webhook.name}</div>
                      <div className="text-xs text-gray-500">
                        Criado {formatDistanceToNow(new Date(webhook.created_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <Globe className="h-4 w-4 mr-2 text-gray-500" />
                        <span className="text-gray-300 text-sm font-mono truncate max-w-[200px]">
                          {webhook.url}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {webhook.events.map(event => (
                          <span 
                            key={event} 
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400"
                          >
                            {event.split('.')[1]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleWebhookStatus(webhook.id, webhook.active)}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          webhook.active 
                            ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50' 
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {webhook.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => startEditingWebhook(webhook)}
                          className="text-gray-400 hover:text-blue-500 transition-colors"
                          title="Editar webhook"
                        >
                          <Edit2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleRegenerateSecret(webhook.id)}
                          className="text-gray-400 hover:text-yellow-500 transition-colors"
                          title="Regenerar segredo"
                        >
                          <Key className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteWebhook(webhook.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Excluir webhook"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-[#333333] rounded-md">
            <Globe className="h-8 w-8 mx-auto text-gray-500 mb-2" />
            <h3 className="text-lg font-medium text-gray-300">Nenhum webhook configurado</h3>
            <p className="text-gray-500 mt-1">
              Configure webhooks para receber notificações em tempo real de eventos no sistema.
            </p>
            {!showWebhookForm && (
              <button
                onClick={() => setShowWebhookForm(true)}
                className="mt-4 px-4 py-2 bg-[#F54900] text-white rounded-md hover:bg-[#D93C00] transition-colors"
              >
                Configurar Webhook
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="bg-[#161616] rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Como usar webhooks</h2>
        <div className="space-y-4 text-gray-300">
          <p>
            Os webhooks enviam notificações POST para o endpoint configurado sempre que ocorre um evento no sistema.
            Para verificar a autenticidade das requisições, você pode usar o segredo do webhook.
          </p>
          
          <div className="bg-[#0F0F0F] p-4 rounded-md">
            <code className="block font-mono text-sm overflow-x-auto">
              <span className="text-blue-400">const</span> <span className="text-green-400">crypto</span> = <span className="text-blue-400">require</span>(<span className="text-yellow-300">'crypto'</span>);<br/><br/>
              
              <span className="text-blue-400">function</span> <span className="text-green-400">verifyWebhookSignature</span>(req) {'{'}<br/>
              &nbsp;&nbsp;<span className="text-blue-400">const</span> <span className="text-green-400">signature</span> = req.headers[<span className="text-yellow-300">'x-webhook-signature'</span>];<br/>
              &nbsp;&nbsp;<span className="text-blue-400">const</span> <span className="text-green-400">payload</span> = req.body;<br/>
              &nbsp;&nbsp;<span className="text-blue-400">const</span> <span className="text-green-400">secret</span> = <span className="text-yellow-300">'seu-segredo-aqui'</span>;<br/><br/>
              
              &nbsp;&nbsp;<span className="text-green-400">const calculated</span> = crypto<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;.createHmac(<span className="text-yellow-300">'sha256'</span>, secret)<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;.update(<span className="text-blue-400">JSON</span>.stringify(payload))<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;.digest(<span className="text-yellow-300">'hex'</span>);<br/><br/>
              
              &nbsp;&nbsp;<span className="text-blue-400">return</span> signature === calculated;<br/>
              {'}'}
            </code>
          </div>
          
          <div className="bg-[#0F0F0F] p-4 rounded-md">
            <p className="font-medium mb-2">Estrutura dos eventos:</p>
            <code className="block font-mono text-sm overflow-x-auto">
              {'{'}<br/>
              &nbsp;&nbsp;<span className="text-yellow-300">"event"</span>: <span className="text-yellow-300">"follow-up.created"</span>,<br/>
              &nbsp;&nbsp;<span className="text-yellow-300">"timestamp"</span>: <span className="text-yellow-300">"2023-06-19T14:32:01Z"</span>,<br/>
              &nbsp;&nbsp;<span className="text-yellow-300">"workspace_id"</span>: <span className="text-yellow-300">"{workspaceId}"</span>,<br/>
              &nbsp;&nbsp;<span className="text-yellow-300">"data"</span>: {'{'}<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-green-400">// Dados específicos do evento</span><br/>
              &nbsp;&nbsp;{'}'}<br/>
              {'}'}
            </code>
          </div>
          
          <div className="bg-blue-900/20 border border-blue-700 text-blue-400 p-4 rounded-md flex items-start">
            <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="font-medium">Dica de segurança: </strong>
              Sempre verifique a assinatura do webhook para garantir que as requisições são autênticas e vêm do nosso sistema.
              O cabeçalho <code className="text-blue-300 bg-blue-900/30 px-1 rounded">x-webhook-signature</code> contém um hash HMAC SHA-256 do corpo da requisição.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}