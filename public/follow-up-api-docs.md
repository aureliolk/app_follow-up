# Documentação da API de Follow-up

Esta documentação descreve como utilizar a API de follow-up para gerenciar campanhas de mensagens sequenciais.

## Visão Geral

O sistema de follow-up permite configurar e gerenciar campanhas de mensagens automáticas enviadas em intervalos predefinidos. É ideal para:

- Campanhas de nutrição de leads
- Sequências de onboarding para novos clientes
- Lembretes e recuperação de carrinhos abandonados
- Acompanhamento pós-venda

## Autenticação

A API utiliza autenticação via NextAuth.js. Para acessar os endpoints protegidos, é necessário incluir um token JWT válido.

### Métodos de Autenticação

1. **Session Token**  
   Ao fazer login na interface web, um cookie de sessão é criado automaticamente. A API utiliza esse cookie para autenticar requisições.

2. **API Key (para testes)**  
   É possível utilizar uma API key no header `x-api-key` para testes:

   ```
   x-api-key: test-api-key-123456
   ```

   Essa chave está disponível apenas para ambientes de teste.

## Endpoints da API

### Follow-ups

#### Criar um Follow-up

```
POST /api/follow-up
```

Cria um novo follow-up para um cliente específico.

**Corpo da Requisição:**
```json
{
  "clientId": "cliente123",
  "campaignId": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
  "workspaceId": "a6736c1d-9dec-40f2-9965-9da3a6ef61cf",
  "metadata": {
    "source": "website",
    "product": "produto-xyz"
  }
}
```

**Parâmetros:**
- `clientId` (obrigatório): ID único do cliente
- `campaignId` (opcional): ID da campanha (se omitido, usa a campanha ativa mais recente do workspace)
- `workspaceId` (opcional): ID do workspace para associar o follow-up
- `metadata` (opcional): Informações adicionais relevantes para o follow-up

**Resposta:**
```json
{
  "success": true,
  "message": "Follow-up iniciado com sucesso",
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb"
}
```

#### Listar Follow-ups

```
GET /api/follow-up
```

Lista os follow-ups existentes com suporte a paginação e filtros.

**Parâmetros de Query:**
- `clientId` (opcional): Filtrar por ID do cliente
- `status` (opcional): Filtrar por status (active, paused, canceled, completed)
- `campaignId` (opcional): Filtrar por ID da campanha
- `workspaceId` (opcional): Filtrar por ID do workspace
- `page` (opcional): Número da página (padrão: 1)
- `limit` (opcional): Registros por página (padrão: 10)

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "9f806bba-e0fe-40a1-862d-db635805d3eb",
      "client_id": "cliente123",
      "campaign_id": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
      "status": "active",
      "current_step": 2,
      "started_at": "2025-03-11T19:51:20.704Z",
      "next_message_at": "2025-03-12T08:51:20.704Z",
      "is_responsive": false,
      "current_stage_name": "Prospecção",
      "campaign": {
        "id": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
        "name": "Campanha de Onboarding"
      },
      "messages": [
        {
          "id": "7a22d5ec-4a9e-4e12-bd49-e3f5c7b2e5a1",
          "content": "Olá! Bem-vindo ao nosso serviço...",
          "sent_at": "2025-03-11T19:51:20.704Z"
        }
      ]
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "pages": 5
  }
}
```

#### Verificar Status

```
GET /api/follow-up/status
```

Verifica o status atual de um follow-up específico.

**Parâmetros de Query:**
- `id` (opcional): ID do follow-up
- `clientId` (opcional): ID do cliente (retorna todos os follow-ups do cliente)

**Resposta para ID específico:**
```json
{
  "success": true,
  "data": {
    "id": "9f806bba-e0fe-40a1-862d-db635805d3eb",
    "status": "active",
    "current_step": 1,
    "started_at": "2025-03-11T19:51:20.704Z",
    "next_message_at": "2025-03-12T08:51:20.704Z",
    "campaign": {
      "id": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
      "name": "Campanha de Onboarding"
    },
    "messages": [
      {
        "id": "7a22d5ec-4a9e-4e12-bd49-e3f5c7b2e5a1",
        "content": "Olá! Bem-vindo ao nosso serviço...",
        "sent_at": "2025-03-11T19:51:20.704Z"
      }
    ]
  },
  "progress": {
    "currentStep": 1,
    "totalSteps": 5,
    "percentComplete": 20,
    "nextMessageTime": "2025-03-12T08:51:20.704Z"
  }
}
```

#### Atualizar Status

```
PATCH /api/follow-up/status
```

Atualiza o status de um follow-up, como marcar como responsivo.

**Corpo da Requisição:**
```json
{
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb",
  "clientResponse": true
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Status atualizado com sucesso",
  "data": {
    "id": "9f806bba-e0fe-40a1-862d-db635805d3eb",
    "is_responsive": true
  }
}
```

#### Cancelar Follow-up

```
POST /api/follow-up/cancel
```

Cancela um follow-up em andamento.

**Corpo da Requisição:**
```json
{
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb",
  "reason": "cliente-convertido",
  "cancelAllForClient": false
}
```

**Parâmetros:**
- `followUpId` (opcional): ID do follow-up a ser cancelado
- `clientId` (opcional): ID do cliente (caso queira cancelar pelo cliente)
- `reason` (opcional): Motivo do cancelamento
- `cancelAllForClient` (opcional): Se deve cancelar todos os follow-ups ativos do cliente

**Resposta:**
```json
{
  "success": true,
  "message": "Follow-up cancelado com sucesso",
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb"
}
```

#### Reativar Follow-up

```
POST /api/follow-up/resume
```

Reativa um follow-up que estava pausado.

**Corpo da Requisição:**
```json
{
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Follow-up retomado com sucesso"
}
```

#### Registrar Resposta do Cliente

```
POST /api/follow-up/client-response
```

Registra uma resposta recebida do cliente, o que pode pausar ou alterar o fluxo do follow-up.

**Corpo da Requisição:**
```json
{
  "clientId": "cliente123",
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb",
  "message": "Tenho interesse no produto, pode me mandar mais informações?"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Resposta processada com sucesso",
  "clientId": "cliente123",
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb"
}
```

#### Mover para Outro Estágio

```
PUT /api/follow-up/{id}/move-stage
```

Move um follow-up para outro estágio do funil.

**Corpo da Requisição:**
```json
{
  "stageId": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Cliente movido para Negociação com sucesso",
  "data": {
    "id": "9f806bba-e0fe-40a1-862d-db635805d3eb",
    "current_stage_id": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef"
  }
}
```

#### Remover Cliente

```
POST /api/follow-up/remove-client
```

Remove um cliente de todos os follow-ups ativos.

**Corpo da Requisição:**
```json
{
  "clientId": "cliente123",
  "reason": "opt-out"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Cliente removido de 2 follow-ups",
  "count": 2
}
```

### Campanhas

#### Listar Campanhas

```
GET /api/follow-up/campaigns
```

Lista todas as campanhas disponíveis.

**Parâmetros de Query:**
- `active` (opcional): Filtrar apenas campanhas ativas (true/false)
- `workspaceId` (opcional): Filtrar por ID do workspace

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
      "name": "Campanha de Onboarding",
      "description": "Sequência de boas-vindas para novos clientes",
      "active": true,
      "created_at": "2025-03-01T14:30:00.000Z",
      "stepsCount": 5,
      "activeFollowUps": 12
    }
  ]
}
```

#### Criar Campanha

```
POST /api/follow-up/campaigns
```

Cria uma nova campanha de follow-up.

**Corpo da Requisição:**
```json
{
  "name": "Campanha de Recuperação",
  "description": "Recuperação de clientes inativos",
  "workspaceId": "a6736c1d-9dec-40f2-9965-9da3a6ef61cf",
  "steps": [
    {
      "stage_id": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef",
      "template_name": "email_recuperacao_1",
      "wait_time": "1 dia",
      "message": "Olá, sentimos sua falta...",
      "category": "Reengajamento"
    }
  ]
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Campanha criada com sucesso",
  "data": {
    "id": "f98d7c65-b4a3-42e1-9f8d-7c65b4a342e1",
    "name": "Campanha de Recuperação",
    "description": "Recuperação de clientes inativos",
    "active": true,
    "created_at": "2025-03-23T15:14:23.123Z"
  }
}
```

#### Detalhes da Campanha

```
GET /api/follow-up/campaigns/{id}
```

Obtém detalhes de uma campanha específica.

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
    "name": "Campanha de Onboarding",
    "description": "Sequência de boas-vindas para novos clientes",
    "active": true,
    "created_at": "2025-03-01T14:30:00.000Z",
    "steps": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "funnel_stage_id": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef",
        "name": "Boas-vindas",
        "template_name": "welcome_email",
        "wait_time": "imediatamente",
        "wait_time_ms": 0,
        "message_content": "Olá, bem-vindo ao nosso serviço!",
        "message_category": "Onboarding"
      }
    ],
    "stages": [
      {
        "id": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef",
        "name": "Prospecção",
        "order": 1
      }
    ]
  }
}
```

### Estágios de Funil

#### Listar Estágios

```
GET /api/follow-up/funnel-stages
```

Lista todos os estágios de funil disponíveis.

**Parâmetros de Query:**
- `campaignId` (opcional): Filtrar por ID da campanha
- `workspaceId` (opcional): Filtrar por ID do workspace

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef",
      "name": "Prospecção",
      "description": "Primeiros contatos com o cliente",
      "order": 1,
      "created_at": "2025-03-01T14:30:00.000Z",
      "stepsCount": 3,
      "campaigns": ["ce6eda3b-9f4d-45db-8fb3-bee595be1310"]
    }
  ]
}
```

#### Criar Estágio

```
POST /api/follow-up/funnel-stages
```

Cria um novo estágio de funil.

**Corpo da Requisição:**
```json
{
  "name": "Negociação",
  "description": "Fase de negociação e apresentação de proposta",
  "order": 2,
  "campaignId": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
  "workspaceId": "a6736c1d-9dec-40f2-9965-9da3a6ef61cf"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Estágio criado com sucesso",
  "data": {
    "id": "d9e8f7c6-b5a4-32e1-0f9e-8d7c6b5a432e",
    "name": "Negociação",
    "description": "Fase de negociação e apresentação de proposta",
    "order": 2,
    "created_at": "2025-03-23T15:20:11.456Z",
    "campaignId": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
    "stepsCount": 0
  }
}
```

### Passos de Funil

#### Listar Passos

```
GET /api/follow-up/funnel-steps
```

Lista todos os passos de follow-up de uma campanha.

**Parâmetros de Query:**
- `campaignId` (opcional): Filtrar por ID da campanha
- `stageId` (opcional): Filtrar por ID do estágio do funil

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "funnel_stage_id": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef",
      "campaign_id": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
      "name": "Boas-vindas",
      "template_name": "welcome_email",
      "wait_time": "imediatamente",
      "wait_time_ms": 0,
      "message_content": "Olá, bem-vindo ao nosso serviço!",
      "message_category": "Onboarding",
      "auto_respond": true,
      "created_at": "2025-03-01T14:35:00.000Z"
    }
  ]
}
```

#### Criar Passo

```
POST /api/follow-up/funnel-steps
```

Cria um novo passo de follow-up.

**Corpo da Requisição:**
```json
{
  "campaign_id": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
  "funnel_stage_id": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef",
  "name": "Lembrete de produto",
  "template_name": "product_reminder",
  "wait_time": "2 dias",
  "message_content": "Olá, vimos que você demonstrou interesse no produto X...",
  "message_category": "Lembrete",
  "auto_respond": true
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Passo criado com sucesso",
  "data": {
    "id": "e1d2c3b4-a5f6-7890-abcd-ef0987654321",
    "campaign_id": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
    "funnel_stage_id": "b7d21c5e-3a9f-4c8a-8d7f-12345abcdef",
    "name": "Lembrete de produto",
    "template_name": "product_reminder",
    "wait_time": "2 dias",
    "wait_time_ms": 172800000,
    "message_content": "Olá, vimos que você demonstrou interesse no produto X...",
    "message_category": "Lembrete",
    "auto_respond": true,
    "created_at": "2025-03-23T15:25:43.789Z"
  }
}
```

## Formato dos Tempos de Espera

Os tempos de espera podem ser configurados nos seguintes formatos:

- `10 minutos` - minutos
- `1 hora` - horas
- `5 dias` - dias
- `imediatamente` - envio imediato

## Integração de Workspaces

O sistema suporta múltiplos workspaces, e muitas rotas aceitam o parâmetro `workspaceId` para filtrar resultados por workspace. Cada follow-up pode estar associado a um workspace específico, utilizando o campo `metadata` para armazenar essa associação.

## Exemplo de Integração

### Node.js
```javascript
const axios = require('axios');

// Configuração com autenticação
const api = axios.create({
  baseURL: 'https://seu-dominio.com',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'test-api-key-123456' // Apenas para ambiente de testes
  }
});

// Criar um novo follow-up
async function createFollowUp(clientId, campaignId, workspaceId) {
  try {
    const response = await api.post('/api/follow-up', {
      clientId,
      campaignId,
      workspaceId,
      metadata: {
        source: 'api-example'
      }
    });
    
    console.log('Follow-up criado:', response.data);
    return response.data.followUpId;
  } catch (error) {
    console.error('Erro ao criar follow-up:', error.response?.data || error.message);
  }
}

// Verificar status
async function checkStatus(followUpId) {
  try {
    const response = await api.get(`/api/follow-up/status?id=${followUpId}`);
    console.log('Status:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erro ao verificar status:', error.response?.data || error.message);
  }
}

// Cancelar follow-up
async function cancelFollowUp(followUpId, reason) {
  try {
    const response = await api.post('/api/follow-up/cancel', {
      followUpId,
      reason
    });
    console.log('Cancelado:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erro ao cancelar follow-up:', error.response?.data || error.message);
  }
}

// Registrar resposta do cliente
async function recordClientResponse(clientId, message) {
  try {
    const response = await api.post('/api/follow-up/client-response', {
      clientId,
      message
    });
    console.log('Resposta registrada:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erro ao registrar resposta:', error.response?.data || error.message);
  }
}
```

## Considerações sobre Uso

1. **Segurança**: Todas as rotas da API são protegidas por autenticação. É necessário um token JWT válido ou a API key de teste para acessá-las.

2. **Timeout**: Os follow-ups são armazenados em memória utilizando `setTimeout`, portanto reiniciar o servidor pode afetar o agendamento. Use o comando `reload` para recarregar mensagens pendentes após reinicialização.

3. **Workspaces**: O sistema suporta múltiplos workspaces, o que permite isolar campanhas e follow-ups por equipes ou departamentos diferentes.

4. **Funil de Vendas**: O conceito de estágios de funil permite acompanhar o progresso dos clientes através do processo de vendas ou jornada do cliente.

5. **Validação**: Os IDs de cliente, campanha e workspace são validados durante a criação de follow-ups.

6. **Métricas**: O sistema registra todas as mensagens enviadas e suas confirmações de entrega, bem como todas as respostas recebidas dos clientes.