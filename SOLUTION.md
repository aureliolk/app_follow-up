# Solução para o Problema de Avanço de Estágios no Sistema de Follow-up

## Problema Identificado
- Quando um cliente respondia a uma mensagem de follow-up, o sistema tentava avançar para o próximo estágio mas depois voltava ao estágio anterior.
- Isso criava um loop onde o cliente não conseguia progredir na jornada.

## Análise da Causa
Após examinar o código, identificamos que o problema estava na forma como o sistema gerenciava os metadados durante as transições de estágio. Quando um cliente respondia:

1. O sistema armazenava informações sobre o próximo estágio nos metadados
2. Ao processar a resposta, ele consultava esses metadados, mas depois não os limpava adequadamente
3. Em algum momento, esses metadados desatualizados causavam uma confusão sobre qual deveria ser o próximo estágio

## Solução Implementada

### 1. Ignorar Metadados na Transição de Estágios
- Modificamos a função `processStageAdvancement` para sempre usar a ordem definida na campanha.
- Removemos a dependência de metadados que podiam conter informações conflitantes.

```javascript
// IMPORTANTE: Sempre avançar para o próximo estágio em sequência
// Ignorar os metadados e usar sempre a ordem definida na campanha
const nextStageIndex = currentStageIndex + 1;
const nextStageName = nextStageIndex < stageNames.length ? stageNames[nextStageIndex] : null;
```

### 2. Limpar Metadados Após Transições
- Adicionamos a limpeza de metadados em todos os pontos de atualização do status do follow-up:
  - Ao completar o follow-up
  - Ao pausar o follow-up
  - Ao avançar para um novo estágio

```javascript
// Atualizar o follow-up para o novo estágio e passo usando campos estruturados
await prisma.followUp.update({
  where: { id: followUp.id },
  data: {
    // ...outros campos...
    metadata: null // Limpar metadados para evitar comportamentos indesejados
  }
});
```

### 3. Melhorar o Gerenciamento de Estado
- Atualizamos a função `processActiveFollowUpResponse` para garantir que o follow-up esteja sempre ativo e não esteja aguardando resposta.
- Adicionamos logs claros para rastrear o fluxo de avanço de estágios.
- Nos certificamos de que o campo `waiting_for_response` é corretamente definido como `false` após processamento.

### 4. Adicionar Auditoria com Mensagens de Sistema
- Adicionamos mensagens de sistema para registrar e documentar as transições entre estágios.

```javascript
// Criar mensagem de sistema
await createSystemMessage(
  followUp.id,
  `Cliente respondeu e avançou de "${currentStageName}" para "${nextStageName}"`,
  "System"
);
```

### 5. Criamos Testes Específicos
- Adicionamos uma função específica para verificar o avanço correto entre estágios no script de teste.
- O teste verifica se o follow-up avança para um novo estágio após receber uma resposta do cliente.
- Adicionamos verificações de qualidade para detectar transições circulares.

## Arquivos Modificados
1. `/app/api/follow-up/_lib/manager.ts`
2. `/app/api/follow-up/_lib/manager.refactor.ts`
3. `/scripts/test-refactored-followup.js`

## Como Testar a Solução

Execute o script de teste específico:
```bash
node scripts/test-refactored-followup.js
```

Este teste:
1. Cria um novo follow-up
2. Aguarda o processamento inicial
3. Registra o estágio inicial
4. Envia uma resposta do cliente
5. Verifica se o follow-up avançou adequadamente para o próximo estágio

Ou use o script de teste de campanha para um fluxo completo:
```bash
node scripts/test-campaign-flow.js
```

## Conclusão

A solução implementada garante que o sistema de follow-up agora gerencia corretamente as transições de estágio quando um cliente responde, sempre avançando para o próximo estágio em ordem e não retornando ao estágio anterior.

Principais melhorias:
1. Fluxo simplificado baseado na ordem definida dos estágios
2. Eliminação de dependências em metadados temporários 
3. Adição de melhor auditoria através de mensagens de sistema
4. Testes mais robustos para garantir o comportamento correto