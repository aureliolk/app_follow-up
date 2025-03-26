# Correção de Bug - Webhooks de Entrada

## Problema Identificado
Ao tentar criar um webhook de entrada no sistema, o usuário recebia um erro "URL inválida" no frontend e um erro HTTP 400 com o mesmo motivo no backend.

## Causa Raiz
O problema ocorria porque os webhooks de entrada utilizam caminhos internos no formato `/api/webhook-receiver/{caminho-personalizado}`, que não são URLs válidas segundo o construtor `URL()` do JavaScript, que requer URLs completas com protocolo (http:// ou https://).

## Solução Implementada

### 1. Frontend (WebhookManager.tsx)

Foram realizadas duas correções principais:

1. **Validação do caminho vazio:**
   - Adicionado verificação para evitar que o campo `webhookUrl` fosse preenchido quando o caminho personalizado estivesse vazio
   - Anteriormente, estava sendo definido como `/api/webhook-receiver/` mesmo com caminho vazio

   ```typescript
   if (sanitized) {
     // Atualizar a URL com o caminho completo apenas se tiver um valor válido
     setWebhookUrl(`/api/webhook-receiver/${sanitized}`);
   } else {
     setWebhookUrl('');
   }
   ```

2. **Validação específica para webhooks de entrada:**
   - Adicionado verificação explícita para garantir que o caminho personalizado foi informado
   - Mensagem de erro específica para guiar o usuário

   ```typescript
   // Validar o caminho do webhook de entrada
   if (webhookType === 'incoming' && !webhookPath.trim()) {
     setError('O caminho personalizado é obrigatório para webhooks de entrada');
     return;
   }
   ```

### 2. Backend (route.ts)

Modificado o método de validação de URL no endpoint `/api/workspaces/[id]/webhooks` para:

1. **Tratar URLs internas de forma diferente:**
   - Ao identificar um caminho interno (`/api/webhook-receiver/`), não usar o construtor URL
   - Em vez disso, validar diretamente se o caminho após o prefixo não está vazio

   ```typescript
   // Para URLs internas do webhook receiver, não usamos o construtor URL
   if (url.startsWith('/api/webhook-receiver/')) {
     const path = url.replace('/api/webhook-receiver/', '');
     if (!path || path.trim() === '') {
       return NextResponse.json(
         { error: "Caminho do webhook inválido" },
         { status: 400 }
       );
     }
   } else {
     // Para URLs externas, validamos normalmente
     try {
       new URL(url);
     } catch (e) {
       return NextResponse.json(
         { error: "URL inválida" },
         { status: 400 }
       );
     }
   }
   ```

## Impacto da Correção

Com estas alterações, os usuários agora podem:
1. Criar webhooks de entrada com caminhos personalizados
2. Receber feedback mais claro sobre os campos obrigatórios
3. Utilizar a funcionalidade sem erros de validação de URL

A solução mantém a validação rígida para URLs externas, enquanto aplica uma lógica específica para caminhos internos do sistema de webhook.