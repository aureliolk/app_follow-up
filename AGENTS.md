# AGENTES.md

Este arquivo fornece diretrizes para Agentes de IA que trabalham neste projeto Next.js. Ele complementa as instruções de desenvolvimento encontradas em `instruction.md`.

## 1. Visão Geral do Projeto e Stack

Este projeto utiliza Next.js (App Router), TypeScript, Tailwind CSS, PostgreSQL (via Prisma), Shadcn/ui, Lucide Icons, React Context API, BullMQ, Vercel AI SDK, OpenRouter, OpenAI, Google Gemini, Trigger.dev, Nodemailer, Axios, date-fns, bcryptjs, form-data, uuid, e xlsx. A estilização é primariamente com Tailwind CSS e componentes Shadcn/ui. A comunicação em tempo real é gerenciada com Pusher. O armazenamento de arquivos é feito via S3 (compatível com MinIO). O gerenciamento de pacotes é feito com `pnpm`.

## 2. Estrutura de Diretórios Chave

*   `app/`: Rotas e páginas (Server Components por padrão, com Client Components específicos em subdiretórios `components/`).
    *   `app/api/`: Endpoints da API backend.
    *   `app/workspace/[id]/`: Rotas específicas de um workspace, incluindo dashboard, conversas, clientes, configurações de IA, integrações, Kanban, membros e configurações do workspace.
*   `components/`: Componentes React reutilizáveis globalmente.
    *   `components/ui/`: Componentes Shadcn/ui (geralmente não modificar diretamente, mas usar conforme documentação Shadcn).
    *   `components/ai/`: Componentes relacionados à interface de chat com IA.
    *   `components/whatsapp/`: Componentes específicos para funcionalidades do WhatsApp (ex: seleção de templates).
*   `context/`: Implementações do React Context para estado compartilhado (Workspaces, Clientes, Conversas, Follow-ups, Triggers, Templates WhatsApp).
*   `hooks/`: Hooks customizados reutilizáveis (ex: `use-toast`, `useWorkspacePusher`).
*   `lib/`: Lógica de backend, serviços, utilitários.
    *   `lib/actions/`: Server Actions para interações com o servidor a partir de Client Components.
    *   `lib/ai/`: Lógica central da IA, incluindo seleção de modelos (OpenAI, Google, OpenRouter), serviços de chat, descrição de imagem, transcrição de áudio e carregamento de ferramentas (incluindo ferramentas dinâmicas HTTP).
    *   `lib/auth/`: Configuração e utilitários de autenticação (NextAuth, API Keys).
    *   `lib/channel/`: Lógica de envio de mensagens para canais específicos (ex: WhatsApp Cloud API).
    *   `lib/google/`: Serviços de integração com Google (ex: Calendar).
    *   `lib/middleware/`: Middlewares customizados para API Routes (ex: autenticação por token).
    *   `lib/queues/`: Definições de filas BullMQ.
    *   `lib/services/`: Lógica de negócios modularizada (ex: `conversationService`, `followUpService`, `channelService`).
    *   `lib/workers/`: Implementações dos workers BullMQ para processamento de jobs em background.
    *   `lib/db.ts`: Instância do Prisma Client.
    *   `lib/redis.ts`: Instância do cliente Redis (ioredis).
    *   `lib/s3Client.ts`: Instância do cliente S3.
    *   `lib/pusher.ts`: Instância do cliente Pusher (servidor).
    *   `lib/encryption.ts`: Utilitários para criptografia de dados sensíveis.
    *   `lib/permissions.ts`: Lógica de verificação de permissões de usuário.
    *   `lib/types/`: Definições de tipos TypeScript globais e específicos.
    *   `lib/utils.ts`: Utilitários genéricos (ex: `cn` para Tailwind).
*   `prisma/`: Schema do banco de dados (`schema.prisma`) e migrações.
*   `public/`: Assets estáticos.
*   `scripts/`: Scripts para iniciar workers ou outras tarefas de desenvolvimento/build.
*   `trigger/`: Configuração e definições de tasks para Trigger.dev.

## 3. Padrões de Codificação e Uso da Stack

*   **Linguagem:** Sempre usar TypeScript, aproveitando a tipagem forte. Definir tipos em `lib/types/` ou localmente quando apropriado.
*   **Componentes:** Preferir Server Components (`app/route/page.tsx`, componentes em `app/route/` que não precisam de interatividade ou hooks) sobre Client Components (`'use client'`, componentes em `app/route/components/` ou `components/` que precisam de interatividade/hooks). Utilizar Shadcn/ui (`components/ui/`) e Lucide Icons.
*   **Estilização:** Utilizar exclusivamente Tailwind CSS para estilização. Aplicar classes via `className` e usar o utilitário `cn` de `lib/utils.ts` para classes condicionais.
*   **Estado:**
    *   **Global/Compartilhado entre Rotas/Componentes:** Utilizar os Providers definidos em `context/` (ex: `WorkspaceContext`, `ConversationContext`).
    *   **Local em Client Components:** Usar `useState`, `useReducer`.
*   **Acesso a Dados:**
    *   **Server Components:** Acessar o banco de dados diretamente via `lib/db.ts` (Prisma Client) ou chamar Server Actions.
    *   **Client Components:** Interagir com o backend exclusivamente via Server Actions (definidas em `lib/actions/`) ou API Routes (definidas em `app/api/`). Evitar chamadas diretas a serviços de `lib/services/` que acessam o DB.
*   **Funções Utilitárias:** Funções reutilizáveis devem ser colocadas em `lib/utils.ts` ou subarquivos relevantes dentro de `lib/` (ex: `lib/phoneUtils.ts`, `lib/timeUtils.ts`).
*   **Autenticação:**
    *   **Sessão de Usuário:** Gerenciada por NextAuth (configuração em `lib/auth/auth-options.ts`).
    *   **API Keys:** Para acesso programático a endpoints específicos, verificar o header `x-api-key`. Lógica em `lib/middleware/api-token-auth.ts` e `lib/auth/auth-utils.ts`.
*   **API Routes (`app/api/`)**:
    *   Seguir o padrão de validação de entrada com Zod.
    *   Usar `getServerSession` ou os middlewares de autenticação (`withAuth`, `withApiTokenAuth`) para proteger rotas.
    *   Utilizar `checkPermission` de `lib/permissions.ts` para controle de acesso baseado em roles.
    *   Interagir com o Prisma Client ou chamar serviços de `lib/services/`.
*   **Server Actions (`lib/actions/`)**:
    *   Usar a diretiva `'use server'`.
    *   Validar dados de entrada com Zod.
    *   Verificar permissões do usuário.
    *   Interagir com o Prisma Client ou outros serviços de backend.
    *   Usar `revalidatePath` ou `revalidateTag` para atualizar o cache do Next.js quando necessário.
*   **Background Jobs (BullMQ):**
    *   Definições de filas em `lib/queues/`.
    *   Implementações de workers em `lib/workers/`. Workers processam jobs assíncronos, interagem com serviços e o banco de dados.
    *   Scripts para iniciar workers em `scripts/`.
*   **Tarefas Agendadas/Event-Driven (Trigger.dev):**
    *   Configuração em `trigger.config.ts`.
    *   Definições de tasks em `trigger/`. Podem ser agendadas (CRON) ou disparadas por eventos.
*   **Integração com IA (Vercel AI SDK):**
    *   Lógica central em `lib/ai/`.
    *   `lib/ai/modelSelector.ts` para escolher entre OpenAI, Google Gemini (via API direta ou OpenRouter).
    *   `lib/ai/chatService.ts` para interações de chat.
    *   `lib/ai/toolLoader.ts` para carregar ferramentas que a IA pode usar, incluindo ferramentas HTTP customizadas definidas no DB (modelo `CustomHttpTool`).
*   **Comunicação em Tempo Real (Pusher):**
    *   Cliente servidor em `lib/pusher.ts`.
    *   Endpoint de autenticação para canais privados em `app/api/pusher/auth/route.ts`.
    *   Eventos são disparados do backend (API Routes, Server Actions, Workers) para notificar clientes de atualizações (ex: novas mensagens, mudança de status).
    *   Hook `hooks/useWorkspacePusher.ts` para gerenciar a conexão e inscrição em canais no frontend, integrado com `ConversationContext`.
*   **Segurança:**
    *   Dados sensíveis (como tokens de API do WhatsApp) são criptografados usando `lib/encryption.ts` antes de serem salvos no banco de dados.
    *   Senhas de usuário são hasheadas com `bcryptjs`.
    *   Variáveis de ambiente são usadas para configurações críticas (chaves de API, URLs de banco de dados, segredos de criptografia).
*   **Gerenciamento de Pacotes**: Usar `pnpm`.

## 4. Testes

*   O projeto possui um script de teste `node --test tests/sequenceService.test.ts`. O escopo e a abrangência dos testes precisam ser verificados.
*   Não foi identificado um framework de teste principal (como Jest ou Vitest) configurado de forma proeminente no `package.json` para testes unitários/integração de componentes React ou backend, além do teste específico mencionado.

## 5. Instruções para Pull Requests

*   Certificar-se de que o código segue os padrões de estilo e estrutura do projeto.
*   Incluir um resumo claro das mudanças no título e corpo do PR.
*   Descrever o que foi testado e como testar as mudanças propostas.
*   Garantir que `pnpm lint` (se configurado) passe sem erros.
*   Manter a documentação (`AGENTS.MD`, `instruction.md`, comentários no código) atualizada conforme as mudanças.

## 6. Processo de Build

*   O build da aplicação é feito com `pnpm run build`.
*   Antes do build, é essencial executar `pnpm run prisma:generate` para gerar o Prisma Client atualizado, conforme observado no `Dockerfile`.

## 7. Variáveis de Ambiente

*   O projeto depende de diversas variáveis de ambiente para configuração de serviços externos (Pusher, S3, Redis, SMTP, APIs de IA, Google OAuth), banco de dados e segredos de aplicação (NextAuth, criptografia). Certifique-se de que o arquivo `.env` (ou as configurações de ambiente do servidor) esteja corretamente configurado.