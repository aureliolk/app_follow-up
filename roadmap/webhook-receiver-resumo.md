# Resumo Detalhado - Rota de Webhook Receiver

## Descrição Geral
Rota dinâmica que recebe webhooks de sistemas externos como Chatwoot, Dialogflow e outros, processando respostas de clientes e atualizando follow-ups ativos.

## Estrutura
- **Localização**: `/app/api/webhook-receiver/[path]/route.ts`
- **Método**: POST
- **Parâmetros de Rota**: `path` (identificador dinâmico)

## Fluxo de Funcionamento

1. **Recebimento do Webhook**
   - Obtém o parâmetro `path` da URL
   - Busca a configuração do webhook no banco de dados que corresponde ao path

2. **Validação da Configuração**
   - Verifica se existe uma configuração ativa para o path informado
   - Extrai o `workspaceId` da configuração encontrada

3. **Processamento do Payload**
   - Extrai os dados do webhook (`clientId` e `message`)
   - Suporta diferentes formatos:
     - Chatwoot (verifica se é uma mensagem do cliente, não do agente)
     - Dialogflow
     - Formato genérico (fallback)

4. **Busca de Follow-ups Ativos**
   - Procura follow-ups ativos para o cliente no workspace correspondente
   - Ordena por data de início (mais recente primeiro)
   - Limita a apenas 1 resultado

5. **Registro da Interação**
   - Cria um registro da mensagem do cliente no banco
   - Atualiza o status do follow-up (não está mais aguardando resposta)
   - Registra o uso do webhook (atualiza `last_used_at`)

6. **Resposta**
   - Retorna confirmação de sucesso com detalhes do processamento

## Tratamento de Erros
- Webhook não encontrado (404)
- Formato de payload inválido (400)
- Nenhum follow-up ativo para o cliente (200, mas `success: false`)
- Erros internos (500)

## Pontos de Atenção

### Integração com Plataformas
- Suporte atual:
  - Chatwoot (detecção de mensagens do cliente vs. agente)
  - Dialogflow
  - Formato genérico (fallback para outras plataformas)

### Limitações Atuais
- Processa apenas um follow-up por cliente (o mais recente)
- Não tem mecanismo de autenticação/validação avançado dos webhooks
- Extração de informações baseada em padrões fixos de payload
- Logging básico (apenas console.log)

### Segurança
- Não possui verificação de assinatura/token para validação do remetente
- Não tem rate limiting para proteger contra abuso

## Possíveis Melhorias
1. **Segurança**:
   - Implementar validação de assinatura/segredo
   - Adicionar rate limiting
   - Sanitizar dados de entrada

2. **Funcionalidade**:
   - Suporte a mais plataformas específicas
   - Processamento condicional baseado no conteúdo da mensagem
   - Webhook customizável por campanha, não apenas por workspace

3. **Monitoramento**:
   - Logging estruturado
   - Métricas de uso e performance
   - Notificações de erro

4. **Flexibilidade**:
   - Configuração de mapeamento personalizado de campos
   - Suporte a transformações de dados via configuração
   - Webhooks condicionais baseados em regras