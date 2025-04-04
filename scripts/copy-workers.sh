#!/bin/bash

# Script para copiar arquivos do worker compilado para a pasta dist apropriada
echo ">>> Iniciando cópia dos workers..."

# Criar diretórios necessários
mkdir -p /app/apps/workers/dist/workers
mkdir -p /app/apps/workers/dist/queues

# Verificar se os arquivos foram compilados
if [ -f "/app/apps/workers/src/workers/messageProcessor.js" ]; then
  echo "Encontrado messageProcessor.js. Copiando..."
  cp /app/apps/workers/src/workers/messageProcessor.js /app/apps/workers/dist/workers/
else
  echo "messageProcessor.js não encontrado na pasta src!"
fi

if [ -f "/app/apps/workers/src/workers/sequenceStepProcessor.js" ]; then
  echo "Encontrado sequenceStepProcessor.js. Copiando..."
  cp /app/apps/workers/src/workers/sequenceStepProcessor.js /app/apps/workers/dist/workers/
else
  echo "sequenceStepProcessor.js não encontrado na pasta src!"
fi

# Copiar arquivos de filas também
if [ -f "/app/apps/workers/src/queues/messageProcessingQueue.js" ]; then
  echo "Encontrado messageProcessingQueue.js. Copiando..."
  cp /app/apps/workers/src/queues/messageProcessingQueue.js /app/apps/workers/dist/queues/
else
  echo "messageProcessingQueue.js não encontrado na pasta src!"
fi

if [ -f "/app/apps/workers/src/queues/sequenceStepQueue.js" ]; then
  echo "Encontrado sequenceStepQueue.js. Copiando..."
  cp /app/apps/workers/src/queues/sequenceStepQueue.js /app/apps/workers/dist/queues/
else
  echo "sequenceStepQueue.js não encontrado na pasta src!"
fi

echo ">>> Terminada a cópia dos workers."
echo "Arquivos na pasta dist/workers:"
ls -la /app/apps/workers/dist/workers || echo "Pasta dist/workers não encontrada"
echo "Arquivos na pasta dist/queues:"
ls -la /app/apps/workers/dist/queues || echo "Pasta dist/queues não encontrada"