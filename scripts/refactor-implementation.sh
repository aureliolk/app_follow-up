#!/bin/bash
# Script para implementar a refatoração do sistema de follow-up

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}IMPLEMENTAÇÃO DA REFATORAÇÃO DO SISTEMA DE FOLLOW-UP${NC}"
echo -e "${BLUE}==================================================${NC}\n"

# Função para confirmação
confirm() {
    read -r -p "$1 [s/N] " response
    case "$response" in
        [sS][iI][mM]|[sS]) 
            true
            ;;
        *)
            false
            ;;
    esac
}

# Passo 1: Executar a migração do prisma
echo -e "${YELLOW}Passo 1: Aplicar migração do Prisma para adicionar os novos campos${NC}"
if confirm "Deseja aplicar a migração agora?"; then
    echo "Executando migração..."
    node scripts/migrations/apply-followup-refactor.js
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERRO: Falha ao aplicar migração do Prisma${NC}"
        exit 1
    else
        echo -e "${GREEN}Migração aplicada com sucesso!${NC}"
    fi
else
    echo "Migração ignorada."
fi

# Passo 2: Testar os novos arquivos refatorados
echo -e "\n${YELLOW}Passo 2: Testar os arquivos refatorados${NC}"
if confirm "Deseja realizar o teste de refatoração?"; then
    echo "Executando teste..."
    node scripts/test-refactored-followup.js
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERRO: Falha ao executar o teste da implementação refatorada${NC}"
        if confirm "Deseja continuar mesmo assim?"; then
            echo "Continuando..."
        else
            exit 1
        fi
    else
        echo -e "${GREEN}Teste executado com sucesso!${NC}"
    fi
else
    echo "Teste ignorado."
fi

# Passo 3: Substituir os arquivos
echo -e "\n${YELLOW}Passo 3: Substituir os arquivos originais pelos refatorados${NC}"
if confirm "ATENÇÃO: Isso irá substituir os arquivos originais. Deseja continuar?"; then
    echo "Fazendo backup dos arquivos originais..."
    
    # Criar pasta de backup
    BACKUP_DIR="backup_followup_$(date +%Y%m%d%H%M%S)"
    mkdir -p ./app/api/follow-up/_lib/$BACKUP_DIR
    
    # Backup dos arquivos originais
    cp ./app/api/follow-up/_lib/manager.ts ./app/api/follow-up/_lib/$BACKUP_DIR/
    cp ./app/api/follow-up/_lib/scheduler.ts ./app/api/follow-up/_lib/$BACKUP_DIR/
    cp ./app/api/follow-up/_lib/initializer.ts ./app/api/follow-up/_lib/$BACKUP_DIR/
    
    echo "Substituindo arquivos..."
    cp ./app/api/follow-up/_lib/manager.refactor.ts ./app/api/follow-up/_lib/manager.ts
    cp ./app/api/follow-up/_lib/scheduler.refactor.ts ./app/api/follow-up/_lib/scheduler.ts
    cp ./app/api/follow-up/_lib/initializer.refactor.ts ./app/api/follow-up/_lib/initializer.ts
    
    echo -e "${GREEN}Arquivos substituídos com sucesso!${NC}"
    echo -e "Backup salvo em: ./app/api/follow-up/_lib/${BACKUP_DIR}/"
else
    echo "Substituição cancelada."
fi

echo -e "\n${GREEN}==================================================${NC}"
echo -e "${GREEN}IMPLEMENTAÇÃO DA REFATORAÇÃO CONCLUÍDA${NC}"
echo -e "${GREEN}==================================================${NC}"
echo -e "${YELLOW}Próximos passos:${NC}"
echo -e "1. Reinicie o servidor Next.js"
echo -e "2. Execute o script test-campaign-flow.js para validar"
echo -e "3. Verifique os logs em busca de erros"
echo -e "\nSe encontrar problemas, você pode restaurar os arquivos originais do backup."