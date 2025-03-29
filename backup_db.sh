#!/bin/bash

# --- Configuração ---
DB_HOST="168.119.247.230"
DB_PORT="5432"
DB_USER="postgres"
DB_NAME="nextlumibot"
# SENHA: Cuidado! A forma mais segura é usar um arquivo .pgpass
# Veja a nota abaixo. Como alternativa temporária, use PGPASSWORD.
DB_PASS="lumibot" # <--- SUBSTITUA PELA SENHA CORRETA SE NECESSÁRIO

BACKUP_DIR="./db_backups" # Diretório onde os backups serão salvos (relativo a onde o script for executado)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.dump"

# --- Lógica do Backup ---
echo "------------------------------------------"
echo "Iniciando backup do banco de dados: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "Usuário: $DB_USER"
echo "------------------------------------------"

# 1. Criar o diretório de backup se ele não existir
mkdir -p "$BACKUP_DIR"
if [ $? -ne 0 ]; then
  echo "ERRO: Não foi possível criar o diretório de backup '$BACKUP_DIR'."
  exit 1
fi
echo "Diretório de backup: $BACKUP_DIR"

# 2. Exportar a senha como variável de ambiente (alternativa ao .pgpass)
#    Isso evita que a senha apareça no histórico de comandos.
export PGPASSWORD=$DB_PASS
echo "Executando pg_dump..."

# 3. Executar o comando pg_dump
#    -Fc: Formato custom (comprimido, recomendado para pg_restore)
#    -v:  Modo verbose (mostra progresso)
#    -f:  Arquivo de saída
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc -v -f "$BACKUP_FILE"

# 4. Verificar se o pg_dump foi bem-sucedido
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "------------------------------------------"
  echo "SUCESSO: Backup concluído!"
  echo "Arquivo: $BACKUP_FILE"
  echo "Tamanho: $(ls -lh "$BACKUP_FILE" | awk '{print $5}')"
  echo "------------------------------------------"
else
  echo "------------------------------------------"
  echo "ERRO: Falha ao criar o backup (Código de saída: $EXIT_CODE)."
  echo "Verifique as mensagens de erro acima."
  echo "------------------------------------------"
  # Limpar arquivo incompleto, se existir
  rm -f "$BACKUP_FILE"
  # Limpar a variável de ambiente da senha
  unset PGPASSWORD
  exit 1
fi

# 5. Limpar a variável de ambiente da senha por segurança
unset PGPASSWORD

exit 0