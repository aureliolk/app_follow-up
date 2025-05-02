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
  "eventName": "abandoned_cart",
  "workspaceId": "seu_workspace_id",
  "customerPhoneNumber": "5511999998888",
  "customerName": "Nome do Cliente",
  // "eventData": { /* Dados adicionais do evento, se houver */ }
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
  "clientPhoneNumber": "5511988887777"
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

      {/* --- Pipeline Stages --- */}
      <section className="mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Pipeline Stages</CardTitle>
          </CardHeader>
          <CardContent className="py-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Listar Stages</h3>
              <p className="text-muted-foreground mb-2">
                Retorna todos os estágios (colunas) do pipeline de um workspace específico, ordenados pela sua posição.
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>
                  {`GET /api/workspaces/{workspaceId}/pipeline/stages

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI" // OU Autenticação via Sessão
}`}
                </code>
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Requer autenticação e que o usuário seja membro do workspace.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Criar Stage</h3>
              <p className="text-muted-foreground mb-2">
                Cria um novo estágio (coluna) no pipeline do workspace. O estágio será adicionado ao final da ordem existente.
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>
                  {`POST /api/workspaces/{workspaceId}/pipeline/stages

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI" // OU Autenticação via Sessão
}

Body:
{
  "name": "Nome do Novo Estágio"
}`}
                </code>
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Requer autenticação e que o usuário seja membro do workspace. O campo `name` é obrigatório.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* --- Pipeline Deals --- */}
      <section className="mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Pipeline Deals</CardTitle>
          </CardHeader>
          <CardContent className="py-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Listar Deals (CARD)</h3>
              <p className="text-muted-foreground mb-2">
                Retorna todos os deals (negociações) de um workspace. Opcionalmente, pode-se filtrar por estágio usando o query parameter `stageId`.
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>
                  {`GET /api/workspaces/{workspaceId}/pipeline/deals?stageId={optionalStageId}

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI" // OU Autenticação via Sessão
}`}
                </code>
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Requer autenticação e que o usuário seja membro do workspace.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Criar Deal (CARD)</h3>
              <p className="text-muted-foreground mb-2">
                Cria um novo deal no pipeline do workspace, associado a um estágio específico.
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>
                  {`POST /api/workspaces/{workspaceId}/pipeline/deals

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI" // OU Autenticação via Sessão
}

Body:
{
  "title": "Nome do Deal (Obrigatório)",
  "stageId": "ID_do_estagio (Obrigatório)",
  "value": 1500.50 (Opcional),
  "clientId": "ID_do_cliente (Opcional)",
  "assignedToId": "ID_do_usuario_responsavel (Opcional)"
  // "source": "MANUAL" (Opcional - Ver DealSource no schema)
}`}
                </code>
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Requer autenticação e que o usuário seja membro do workspace. `title` e `stageId` são obrigatórios. O deal será criado no final da ordem do estágio especificado.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Obter Deal Específico (CARD)</h3>
              <p className="text-muted-foreground mb-2">
                Retorna os detalhes de um deal específico pelo seu ID.
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>
                  {`GET /api/workspaces/{workspaceId}/pipeline/deals/{dealId}

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI" // OU Autenticação via Sessão
}`}
                </code>
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Requer autenticação e que o usuário seja membro do workspace.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Mover Deal (CARD)</h3>
              <p className="text-muted-foreground mb-2">
                Atualiza um ou mais campos de um deal existente. Pelo menos um campo deve ser fornecido no corpo.
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>
                  {`PUT /api/workspaces/{workspaceId}/pipeline/deals/{dealId}

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI" // OU Autenticação via Sessão
}

Body:
{
  "stageId": "ID_do_novo_estagio",
}`}
                </code>
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Requer autenticação e que o usuário seja membro do workspace. Envie apenas os campos que deseja atualizar. Para desassociar `clientId` ou `assignedToId`, envie `null`.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Deletar Deal (CARD)</h3>
              <p className="text-muted-foreground mb-2">
                Remove permanentemente um deal do workspace.
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
                <code>
                  {`DELETE /api/workspaces/{workspaceId}/pipeline/deals/{dealId}

Headers:
{
  "x-api-key": "SEU_TOKEN_AQUI" // OU Autenticação via Sessão
}`}
                </code>
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Requer autenticação e que o usuário seja membro do workspace. Esta ação é irreversível.
              </p>
            </div>

          </CardContent>
        </Card>
      </section>

      {/* Adicionar mais seções conforme necessário */}

    </div>
  );
} 