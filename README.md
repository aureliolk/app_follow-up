# Configuração do Projeto

Este projeto utiliza Next.js e serviços externos como Redis e Pusher.

## Variáveis de Ambiente

Além das variáveis já existentes para banco de dados e Redis, adicione as seguintes para configurar o Pusher:

```
PUSHER_APP_ID=seu_app_id
PUSHER_KEY=sua_key
PUSHER_SECRET=seu_secret
PUSHER_CLUSTER=seu_cluster
NEXT_PUBLIC_PUSHER_KEY=sua_key
NEXT_PUBLIC_PUSHER_CLUSTER=seu_cluster
```

Estas variáveis devem estar definidas no `.env` utilizado em desenvolvimento e produção.

## Execução

1. Instale as dependências com `pnpm install`.
2. Rode a aplicação em modo desenvolvimento com `pnpm dev`.
3. Inicie os workers necessários via `pnpm workers:dev`.

Com o Pusher configurado, as mensagens do chat serão recebidas em tempo real.
