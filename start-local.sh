#!/bin/bash

# Script para iniciar todos os serviços localmente
echo "=== Iniciando a aplicação Followup ==="

# Verifica se o build existe e, se não existir, cria
if [ ! -d "apps/next-app/.next" ]; then
  echo "Build do Next.js não encontrado. Construindo aplicação..."
  pnpm run build
fi

# Verifica se os diretórios dos workers existem
if [ ! -d "apps/workers/dist" ]; then
  echo "Criando diretório para workers..."
  mkdir -p apps/workers/dist/workers
  pnpm run build:workers
fi

# Inicia os serviços em segundo plano
echo "Iniciando Next.js app..."
cd apps/next-app && node ../../node_modules/.bin/next start -p 3000 > ../../logs-nextapp.log 2>&1 &
NEXT_PID=$!
echo "Next.js iniciado com PID: $NEXT_PID"

# Aguarda um pouco antes de iniciar os workers
echo "Aguardando 10 segundos para iniciar workers..."
sleep 10

echo "Iniciando Message Worker..."
cd ../../apps/workers && node dist/workers/messageProcessor.js > ../../logs-message-worker.log 2>&1 &
MSG_WORKER_PID=$!
echo "Message Worker iniciado com PID: $MSG_WORKER_PID"

echo "Iniciando Sequence Worker..."
cd ../../apps/workers && node dist/workers/sequenceStepProcessor.js > ../../logs-sequence-worker.log 2>&1 &
SEQ_WORKER_PID=$!
echo "Sequence Worker iniciado com PID: $SEQ_WORKER_PID"

# Volta ao diretório raiz
cd ../../

echo "=== Todos os serviços iniciados ==="
echo "Para ver os logs:"
echo "  Next.js: tail -f logs-nextapp.log"
echo "  Message Worker: tail -f logs-message-worker.log"
echo "  Sequence Worker: tail -f logs-sequence-worker.log"
echo ""
echo "Para parar todos os processos: kill $NEXT_PID $MSG_WORKER_PID $SEQ_WORKER_PID"
echo ""
echo "PIDs salvos em .pid-followup para fácil referência"

# Salva os PIDs em um arquivo para referência fácil
echo "$NEXT_PID $MSG_WORKER_PID $SEQ_WORKER_PID" > .pid-followup