# Claude Guidelines for Follow-Up App

## Commands
- Development: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Test campaign flow: `node scripts/test-campaign-flow.js`
- Test follow-up API: `node scripts/test-followup-api.js`
- Reset follow-up tables: `node scripts/reset-followup-tables.js`

## Code Style
- TypeScript with strict type checking
- Follow Next.js App Router conventions
- Use named exports instead of default exports
- Prefer camelCase for variables/functions, PascalCase for components/types
- Import from `@/*` using alias paths
- Group imports: React, external libraries, internal components/utils
- Use Zod for schema validation and type inference
- Organize API routes in feature folders with clear hierarchy
- Handle errors with try/catch and return proper error responses
- Use Prisma for database access with proper schema organization

## Database
- PostgreSQL with Prisma ORM and multi-schema support
- Run migrations with `npx prisma migrate dev --name your_migration_name`

## Component Structure
- Follow atomic design principles
- Use React Hook Form with Zod validation
- Implement component-specific hooks (eg. FormHook pattern)

## Intruction
# REGRAS PARA SEGUIR EM CADA MÍNIMA AÇÃO

Responda sempre em português brasil

Ao criar ou editar um page.tsx:
- Declare todos os tipos explicitamente no arquivo (não crie um arquivo separado para os tipos)
- Não reinvente a roda, use componentes do shadcn em /components/ui, e se não houver, procure em outras bibliotecas, somente se ainda não houver, crie em /components.
- Crie toda a lógica hook relacionada "use..." no arquivo (não crie um arquivo separado em hooks)
- Crie todas as funções utilitárias específicas dentro do próprio arquivo (não crie em lib/)
- Crie todos os Server Actions específicos dentro do próprio arquivo (não crie em actions/)
- Use zustand para gerenciar estado e crie a store no arquivo (não crie um arquivo separado em store)
- use a pasta /api/ para routes apenas quando necessário.

Nunca modularizar essas partes: (tipos, hooks, funções utilitárias, server actions e stores) é benéfico nesse contexto pois estamos programando com AI Copilots, e ter tudo no mesmo arquivo ajuda a centralizar todo contexto necessário e evita duplicação de código. Nunca crie pasta hooks.

# FLUXO OBRIGATÓRIO DE DESENVOLVIMENTO

PRIMEIRO:
- Se for modificar arquivos, confira antes quais arquivos serão modificados, e para cada um, liste quais trechos, estilos e funcionalidades devem permanecer imutáveis para manter a integridade do código.

SEGUNDO:
- Após o estudo, passe para a fase da analise dos passos. Pois pode ser uma ação grande que seja melhor quebrar em menores passos para manter a integridade do código, e garantir que faça o todo bem feito, danda a atenção necessário a cada passo. Analise e exponha seu plano.

TERCEIRO:
1. Decida o melhor primeiro passo e peça permissão. Espere o ok do usuário, e faça.
2. Decida o melhor segundo passo, analise o que deve permanecer imutável. Espere o ok do usuário, e faça.
3. ... por aí vai, obrigatoriamente parando e pedindo permissão para continuar para o próximo, explicitando qual será. Espere a permissão do usuário.

# REGRAS DURANTE TODO O FLUXO DE DESENVOLVIMENTO

- DRY o estilo usando todas as classes e estilos importando do @globals.css e @tailwind.config.ts

# PONTOS DE ATENÇÃO

Criando projeto em Nextjs 14 com app router, typescript
- Já executei criei o projeto nextjs na raiz (executei: npx create-next-app@14 .)
- Já instalei o zustand (executei: npm install zustand)
- Já instalei o shadcn e todos seus componentes em /components/ui  (instalei com npx shadcn@latest init -d; npx shadcn@latest add --all)
- Para comandos do terminal, use a sintaxe correta do powershell do windows.

Já estamos na raiz do projeto,
crie os page.tsx em /src/app/
crie os componentes em /src/componentes
nunca modifique arquivos da pasta  /src/componentes/ui, apenas use-os, pois são componentes prontos do shadcn

Lembre-se, faça apenas uma ação por vez.

## Stack

### Web:

- Framework: Next.js
- Linguagem: TypeScript
- Estilos: TailwindCSS
- Componentes: Shadcn e lucide-react
- Autenticação: Next Auth
    - JWT 
- Banco de dados: Prisma
    - PostgreSQL


ANALISE AS REGRAS ACIMA E FAÇA O QUE SE PEDE:
