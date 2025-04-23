import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ApiDocsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-primary">Documentação da API</h1>

      {/* --- Como Obter um Token --- */}
      <section className="mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Obtendo seu Token de API (x-api-key)</CardTitle>
          </CardHeader>
          <CardContent className="py-6 space-y-3 text-sm">
            <p>
              Para interagir com a maioria das rotas da API, você precisará de um token de API (`x-api-key`). Siga estes passos para gerar o seu:
            </p>
            <ol className="list-decimal list-inside space-y-1 pl-4 text-muted-foreground">
              <li>Navegue até as <strong className="text-foreground">Configurações</strong> do seu Workspace.</li>
              <li>Encontre a seção <strong className="text-foreground">"Gerenciar Tokens"</strong> ou similar (geralmente em "Integrações" ou "Desenvolvedor").</li>
              <li>Clique no botão <strong className="text-foreground">"Criar Novo Token"</strong>.</li>
              <li>Dê um nome descritivo ao token (ex: "Integração Externa X").</li>
              <li>Selecione um período de expiração (recomendado).</li>
              <li>Clique em "Criar Token".</li>
              <li><strong className="text-destructive">Importante:</strong> Copie o token gerado imediatamente. Ele não será exibido novamente por motivos de segurança.</li>
            </ol>
            <p>
              Guarde seu token em local seguro e use-o no cabeçalho `x-api-key` das suas requisições.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Iniciar Follow-up de Carrinho Abandonado</CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <p className="text-muted-foreground mb-4">
              Instruções sobre como usar a API para adicionar um cliente a um processo de recuperação de carrinho abandonado.
            </p>
            {/* TODO: Detalhar endpoint, método, parâmetros, corpo da requisição e exemplos */}
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
              <code>
                {`POST /api/webhooks/events

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI"
}

Body:
{
  "event_type": "abandoned_cart",
  "workspace_id": "seu_workspace_id",
  "client_phone_number": "5511999998888", // Número completo com código do país/área
  "client_name": "Nome do Cliente",
  // Restante do corpo da requisição OPCIONAL...
}`}
              </code>
            </pre>
            <p className="text-xs text-muted-foreground mt-2">Requer autenticação via cabeçalho <code className="font-mono bg-muted px-1 rounded">x-api-key</code>.</p>
            {/* Adicionar mais detalhes aqui: fluxo esperado, possíveis erros */}
          </CardContent>
        </Card>
      </section>

      {/* --- Cancelar Follow-up --- */}
      <section className="mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Marcar Follow-up como Convertido</CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <p className="text-muted-foreground mb-4">
              Marca um follow-up que esteja atualmente ATIVO ou PAUSADO como CONVERTIDO para um cliente específico no workspace.
            </p>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
              <code>
                {`POST /api/followups/convert

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI" // OU Autenticação via Sessão
}

Body:
{
  "workspaceId": "id_do_seu_workspace",
  "clientId": "id_do_cliente"
}
`}
              </code>
            </pre>
            <p className="text-xs text-muted-foreground mt-2">
              Requer autenticação via cabeçalho <code className="font-mono bg-muted px-1 rounded">x-api-key</code> OU uma sessão de usuário válida com permissão no workspace.
            </p>
             {/* Adicionar mais detalhes aqui: exemplos de resposta, possíveis erros */}
          </CardContent>
        </Card>
      </section>

      {/* Adicionar mais seções conforme necessário */}

    </div>
  );
} 