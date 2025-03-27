# Documentação de Recursos de IA do Follow-Up

Esta documentação descreve os recursos de inteligência artificial disponíveis no sistema de follow-up, suas funções e como integrá-los em suas aplicações.

## Visão Geral

O sistema de follow-up foi aprimorado com capacidades de IA para:

1. **Análise de respostas de clientes** - Interpretação automática do sentimento, intenção e tópicos das mensagens recebidas
2. **Personalização de conteúdo** - Adaptação de mensagens pré-definidas para torná-las mais relevantes e engajadoras
3. **Geração de respostas** - Criação de respostas originais para interagir diretamente com clientes
4. **Tomada de decisões** - Determinação do fluxo ideal de follow-up com base no comportamento do cliente

O sistema armazena todas as análises e resultados de IA em tabelas estruturadas no banco de dados, evitando o uso de campos de metadados JSON.

## Endpoints de IA

### 1. Resposta Automática a Mensagens de Clientes

`POST /api/follow-up/client-response`

Este endpoint processa respostas de clientes e pode opcionalmente gerar uma resposta automática da IA.

**Parâmetros:**
```json
{
  "followUpId": "string", // ID do follow-up (opcional se clientId for fornecido)
  "clientId": "string", // ID do cliente (obrigatório)
  "message": "string", // Mensagem do cliente (obrigatório)
  "aiResponse": true // Se verdadeiro, gera uma resposta automática (opcional, padrão: true)
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Resposta processada com sucesso",
  "clientId": "string",
  "followUpId": "string",
  "ai_response": "string" // Resposta gerada pela IA (se aiResponse for true)
}
```

### 2. Interação Direta com IA

`POST /api/follow-up/ai-chat`

Este endpoint permite interações diretas com a IA, como em um chatbot, mantendo o contexto do follow-up.

**Parâmetros:**
```json
{
  "clientId": "string", // ID do cliente (obrigatório)
  "message": "string", // Mensagem do cliente (obrigatório)
  "followUpId": "string", // ID específico do follow-up (opcional)
  "saveToHistory": true, // Salvar a conversa no histórico (opcional, padrão: true)
  "recordClientMessage": false // Registrar a mensagem do cliente (opcional, padrão: false)
}
```

**Resposta:**
```json
{
  "success": true,
  "response": "string", // Resposta gerada pela IA
  "followUpId": "string",
  "stage": {
    "id": "string",
    "name": "string"
  }
}
```

## Serviços de IA Internos

O sistema utiliza quatro funções de IA principais, implementadas em `app/api/follow-up/_lib/ai/functionIa.ts`:

### 1. analyzeClientResponse

Analisa o conteúdo de uma resposta do cliente para determinar sentimento, intenção e tópicos mencionados.

```typescript
async function analyzeClientResponse(
  clientId: string,
  message: string,
  followUpId: string
): Promise<{
  sentiment: 'positive' | 'neutral' | 'negative',
  intent: string,
  topics: string[],
  nextAction: string,
  suggestedStage?: string
}>
```

### 2. personalizeMessageContent

Personaliza o conteúdo de uma mensagem pré-definida com base no contexto do cliente e histórico de conversas.

```typescript
async function personalizeMessageContent(
  originalMessage: string,
  clientId: string,
  followUpId: string,
  metadata: any
): Promise<string>
```

### 3. generateAIResponse

Gera uma resposta original e personalizada para interagir diretamente com o cliente.

```typescript
async function generateAIResponse(
  clientId: string,
  clientMessage: string,
  followUpId: string,
  stageInfo: any
): Promise<string>
```

### 4. decideNextStepWithAI

Determina a próxima ação no fluxo de follow-up com base na análise do comportamento do cliente.

```typescript
async function decideNextStepWithAI(
  followUp: any,
  currentStep: any,
  clientResponse?: string
): Promise<{
  action: 'continue' | 'skip' | 'jump' | 'complete',
  targetStep?: number,
  targetStage?: string,
  reason?: string
}>
```

## Armazenamento de Análises de IA

As análises de IA são armazenadas na tabela `FollowUpAIAnalysis` do banco de dados com relacionamento direto com o modelo `FollowUp`. A estrutura inclui:

```prisma
model FollowUpAIAnalysis {
  id              String    @id @default(uuid())
  follow_up_id    String
  message_id      String?
  sentiment       String
  intent          String
  topics          String[]
  next_action     String
  suggested_stage String?
  created_at      DateTime  @default(now())
  follow_up       FollowUp  @relation(fields: [follow_up_id], references: [id], onDelete: Cascade)

  @@index([follow_up_id])
  @@map("follow_up_ai_analyses")
  @@schema("follow_up_schema")
}
```

Esta tabela armazena:
- Sentimento detectado (positivo, neutro, negativo)
- Intenção principal do cliente
- Tópicos mencionados (array de strings)
- Próxima ação recomendada
- Estágio sugerido (quando aplicável)
- Referência à mensagem analisada (quando aplicável)

## Exemplos de Uso

### Exemplo 1: Processar uma resposta de cliente com análise de IA

```javascript
// Exemplo de chamada para processar resposta do cliente
const response = await fetch('/api/follow-up/client-response', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientId: '123456',
    message: 'Obrigado pelo contato, mas não tenho interesse no momento.',
    followUpId: 'follow-123',
    aiResponse: true
  })
});

const result = await response.json();
console.log('Resposta automática da IA:', result.ai_response);
```

### Exemplo 2: Interação direta com chatbot de IA

```javascript
// Exemplo de interação direta com IA
const response = await fetch('/api/follow-up/ai-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientId: '123456',
    message: 'Quais são os detalhes do plano premium?',
    saveToHistory: true,
    recordClientMessage: true
  })
});

const result = await response.json();
console.log('Resposta da IA:', result.response);
```

## Configuração e Personalização

O comportamento da IA pode ser ajustado através dos prompts de sistema utilizados em cada função. Esses prompts estão definidos diretamente nas funções de IA e podem ser personalizados conforme necessário.

Os principais aspectos que podem ser configurados incluem:

1. Tom e estilo de comunicação
2. Nível de personalização das mensagens
3. Critérios para determinar o sentimento e intenção
4. Regras para mudança de estágio no funil

## Limitações Atuais

- As análises de IA são assíncronas e podem adicionar alguma latência ao processamento de mensagens
- A qualidade das respostas e análises depende da qualidade do modelo de IA subjacente
- O sistema atualmente não suporta aprendizado contínuo baseado em feedback direto