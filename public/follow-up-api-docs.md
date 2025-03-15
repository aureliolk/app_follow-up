# Documentação da API de Follow-up

Esta documentação descreve como utilizar a API de follow-up para gerenciar campanhas de mensagens sequenciais.

## Visão Geral

O sistema de follow-up permite configurar e gerenciar campanhas de mensagens automáticas enviadas em intervalos predefinidos. É ideal para:

- Campanhas de nutrição de leads
- Sequências de onboarding para novos clientes
- Lembretes e recuperação de carrinhos abandonados
- Acompanhamento pós-venda

## Endpoints da API

### Criar um Follow-up

```
POST /api/follow-up
```

Cria um novo follow-up para um cliente específico.

**Corpo da Requisição:**
```json
{
  "campaignId": "ce6eda3b-9f4d-45db-8fb3-bee595be1310",
  "clientId": "cliente123",
  "metadata": {
    "source": "website",
    "product": "produto-xyz"
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb",
  "status": "active",
  "startedAt": "2025-03-11T19:51:20.704Z",
  "nextMessageAt": "2025-03-11T20:21:20.704Z"
}
```

### Verificar Status

```
GET /api/follow-up/status/:followUpId
```

Verifica o status atual de um follow-up específico.

**Resposta:**
```json
{
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb",
  "status": "active",
  "currentStep": 1,
  "startedAt": "2025-03-11T19:51:20.704Z",
  "nextMessageAt": "2025-03-12T08:51:20.704Z",
  "clientResponse": false
}
```

### Cancelar Follow-up

```
POST /api/follow-up/cancel
```

Cancela um follow-up em andamento.

**Corpo da Requisição:**
```json
{
  "followUpId": "9f806bba-e0fe-40a1-862d-db635805d3eb",
  "reason": "cliente-convertido"
}
```

**Resposta:**
```json
{
  "success": true,
  "status": "cancelled",
  "message": "Follow-up cancelado com sucesso"
}
```

### Registrar Resposta do Cliente

```
POST /api/follow-up/response
```

Registra uma resposta recebida do cliente, o que pode pausar ou alterar o fluxo do follow-up.

**Corpo da Requisição:**
```json
{
  "clientId": "cliente123",
  "message": "Tenho interesse no produto, pode me mandar mais informações?",
  "channel": "whatsapp"
}
```

**Resposta:**
```json
{
  "success": true,
  "followUpsAffected": 1,
  "newStatus": "paused"
}
```

## Campanhas Disponíveis

O sistema já possui as seguintes campanhas pré-configuradas:

| ID | Nome | Descrição |
|----|------|-----------|
| 8fc5900f-7cec-4542-9bce-c899ba8f5ff0 | Campanha Sabrina | Campanha de follow-up Sabrina Nunes |

## Formato dos Tempos de Espera

Os tempos de espera podem ser configurados nos seguintes formatos:

- `10 minutos` - minutos
- `1 hora` - horas
- `5 dias` - dias
- `imediatamente` - envio imediato

## Exemplo de Integração

### Node.js
```javascript
const axios = require('axios');

// Criar um novo follow-up
async function createFollowUp(campaignId, clientId) {
  try {
    const response = await axios.post('https://seu-dominio.com/api/follow-up', {
      campaignId,
      clientId
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
    const response = await axios.get(`https://seu-dominio.com/api/follow-up/status/${followUpId}`);
    console.log('Status:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erro ao verificar status:', error.response?.data || error.message);
  }
}

// Cancelar follow-up
async function cancelFollowUp(followUpId, reason) {
  try {
    const response = await axios.post('https://seu-dominio.com/api/follow-up/cancel', {
      followUpId,
      reason
    });
    console.log('Cancelado:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erro ao cancelar follow-up:', error.response?.data || error.message);
  }
}
```

## Considerações sobre Uso

1. **Timeout:** Os follow-ups são armazenados em memória utilizando `setTimeout`, portanto reiniciar o servidor pode afetar o agendamento. Use o comando `reload` para recarregar mensagens pendentes após reinicialização.

2. **Limitações:** Os follow-ups são projetados para operações assíncronas, não para comunicação em tempo real.

3. **Validação:** Os IDs de cliente e campanha são validados durante a criação.

4. **Métricas:** O sistema registra todas as mensagens enviadas e suas confirmações de entrega.

## Comandos de CLI

O sistema também oferece uma interface de linha de comando para gerenciamento:

```bash
# Importar nova campanha
node scripts/follow-up-manager.js import "Sabrina Nunes" "Campanha de follow-up Sabrina Nunes"

# Listar campanhas disponíveis
node scripts/follow-up-manager.js campaign list

# Criar follow-up manualmente
node scripts/follow-up-manager.js create CAMPAIGN_ID CLIENT_ID

# Listar follow-ups
node scripts/follow-up-manager.js list [CLIENT_ID]

# Recarregar mensagens pendentes
node scripts/follow-up-manager.js reload
```

Para mais informações, execute:
```bash
node scripts/follow-up-manager.js help
```