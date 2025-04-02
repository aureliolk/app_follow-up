# Use imagem Debian-based para melhor compatibilidade com módulos nativos
FROM node:18-slim AS base

# Instala dependências essenciais (incluindo Python e compiladores)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Estágio de instalação de dependências
FROM base AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --include=dev

# Estágio de build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# --- Passos de Build Separados ---
RUN echo ">>> Generating Prisma Client..." && \
    npx prisma generate && \
    echo ">>> Prisma Client Generated."

# 1. Compilar o Worker explicitamente
RUN echo ">>> Compiling Worker (tsc --project tsconfig.worker.json)..." && \
    # Garanta que typescript está em devDependencies e tsconfig.worker.json existe
    npm run --if-present compile:worker || npx tsc --project tsconfig.worker.json && \
    echo ">>> Worker Compilation Attempted." && \
    echo ">>> Listing /app contents AFTER tsc:" && \
    ls -la /app && \
    echo ">>> Listing /app/dist contents AFTER tsc:" && \
    ls -la /app/dist || echo "--- /app/dist NOT FOUND after tsc ---"

# 2. Construir a aplicação Next.js
ENV NODE_ENV=production
RUN echo ">>> Building Next.js Application (next build)..." && \
    npm run build:next || npx next build && \
    echo ">>> Next.js Build Completed."
# --- Fim Passos de Build Separados ---

# --- Opcional: Remover devDependencies ---
# RUN npm prune --production

# Estágio de produção final
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copiar apenas o necessário do estágio de build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
# Copiar a pasta dist - O erro acontecia aqui se ela não existisse no builder
COPY --from=builder /app/dist ./dist

# Adicionar usuário não-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]