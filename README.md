# app_follow-up

Esta aplicação utiliza o Pusher para comunicação em tempo real. Para funcionar, adicione as seguintes variáveis de ambiente ao arquivo `.env.local`:

```
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=
```

Instale as dependências e execute os workers e o servidor:

```bash
pnpm install
pnpm dev
```
