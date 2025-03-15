FROM node:18-alpine

WORKDIR /app

# Instale dependências
COPY package*.json ./
RUN npm install

# Copie todos os arquivos do projeto
COPY . .

# Gere o Prisma Client para Alpine Linux
RUN npx prisma generate

# Construa a aplicação
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://postgres:lumibot@127.0.0.1:5432/products?schema=public

CMD ["npm", "run", "dev"]