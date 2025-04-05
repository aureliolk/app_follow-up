#!/bin/sh
# entrypoint.sh

# Navega para o diretório da aplicação se necessário (WORKDIR já deve ser /app)
# cd /app

echo "Starting Message Worker in background..."
pnpm start:message &
MESSAGE_PID=$!

echo "Starting Sequence Worker in background..."
pnpm start:sequence &
SEQUENCE_PID=$!

echo "Starting Main Application (Web) in foreground..."
# Usa exec para que o processo principal substitua o shell
# e receba sinais corretamente do Docker
exec pnpm start

# Opcional: Adicionar trap para matar processos filhos ao sair
# trap "kill $MESSAGE_PID $SEQUENCE_PID" SIGTERM SIGINT
# wait $MESSAGE_PID
# wait $SEQUENCE_PID
# (A abordagem com exec no processo principal geralmente é suficiente) 