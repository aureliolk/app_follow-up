# Use imagem Debian-based para melhor compatibilidade com módulos nativos
FROM node:18-slim AS base

# Instala dependências essenciais (incluindo Python e compiladores)
RUN apt-get update && apt-get install -y \
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
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --include=dev  # Inclui devDependencies para Prisma

# Estágio de build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Gerar Prisma Client
RUN npx prisma generate

ENV NODE_ENV=production
RUN npm run build

# Estágio de produção
FROM base AS runner
WORKDIR /app


# Copiar apenas o necessário
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Adicionar usuário não-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# Use o comando padrão do Next.js
CMD ["npm", "start"]