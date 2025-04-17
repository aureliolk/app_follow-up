# ---- Estágio 1: Builder ----
# Use uma imagem Node com pnpm pré-instalado ou instale-o
FROM node:20-alpine AS builder

# Instalar pnpm globalmente (se não estiver na imagem base)
# <<< ADICIONE ESTA LINHA >>>
RUN npm install -g pnpm


# Definir diretório de trabalho
WORKDIR /app

# Instalar ffmpeg
RUN apk update && apk add --no-cache ffmpeg

# Instalar dependências primeiro para aproveitar o cache do Docker
COPY package.json pnpm-lock.yaml ./
# --frozen-lockfile garante que as versões exatas do lockfile sejam usadas
# --prod pode ser omitido aqui se devDependencies forem necessárias para o build
RUN pnpm install --frozen-lockfile 

# Copiar o restante do código da aplicação
# Atenção: Certifique-se de ter um .dockerignore para evitar copiar node_modules, .git, dist, etc.
COPY . .

# Gerar Prisma Client (essencial!)
RUN pnpm run prisma:generate

# Construir todas as partes da aplicação (Next.js, workers, shared-lib)
# Use o comando de build geral do seu CLAUDE.md
RUN pnpm run build 

