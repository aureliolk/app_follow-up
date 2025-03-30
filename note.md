

**Relatório Completo do Projeto: `app_follow-up-main` (Sistema de Follow-up Inteligente)**

**Data:** 30 de Março de 2025 (Baseado nos logs)

**1. Visão Geral e Objetivo do Projeto:**

O `app_follow-up-main` é uma aplicação web construída com Next.js destinada a gerenciar e automatizar campanhas de follow-up de clientes, com um diferencial chave: a integração profunda de Inteligência Artificial (IA) para tornar as interações mais dinâmicas, personalizadas e eficazes. O objetivo principal é superar as limitações de fluxos sequenciais rígidos, permitindo que a IA analise respostas, adapte mensagens e tome decisões sobre o próximo passo na jornada do cliente, visando otimizar o engajamento e a conversão, ao mesmo tempo que respeita regras de plataformas externas como o WhatsApp.

**2. Stack Tecnológica:**

*   **Framework:** Next.js 15.x (com App Router e Turbopack para desenvolvimento)
*   **Linguagem:** TypeScript (com `strict` mode)
*   **Banco de Dados:** PostgreSQL
*   **ORM:** Prisma (v6.x, com suporte a multi-schema)
*   **UI:** TailwindCSS (v4.x), Shadcn UI, Lucide Icons (`lucide-react`)
*   **Autenticação:** NextAuth.js (v4.x) com Credentials e Google providers, usando JWT.
*   **Gerenciamento de Estado (Frontend):** Zustand (mencionado, mas implementação detalhada não confirmada nos arquivos de UI fornecidos). React Context (`WorkspaceProvider`) é usado para gerenciar o estado do workspace ativo.
*   **IA:**
    *   Vercel AI SDK (`ai/react`, `@ai-sdk/openai`)
    *   Modelo: OpenAI GPT-3.5-Turbo (via `@ai-sdk/openai`)
*   **Comunicação Externa (WhatsApp):** Integração via API REST com a plataforma Lumibot (envio de HSM e Texto Livre).
*   **Validação:** Zod (para schemas de API e formulários).
*   **Utilitários:** Axios, date-fns, bcrypt, Marked (para docs), etc.
*   **Containerização:** Docker, Docker Compose.

**3. Lógica Central e Arquitetura do Follow-up (Paradigma Atual: IA-Managed):**

O sistema evoluiu de um modelo sequencial de passos para um paradigma gerenciado pela IA.

*   **IA como Gerente:** A função central `determineNextAction` (`functionIa.ts`) atua como o cérebro, recebendo o estado atual do follow-up e decidindo a próxima melhor ação (`AIAction`).
*   **Estágios do Funil (`FollowUpFunnelStage`):** Definem as fases macro da jornada do cliente (ex: "Etapa 1", "Etapa 2"). A IA tenta progredir o cliente através desses estágios.
*   **Passos (`FollowUpStep`):** Funcionam como uma biblioteca de *templates* de mensagens associados a um estágio. Cada passo contém:
    *   `template_name`: Identificador interno.
    *   `message_content`: Conteúdo base da mensagem (pode conter `{{1}}`).
    *   `wait_time_ms`: Tempo de espera *após* o envio desta mensagem antes da próxima avaliação automática da IA.
    *   `is_hsm`: Booleano indicando se este template corresponde a um HSM aprovado no WhatsApp.
    *   `category`: Categoria (Utility, Marketing, etc.).
*   **Follow-up (`FollowUp`):** Mantém o estado de cada cliente em uma campanha, incluindo:
    *   `current_stage_id`: O estágio atual do funil.
    *   `status`: (active, paused, completed, canceled).
    *   `last_client_message_at`: Timestamp da última mensagem do cliente (para regra 24h).
    *   `next_evaluation_at`: Timestamp da próxima vez que a IA deve avaliar este follow-up.
*   **Gatilhos para a IA:**
    *   **Início do Follow-up:** `initializeNewFollowUp` agenda a primeira avaliação.
    *   **Timer de Avaliação:** `scheduleNextEvaluation_V2` agenda um `setTimeout`. Quando dispara, chama `determineNextAction` e `executeAIAction`.
    *   **Resposta do Cliente:** `handleClientResponse` (acionado via webhook) cancela timers pendentes, analisa a resposta (`analyzeClientResponse`) e chama `determineNextAction` e `executeAIAction`.
*   **Execução da Ação (`executeAIAction`):** Recebe a `AIAction` decidida e executa a lógica correspondente:
    *   `SEND_MESSAGE`: Busca o template (se `content_source: 'template'`), personaliza (`personalizeMessageContent` se não for HSM), ou gera conteúdo (`generateAIResponse` se `content_source: 'generate'`). Cria `FollowUpMessage` no DB. Chama `scheduleMessage` para o envio real. Chama `scheduleNextEvaluation_V2` para agendar a próxima avaliação (usando `wait_time_ms` do template se aplicável, ou um delay curto se for `generate`).
    *   `SCHEDULE_EVALUATION`: Chama `scheduleNextEvaluation_V2` com o delay especificado pela IA.
    *   `CHANGE_STAGE`: Chama `processStageAdvancement` (que atualiza o estágio e chama `scheduleNextEvaluation_V2`).
    *   `PAUSE`, `COMPLETE`, etc.: Atualiza o status do `FollowUp`.
*   **Agendamento e Envio (`scheduler.ts`, `initializer.ts`):**
    *   `scheduleMessage`: Agenda o envio de uma mensagem específica via `setTimeout`.
    *   `sendMessage`: Chamado pelo timeout, verifica o status, chama `processAndSendMessage`.
    *   `processAndSendMessage`: Usa `lumibotProcessor` para o envio.
    *   `lumibotProcessor`: Verifica a janela 24h e `is_hsm`, busca nome do cliente, chama a API Lumibot (`enviarHSMLumibot` ou `enviarTextoLivreLumibot`).
*   **Regras Críticas (Aplicadas no Prompt e Código):**
    *   **Janela 24h:** Fora da janela, SÓ HSMs (`is_hsm: true`) podem ser enviados. O código em `determineNextAction` agora *força* isso se a IA errar.
    *   **Tempo de Espera:** A IA é instruída a verificar o tempo restante desde a última mensagem enviada. Se ainda estiver aguardando, a única ação deve ser `SCHEDULE_EVALUATION`.
    *   **Prioridade Pós-Resposta:** Dentro da janela 24h, após interação do cliente, a IA deve priorizar gerar uma resposta (`generate`, `is_hsm: false`).

**4. Estrutura de Pastas Relevantes:**

```
app_follow-up-main/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── docs/
│   │   ├── follow-up/
│   │   │   ├── [id]/
│   │   │   ├── campaigns/
│   │   │   ├── _lib/             # Lógica Core Backend Follow-up
│   │   │   │   ├── ai/
│   │   │   │   │   └── functionIa.ts
│   │   │   │   ├── internal/
│   │   │   │   │   └── followUpHelpers.ts
│   │   │   │   ├── initializer.ts
│   │   │   │   ├── manager.ts
│   │   │   │   └── scheduler.ts
│   │   │   ├── _utils/           # Utilitários API Follow-up
│   │   │   │   ├── csv-parser.ts
│   │   │   │   └── time-calculator.ts
│   │   │   ├── (outras rotas .ts)
│   │   ├── webhook-receiver/
│   │   ├── webhook-trigger/
│   │   └── workspaces/
│   ├── auth/                   # Páginas de Autenticação UI
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── follow-up/              # Páginas UI Follow-up
│   │   ├── campaigns/
│   │   │   ├── [id]/page.tsx     # Edição de Campanha
│   │   │   ├── _components/      # Componentes UI específicos
│   │   │   └── page.tsx          # Listagem de Campanhas
│   │   ├── kanban/page.tsx       # (Kanban não implementado completamente)
│   │   ├── _services/          # Funções/Hooks para interagir com API
│   │   │   ├── followUpService.ts
│   │   │   └── funnelService.ts (Overlap com followUpService)
│   │   ├── _types/             # Tipos Frontend
│   │   │   ├── index.ts        (Interfaces Manuais - Redundante?)
│   │   │   └── schema.ts       (Schemas Zod e Tipos Inferidos)
│   │   └── page.tsx              # Listagem/Dashboard Follow-up
│   ├── workspace/              # Páginas UI Workspace
│   │   └── [slug]/
│   │       ├── campaigns/page.tsx
│   │       ├── followup/page.tsx
│   │       ├── members/page.tsx
│   │       ├── settings/
│   │       │   ├── components/
│   │       │   │   ├── ApiTokenManager.tsx
│   │       │   │   └── WebhookManager.tsx
│   │       │   └── page.tsx
│   │       ├── layout.tsx
│   │       └── page.tsx          # Dashboard Workspace
│   ├── workspaces/page.tsx     # Listagem de Workspaces
│   ├── layout.tsx              # Layout Raiz
│   ├── page.tsx                # Landing Page
│   └── globals.css
├── components/
│   ├── ai/
│   │   └── aichat.tsx
│   ├── ui/                     # Componentes Shadcn
│   ├── footer.tsx
│   ├── header.tsx
│   └── session-provider.tsx
├── context/
│   └── workspace-context.tsx
├── lib/
│   ├── ai/
│   │   └── chatService.ts
│   ├── auth/
│   │   ├── auth-options.ts
│   │   └── auth-utils.ts
│   ├── middleware/
│   │   └── api-token-auth.ts
│   ├── db.ts
│   ├── permissions.ts
│   └── utils.ts
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── public/
│   ├── follow-up-ai-docs.md
│   └── (CSVs de exemplo)
├── scripts/                   # Scripts de teste/manutenção
├── Dockerfile
├── docker-compose.yml
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

**5. Estado Atual e Funcionalidades Implementadas:**

*   **Fluxo Básico:** Criação de follow-up, envio sequencial de mensagens (HSM fora da janela 24h, texto livre dentro), respeito ao `wait_time` entre passos automáticos.
*   **Inteligência Artificial:**
    *   Decisão da próxima ação (`determineNextAction`).
    *   Análise de resposta do cliente (`analyzeClientResponse`).
    *   Geração de resposta direta (`generateAIResponse`) quando aplicável.
    *   Personalização de templates (`personalizeMessageContent`).
    *   Correções de código para garantir regras (HSM) mesmo com "erros" da IA.
*   **Gerenciamento de Timers:** Agendamento (`scheduleNextEvaluation_V2`) e cancelamento (`cancelScheduledMessages`) de avaliações e mensagens funciona (baseado nos últimos logs).
*   **Integração Lumibot:** Envio de HSMs (com variáveis) e Texto Livre implementado.
*   **Workspaces:** Sistema de criação, listagem, associação com campanhas, gerenciamento de membros, API Tokens e Webhooks.
*   **Autenticação:** Login/Registro com credenciais e Google.
*   **API:** Endpoints funcionais para gerenciar Follow-ups, Campanhas, Stages, Steps, Workspaces, Tokens, Webhooks.

**6. Problemas Conhecidos e Desafios Superados:**

*   **Erro `fetch` interno:** Resolvido movendo IA para serviços.
*   **Fluxo Sequencial Rígido:** Superado com o paradigma IA-Managed.
*   **Erro "Processador não configurado" (HMR):** Resolvido usando import direto do processador.
*   **IA violando Regra 24h/HSM:** Resolvido com correção forçada no código.
*   **IA não incluindo `is_hsm` para `generate`:** Resolvido com correção forçada no código.
*   **Ação não executada no Timer:** Resolvido corrigindo importação e garantindo chamada a `executeAIAction`.
*   **Cancelamento de Timer:** Resolvido após debug intensivo (logs indicam que funciona agora).
*   **IA não respeitando `wait_time`:** Resolvido com refinamento do prompt (Regra 3).
*   **IA não priorizando `generate`:** Resolvido com refinamento do prompt (Regra 2).
*   **[Pendente] Variável `{{1}}` não renderiza:** Suspeita de problema externo (Lumibot/Config Template). Código envia `processed_params` corretamente.
*   **[Pendente] Cancelamento de Timer (Confirmação):** Embora os logs pareçam OK, a natureza de HMR/dev pode mascarar problemas. Teste em produção recomendado.

**7. Próximos Passos / Roadmap Imediato:**

1.  **Implementar Prompt Específico por Campanha:**
    *   Alterar `schema.prisma` (modelo `FollowUpCampaign`).
    *   Rodar `prisma migrate dev`.
    *   Atualizar API `POST /campaigns` e `PUT /campaigns/[id]`.
    *   Atualizar UI de criação/edição de campanha.
    *   Atualizar `determineNextAction` para buscar e usar os prompts da campanha.
2.  **Verificar Variável `{{1}}` na Lumibot:** Investigar por que não está renderizando no WhatsApp.
3.  **Testar Fluxo Longo:** Validar se a IA não repete mensagens e segue a sequência corretamente após vários `wait_time`.
4.  **Refatorar/Limpar Código:**
    *   Remover `/api/follow-up/steps/route.ts`.
    *   Unificar lógica de API para Stages/Steps em `followUpService.ts`.
    *   Consolidar tipos em `_types/schema.ts` (baseado em Zod).
    *   Unificar funções de parse de tempo.
    *   Revisar componentes em `_components/` conforme a guideline do usuário.

**8. Arquivos Fornecidos (Contexto Atual da IA):**

*   (Lista completa dos 132 arquivos fornecidos anteriormente)
*   Logs de execução dos testes.

**9. Diretrizes de Desenvolvimento:**

*   Responder em Português (Brasil).
*   Ao criar/editar `page.tsx`:
    *   Tipos explícitos no arquivo.
    *   Usar Shadcn UI > Outras Bibliotecas > Criar Componente.
    *   Lógica de Hook (`use...`) no arquivo.
    *   Funções utilitárias específicas no arquivo.
    *   Server Actions específicos no arquivo.
    *   Stores Zustand no arquivo.
    *   Usar `/api` apenas quando necessário.
*   **NÃO MODULARIZAR:** Tipos, hooks, utils, server actions, stores devem ficar no mesmo arquivo da page/componente principal para contexto da IA. Não criar pasta `hooks`.
*   **Fluxo Obrigatório:** 1. Analisar Imutabilidade -> 2. Analisar Passos -> 3. Executar Passo a Passo com Permissão.
*   **Estilo:** Usar `globals.css` e `tailwind.config.ts` (DRY).
*   **Tecnologias:** Next.js 14 App Router, TypeScript, Zustand, Shadcn, Prisma, PostgreSQL.
*   **Estrutura:** `src/app` para páginas, `src/componentes` (não `src/components/ui`).
*   **Terminal:** Usar sintaxe PowerShell (Windows).


