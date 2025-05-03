# Dockerfile for websocket-server

# ---- Base ----
# Use uma imagem Node.js leve e oficial. Alpine é uma boa escolha para tamanho.
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

# ---- Build Stage ----
# Estágio para instalar dependências de desenvolvimento e construir o código
FROM base AS builder
WORKDIR /app

# Copia arquivos de dependência e instala TODAS as dependências (incluindo dev)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copia o restante do código-fonte
COPY . .

# Executa o build (compila TypeScript, etc.)
# Certifique-se de que 'pnpm run build' compila para uma pasta 'dist'
RUN pnpm run build

# ---- Production Stage ----
# Estágio final com apenas dependências de produção e código compilado
FROM base AS production
WORKDIR /app

# Copia arquivos de dependência e instala APENAS dependências de produção
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copia o código compilado do estágio de build
COPY --from=builder /app/dist ./dist
# Se houver outros arquivos necessários em produção (ex: .env.production, assets), copie-os também
# COPY --from=builder /app/.env.production .

# Define o ambiente como produção
ENV NODE_ENV=production
# Expõe a porta que seu servidor WebSocket escuta (ajuste se necessário)
EXPOSE 3001

# Comando para iniciar o servidor em produção
# Ajuste 'dist/server.js' se o seu ponto de entrada for diferente
CMD ["node", "dist/server.js"]