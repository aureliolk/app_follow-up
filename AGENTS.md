# Diretrizes de Desenvolvimento

Estas orientações padronizam o trabalho no projeto **app\_follow-up**.

## Instalação e Execução

### Instalar dependências

```bash
pnpm install
```

### Executar em modo desenvolvimento

```bash
pnpm dev
```

### Executar os workers em paralelo

```bash
pnpm run workers:dev
```

### Rodar o linter

```bash
pnpm lint
```

## Convenções de Código

* **Linguagem principal:** TypeScript. Evite criar novos arquivos `.js`.
* Utilize imports relativos iniciando com `@/` conforme definido no `tsconfig.json`.
* Todos os arquivos devem terminar com newline.
* Siga o padrão do `.eslintrc.json` e corrija todos os avisos indicados pelo comando `pnpm lint`.
* Prefira `async/await` em vez de `then/catch`.

## Estrutura Recomendada

* Código do backend em `lib/`.
* Endpoints Next.js em `app/api/`.
* Componentes React em `components/`.
* Workers em `lib/workers/`.

## Mensagens de Commit

* Escreva mensagens curtas em português no imperativo. Exemplo:

  ```
  Adiciona tratamento de erro no envio WhatsApp
  ```

* Evite commits grandes não relacionados.

## Variáveis de Ambiente

Mantenha um arquivo `.env.example` (ou similar) listando chaves obrigatórias.

## Boas Práticas

* Sempre valide dados recebidos de requisições.
* Propague erros de forma clara; não exiba detalhes sensíveis ao usuário final.
* Para novas funções, adicione logs consistentes (`console.log` ou `console.error`).

Siga estas orientações para manter um código organizado e fácil de manter. Após criar o arquivo localmente, faça commit e push normalmente.
