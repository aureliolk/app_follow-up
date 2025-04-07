# Instruções para Desenvolvimento com IA neste Projeto

Este documento descreve os padrões, tecnologias e convenções estabelecidas neste projeto Next.js para garantir a consistência e qualidade do código ao colaborar com assistentes de IA.

## 1. Visão Geral da Stack

*   **Framework:** Next.js (v14+ com App Router)
*   **Linguagem:** TypeScript
*   **Banco de Dados:** PostgreSQL com Prisma ORM
*   **Estilização:** Tailwind CSS
*   **Componentes UI:** Shadcn/ui (baseado em Radix UI) + Lucide Icons
*   **Estado Global/Compartilhado:** React Context API (`context/`)
*   **Filas/Jobs Assíncronos:** BullMQ com Redis (`lib/queues/`, `lib/workers/`)
*   **Comunicação Externa:** API Routes (para webhooks, etc.), Fetch/Axios em Client Components (via Context ou direto), Funções diretas em Server Components.
*   **IA:** Vercel AI SDK (`ai` package), serviços em `lib/ai/`
*   **Autenticação:** (Provavelmente NextAuth, verificar `lib/auth/`)
*   **Notificações:** React Hot Toast

## 2. Estrutura de Diretórios e Arquivos

*   **`app/`**: Contém as rotas (App Router).
    *   `app/rota/page.tsx`: Arquivo principal da página (Server Component por padrão).
    *   `app/rota/layout.tsx`: Layout específico da rota.
    *   `app/rota/components/`: **Componentes usados exclusivamente por esta rota**. Frequentemente Client Components (`'use client'`) para interatividade.
    *   `app/api/.../route.ts`: API Routes para endpoints específicos (webhooks, etc.).
*   **`components/`**: Componentes React reutilizáveis em múltiplas rotas.
    *   `components/ui/`: **Componentes Shadcn UI. NÃO MODIFICAR.** Apenas importar e usar.
    *   Outros arquivos `.tsx` ou subdiretórios (ex: `components/layout/`) são componentes personalizados globais.
*   **`lib/`**: Lógica de backend, serviços, utilitários e configurações compartilhadas.
    *   `lib/db.ts`: Instância do Prisma Client.
    *   `lib/redis.ts`: Conexão Redis.
    *   `lib/ai/`: Serviços relacionados à IA.
    *   `lib/auth/`: Lógica de autenticação.
    *   `lib/channel/`: Lógica de canais de comunicação (ex: Lumibot).
    *   `lib/queues/`: Definição e adição de jobs às filas BullMQ.
    *   `lib/workers/`: Implementação dos workers BullMQ.
    *   `lib/types/`: **Tipos TypeScript reutilizáveis globalmente.**
    *   `lib/utils.ts`, `lib/timeUtils.ts`, etc.: **Funções utilitárias reutilizáveis globalmente.**
*   **`context/`**: Implementações do React Context para gerenciamento de estado compartilhado (ex: `WorkspaceProvider`, `ClientProvider`).
*   **`prisma/`**: Schema do banco de dados (`schema.prisma`).
*   **`public/`**: Arquivos estáticos.
*   **`styles/`**: (Não parece existir, Tailwind configurado em `tailwind.config.ts` e classes usadas diretamente).
*   **`instruction.md`**: Este arquivo.

## 3. Padrões de Codificação

*   **Componentes:** Favorecer Server Components sempre que possível. Usar `'use client'` apenas quando necessário (hooks, interatividade, `useEffect`, `useState`, Context API).
*   **Tipagem:**
    *   Declarar tipos **explicitamente** dentro do arquivo (`.tsx`) onde são usados primariamente (props de componentes, tipos de estado local, etc.).
    *   **NÃO** criar arquivos de tipo separados para cada componente/página.
    *   Tipos que precisam ser reutilizados em **múltiplos locais não relacionados** (ex: entre `lib/`, `context/`, e `app/`) devem ser definidos em `lib/types/`.
*   **Hooks:**
    *   Definir hooks React (`useState`, `useEffect`, `useContext`, hooks customizados) **diretamente** dentro dos Client Components que os utilizam.
    *   **NÃO** criar uma pasta `hooks/` separada.
*   **Funções Utilitárias:**
    *   Definir funções auxiliares específicas para um componente/página **diretamente** dentro do arquivo `.tsx`.
    *   Funções que são **genéricas e reutilizáveis** em diferentes partes da aplicação devem ir para arquivos dentro de `lib/` (ex: `lib/utils.ts`).
*   **Server Actions:**
    *   Server Actions específicos para uma página/formulário devem ser definidos **dentro** do arquivo `page.tsx` ou componente Server que os utiliza.
    *   Se um Server Action for reutilizável, considere colocá-lo em `lib/actions/` (criar se necessário).
*   **Estado:**
    *   Usar `useState` para estado local simples em Client Components.
    *   Usar **React Context API** (`context/`) para estado compartilhado entre múltiplos componentes (ex: dados do workspace, cliente logado). (Zustand não é o padrão atual).
*   **Estilização:**
    *   Usar **Tailwind CSS** exclusivamente.
    *   Aplicar classes diretamente nos elementos JSX via `className`.
    *   Usar o utilitário `cn` (importado de `lib/utils.ts`) para aplicar classes condicionalmente.
    *   Manter a consistência visual usando as variáveis e temas definidos em `tailwind.config.ts` e cores/estilos base do Shadcn.
*   **Comunicação com Backend:**
    *   **Server Components:** Acessar o banco de dados (Prisma) ou outros serviços diretamente via funções assíncronas importadas de `lib/`.
    *   **Client Components:**
        *   Preferir usar **funções/hooks expostos pelos Providers de Context** (`context/`) que encapsulam a lógica de busca/mutação de dados.
        *   Se necessário chamar endpoints diretamente, usar `fetch` ou `axios` para interagir com API Routes (`app/api/`).
        *   Considerar Server Actions para mutações simples originadas em formulários dentro de Client Components.
*   **Bibliotecas:**
    *   Priorizar o uso de componentes de `components/ui/` (Shadcn) para UI.
    *   Usar `lucide-react` para ícones.
    *   Usar `react-hot-toast` para notificações.
    *   Usar `prisma` para acesso ao banco.
    *   Usar `ai` (Vercel AI SDK) para interações com LLMs.

## 4. Fluxo de Desenvolvimento com IA

1.  **Análise Prévia:** Antes de modificar arquivos, identificar quais serão alterados e quais funcionalidades/estilos devem permanecer intactos.
2.  **Planejamento:** Dividir tarefas complexas em passos menores. Explicitar o plano.
3.  **Execução Passo a Passo:** Executar um passo de cada vez, explicando o que será feito e aguardando confirmação antes de prosseguir para o próximo passo.
4.  **Consistência:** Seguir rigorosamente os padrões descritos neste documento.

Ao seguir estas instruções, esperamos manter um código coeso, legível e fácil de manter, mesmo com a colaboração de diferentes assistentes de IA. 