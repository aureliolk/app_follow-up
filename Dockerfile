# Dockerfile

# --- Stage 1: Base com Node.js e PNPM ---
FROM node:20-alpine AS base
# Instala pnpm globalmente
RUN npm install -g pnpm
WORKDIR /app

# --- Stage 2: Instalar TODAS as dependências ---
# Copia arquivos de manifesto primeiro para cache de dependências
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Descomente se você usar pnpm workspaces
# COPY pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Stage 3: Build da Aplicação ---
FROM base AS builder
# Copia dependências instaladas
COPY --from=deps /app/node_modules ./node_modules
# Copia todo o código fonte
COPY . .

# Gera o cliente Prisma (requer schema)
RUN pnpm prisma generate --schema=./prisma/schema.prisma

# Compila os workers TypeScript para JavaScript (assumindo tsconfig output para ./dist)
# Se seu build script já faz isso, pode remover esta linha

# --- Comandos de Debug APÓS TSC ---
RUN echo "### Listando conteúdo raiz APÓS tsc ###" && ls -la /app
RUN echo "### Tentando listar conteúdo de dist APÓS tsc ###" && ls -la /app/dist || echo "### Pasta /app/dist NÃO encontrada APÓS tsc ###"
# --- Fim dos Comandos de Debug ---

# Executa o build do Next.js (e qualquer outro passo do seu script build)
RUN pnpm build

# --- Comandos de Debug APÓS BUILD ---
RUN echo "### Listando conteúdo raiz APÓS build ###" && ls -la /app
RUN echo "### Tentando listar conteúdo de dist APÓS build ###" && ls -la /app/dist || echo "### Pasta /app/dist NÃO encontrada APÓS build ###"
# --- Fim dos Comandos de Debug ---

# Compila os workers APÓS o build principal
RUN pnpm tsc -p tsconfig.workers.json

# Remove dependências de desenvolvimento para reduzir o tamanho da imagem final
RUN pnpm prune --prod

# --- Stage 4: Imagem Final de Produção ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Cria usuário e grupo não-root
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Copia artefatos do build e dependências de produção
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
# Opcional: Copie o lockfile se pnpm start precisar dele explicitamente
# COPY --from=builder --chown=nodejs:nodejs /app/pnpm-lock.yaml ./
COPY --from=builder --chown=nodejs:nodejs /app/.next ./.next
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Define o usuário não-root
USER nodejs

# Expõe a porta padrão do Next.js
EXPOSE 3000

# Comando padrão para iniciar a aplicação web (será sobrescrito pelos workers)
# Certifique-se que seu script "start" em package.json executa "next start"
CMD ["pnpm", "start"] 