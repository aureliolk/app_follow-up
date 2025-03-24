// scripts/reset-followup-tables-auto.js
// Script para deletar e recriar as tabelas de follow-up (sem confirmação)

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

const prisma = new PrismaClient();

async function resetFollowUpTables() {
  try {
    console.log('🔄 Iniciando redefinição das tabelas...');
    
    // 1. Remover foreign keys primeiro
    console.log('1. Removendo foreign keys...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "follow_up_schema"."follow_up_state_transitions" 
      DROP CONSTRAINT IF EXISTS "follow_up_state_transitions_follow_up_id_fkey";
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "follow_up_schema"."follow_up_client_responses" 
      DROP CONSTRAINT IF EXISTS "follow_up_client_responses_follow_up_id_fkey";
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "follow_up_schema"."follow_up_messages" 
      DROP CONSTRAINT IF EXISTS "follow_up_messages_follow_up_id_fkey";
    `);
    
    // 2. Remover tabelas novas
    console.log('2. Removendo novas tabelas...');
    await prisma.$executeRawUnsafe(`
      DROP TABLE IF EXISTS "follow_up_schema"."follow_up_state_transitions";
    `);
    
    await prisma.$executeRawUnsafe(`
      DROP TABLE IF EXISTS "follow_up_schema"."follow_up_client_responses";
    `);
    
    // 3. Limpar mensagens existentes
    console.log('3. Limpando tabela de mensagens...');
    await prisma.$executeRawUnsafe(`
      DELETE FROM "follow_up_schema"."follow_up_messages";
    `);
    
    // 4. Limpar follow-ups existentes
    console.log('4. Limpando tabela de follow-ups...');
    await prisma.$executeRawUnsafe(`
      DELETE FROM "follow_up_schema"."follow_ups";
    `);
    
    // 5. Remover colunas adicionais (uma por vez)
    console.log('5. Removendo colunas adicionais...');
    const columns = [
      "current_stage_name",
      "previous_stage_name",
      "waiting_for_response",
      "paused_reason",
      "last_response",
      "last_response_date",
      "processed_by_response"
    ];
    
    for (const column of columns) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "follow_up_schema"."follow_ups" 
          DROP COLUMN IF EXISTS "${column}";
        `);
      } catch (err) {
        console.log(`Coluna ${column} não existia, continuando...`);
      }
    }
    
    // 6. Criar novas tabelas e campos (um por vez)
    console.log('6. Adicionando novas colunas...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_ups" 
      ADD COLUMN "current_stage_name" TEXT;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_ups" 
      ADD COLUMN "previous_stage_name" TEXT;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_ups" 
      ADD COLUMN "waiting_for_response" BOOLEAN DEFAULT false;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_ups" 
      ADD COLUMN "paused_reason" TEXT;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_ups" 
      ADD COLUMN "last_response" TEXT;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_ups" 
      ADD COLUMN "last_response_date" TIMESTAMP(3);
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_ups" 
      ADD COLUMN "processed_by_response" BOOLEAN;
    `);
    
    console.log('7. Criando tabela para transições de estado...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "follow_up_schema"."follow_up_state_transitions" (
        "id" TEXT NOT NULL,
        "follow_up_id" TEXT NOT NULL,
        "from_stage_id" TEXT,
        "to_stage_id" TEXT,
        "from_stage_name" TEXT,
        "to_stage_name" TEXT,
        "transition_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "triggered_by" TEXT,
        "metadata" TEXT,
        CONSTRAINT "follow_up_state_transitions_pkey" PRIMARY KEY ("id")
      );
    `);
    
    console.log('8. Criando tabela para respostas de clientes...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "follow_up_schema"."follow_up_client_responses" (
        "id" TEXT NOT NULL,
        "follow_up_id" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "current_step" INTEGER NOT NULL,
        "current_stage_name" TEXT,
        "triggered_advance" BOOLEAN DEFAULT false,
        CONSTRAINT "follow_up_client_responses_pkey" PRIMARY KEY ("id")
      );
    `);
    
    console.log('9. Adicionando foreign keys...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_up_state_transitions" 
      ADD CONSTRAINT "follow_up_state_transitions_follow_up_id_fkey" 
      FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_up_client_responses" 
      ADD CONSTRAINT "follow_up_client_responses_follow_up_id_fkey" 
      FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_up_messages" 
      ADD CONSTRAINT "follow_up_messages_follow_up_id_fkey" 
      FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    
    console.log('10. Criando índices...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "follow_up_current_stage_name_idx" 
      ON "follow_up_schema"."follow_ups"("current_stage_name");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "follow_up_waiting_for_response_idx" 
      ON "follow_up_schema"."follow_ups"("waiting_for_response");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "follow_up_state_transitions_follow_up_id_idx" 
      ON "follow_up_schema"."follow_up_state_transitions"("follow_up_id");
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "follow_up_client_responses_follow_up_id_idx" 
      ON "follow_up_schema"."follow_up_client_responses"("follow_up_id");
    `);
    
    // 11. Regenerar Prisma Client
    console.log('11. Atualizando Prisma Client...');
    await execPromise('npx prisma generate');
    
    console.log('✅ Todas as tabelas foram redefinidas com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro ao redefinir tabelas:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('\n====================================================');
    console.log('REDEFINIÇÃO DAS TABELAS DE FOLLOW-UP');
    console.log('====================================================\n');
    
    const success = await resetFollowUpTables();
    
    if (success) {
      console.log('\n====================================================');
      console.log('✅ REDEFINIÇÃO CONCLUÍDA COM SUCESSO!');
      console.log('====================================================\n');
      console.log('Agora você pode continuar com a implementação da nova versão.');
    }
  } catch (error) {
    console.error('\n====================================================');
    console.error('❌ ERRO DURANTE A REDEFINIÇÃO:', error);
    console.error('====================================================\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o script
main();