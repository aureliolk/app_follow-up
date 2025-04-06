#!/bin/sh
# entrypoint.sh

# Garante que o script pare se um comando falhar
set -e

echo "[Entrypoint] Aplicando migrações do Prisma..."
# Usa pnpm para executar o comando prisma local do projeto
pnpm prisma migrate deploy --schema=./prisma/schema.prisma
echo "[Entrypoint] Migrações aplicadas."

echo "[Entrypoint] Iniciando o comando principal do container..."
# Executa o comando passado como argumentos para este script
# (será o CMD do Dockerfile ou o 'command' do docker-compose)
exec "$@" 