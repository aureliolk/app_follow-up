# AGENTES.md

Este arquivo fornece diretrizes para Agentes de IA que trabalham neste projeto Next.js. Ele complementa as instruções de desenvolvimento encontradas em `instruction.md`.

## 1. Visão Geral do Projeto e Stack

Este projeto utiliza Next.js (App Router), TypeScript, Tailwind CSS, PostgreSQL (via Prisma), Shadcn/ui, Lucide Icons, React Context API, BullMQ, e Vercel AI SDK.

## 2. Estrutura de Diretórios Chave

*   `app/`: Rotas e páginas (Server Components por padrão, com Client Components específicos em subdiretórios `components/`).
*   `components/`: Componentes React reutilizáveis globalmente.
    *   `components/ui/`: Componentes Shadcn/ui (não modificar).
*   `lib/`: Lógica de backend, serviços, utilitários (Prisma Client, Redis, AI services, auth, queues, workers, types, utils).
*   `context/`: Implementações do React Context para estado compartilhado.

## 3. Padrões de Codificação e Uso da Stack

*   **Linguagem:** Sempre usar TypeScript, aproveitando a tipagem forte.
*   **Componentes:** Preferir Server Components (`app/route/page.tsx`, componentes em `app/route/` que não precisam de interatividade ou hooks) sobre Client Components (`'use client'`, componentes em `app/route/components/` ou `components/` que precisam de interatividade/hooks). Utilizar Shadcn/ui (`components/ui/`) e Lucide Icons.
*   **Estilização:** Utilizar exclusivamente Tailwind CSS para estilização. Aplicar classes via `className` e usar o utilitário `cn` de `lib/utils.ts` para classes condicionais.
*   **Estado:** Para estado compartilhado, utilizar os Providers definidos em `context/`. Para estado local em Client Components, usar `useState`.
*   **Acesso a Dados:** Em Server Components, acessar o banco de dados diretamente via `lib/db.ts` (Prisma Client). Em Client Components, interagir via Server Actions ou funções expostas pelos Context Providers que chamam API Routes ou Server Actions.
*   **Funções Utilitárias:** Funções reutilizáveis devem ser colocadas em `lib/utils.ts` ou subarquivos relevantes dentro de `lib/`.
*   **Tipos:** Tipos reutilizáveis globalmente devem ser definidos em `lib/types/`.

## 4. Testes

*   (Adicionar instruções de teste específicas do projeto se aplicável, por exemplo, "Rodar testes unitários com Jest/React Testing Library").

## 5. Instruções para Pull Requests

*   Certificar-se de que o código segue os padrões de estilo e estrutura do projeto.
*   Incluir um resumo claro das mudanças no título e corpo do PR.
*   Descrever o que foi testado e como testar as mudanças propostas.
*   (Adicionar quaisquer outros requisitos de PR específicos do projeto, como verificações de lint/formatação).
