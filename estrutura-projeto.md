# Diagrama da Estrutura do Projeto

Segue a estrutura em árvore com breve descrição de cada parte:

```
.
├── Dockerfile
│   Configura o container Docker
├── next.config.mjs
│   Configurações do Next.js
├── package.json / pnpm-lock.yaml / tsconfig.json
│   Dependências, scripts e TypeScript
├── tailwind.config.ts / postcss.config.mjs
│   Configuração do Tailwind CSS
├── scripts/
│   Scripts auxiliares (iniciar workers, resolver aliases…)
├── public/
│   Ativos estáticos (imagens, SVGs)
├── prisma/
│   ├── schema.prisma
│   │   Definição do modelo de dados
│   └── migrations/
│       Histórico de alterações do banco
├── lib/
│   Biblioteca de suporte e regras de negócio
│   ├── db.ts
│   │   Instância compartilhada do PrismaClient
│   ├── auth/
│   │   Configurações do NextAuth
│   ├── ai/
│   │   Serviços de IA (chat, transcrição, análise de imagem)
│   ├── google/
│   │   Integração com Google Calendar / OAuth
│   ├── middleware/
│   │   Autenticação por API token
│   ├── queues/
│   │   Definição das filas (BullMQ)
│   ├── workers/
│   │   Processamento assíncrono (campanhas, mensagens, sequências)
│   ├── services/
│   │   Lógica de negócio (conversas, follow-ups, campanhas…)
│   └── utils.ts / phoneUtils.ts / timeUtils.ts / …
│       Funções utilitárias gerais
├── components/
│   Componentes React reaproveitáveis
│   ├── ui/
│   │   Biblioteca de componentes (botão, input, modal, tabela…)
│   ├── layout/
│   │   AppContentWrapper, header, footer…
│   └── whatsapp/
│       Dialog de templates WhatsApp
├── context/
│   React Context Providers (workspace, conversa, cliente, follow-up…)
└── app/
    Código-fonte principal (Next.js App Router)
    ├── layout.tsx
    │   Layout global (header, footer, providers)
    ├── globals.css
    │   Estilos globais
    ├── middleware.ts
    │   Middleware (autenticação, redirecionamentos…)
    ├── page.tsx
    │   Página inicial (dashboard ou landing)
    ├── auth/
    │   Login (`auth/login/page.tsx`)
    ├── invite/
    │   Aceitar convite (`invite/[token]/page.tsx`)
    ├── workspaces/
    │   Listagem de workspaces (`workspaces/page.tsx`)
    ├── workspace/
    │   Zona da workspace dinâmica (`workspace/[id]/…`)
    │   ├── page.tsx
    │   │   Visão geral da workspace
    │   ├── clients/
    │   │   CRUD de clientes (`page.tsx`, `components/ClientFormModal.tsx`…)
    │   ├── conversations/
    │   │   Listagem e detalhe de conversas (`ConversationList`, `ConversationDetail`)
    │   ├── ia/
    │   │   Configurações de IA e regras de follow-up
    │   ├── integrations/
    │   │   Evolução API e WhatsApp integrations
    │   ├── mass-trigger/
    │   │   Disparo de campanhas em massa
    │   ├── members/
    │   │   Gerenciamento de membros da workspace
    │   └── settings/
    │       Configurações gerais (API tokens, webhooks…)
    └── api/
        Handlers de API (Route Handlers do Next.js)
        ├── auth/
        │   NextAuth, registro, check-email
        ├── clients/
        │   CRUD clientes via REST
        ├── conversations/
        │   Mensagens, eventos, templates
        ├── docs/
        │   UI de documentação interna (`page.tsx`)
        ├── followups/
        │   Conversão de follow-ups
        ├── google-auth/ & google-calendar/
        │   OAuth e leitura de eventos
        ├── sse/
        │   Server-Sent Events para atualização em tempo real
        ├── webhooks/
        │   Ingressos e eventos de WhatsApp
        └── workspaces/
            CRUD e sub-recursos (membros, tokens, tags, webhooks…)
```