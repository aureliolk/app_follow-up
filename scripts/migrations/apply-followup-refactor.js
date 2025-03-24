// scripts/migrations/apply-followup-refactor.js
// Script para aplicar a migração do Prisma e executar testes de integridade

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

const prisma = new PrismaClient();

async function runPrismaMigrations() {
  try {
    console.log('🔄 Aplicando migração diretamente ao banco de dados...');
    
    // Executar a SQL diretamente utilizando Prisma
    console.log('1. Adicionando novas colunas à tabela follow_ups...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_ups" 
      ADD COLUMN IF NOT EXISTS "current_stage_name" TEXT,
      ADD COLUMN IF NOT EXISTS "previous_stage_name" TEXT,
      ADD COLUMN IF NOT EXISTS "waiting_for_response" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "paused_reason" TEXT,
      ADD COLUMN IF NOT EXISTS "last_response" TEXT,
      ADD COLUMN IF NOT EXISTS "last_response_date" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "processed_by_response" BOOLEAN;
    `);
    
    console.log('2. Criando tabela para transições de estado...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "follow_up_schema"."follow_up_state_transitions" (
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
    
    console.log('3. Criando tabela para respostas de clientes...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "follow_up_schema"."follow_up_client_responses" (
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
    
    console.log('4. Adicionando foreign keys...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_up_state_transitions" 
      ADD CONSTRAINT IF NOT EXISTS "follow_up_state_transitions_follow_up_id_fkey" 
      FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "follow_up_schema"."follow_up_client_responses" 
      ADD CONSTRAINT IF NOT EXISTS "follow_up_client_responses_follow_up_id_fkey" 
      FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    
    console.log('5. Migrando dados dos metadados...');
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
        followup_record RECORD;
        metadata_json JSON;
      BEGIN
        FOR followup_record IN SELECT id, metadata FROM "follow_up_schema"."follow_ups" WHERE metadata IS NOT NULL
        LOOP
          BEGIN
            metadata_json := followup_record.metadata::JSON;
            
            -- Extrair dados dos metadados para os novos campos estruturados
            UPDATE "follow_up_schema"."follow_ups" 
            SET 
              "current_stage_name" = metadata_json->>'current_stage_name',
              "previous_stage_name" = metadata_json->>'previous_stage_name',
              "waiting_for_response" = (metadata_json->>'waiting_for_response')::BOOLEAN,
              "paused_reason" = metadata_json->>'paused_reason',
              "last_response" = metadata_json->>'last_response',
              "last_response_date" = (metadata_json->>'last_response_date')::TIMESTAMP,
              "processed_by_response" = (metadata_json->>'processed_by_response')::BOOLEAN
            WHERE id = followup_record.id;
            
          EXCEPTION WHEN OTHERS THEN
            -- Continuar com o próximo registro em caso de erro
            RAISE NOTICE 'Erro ao processar metadata para follow-up %: %', followup_record.id, SQLERRM;
          END;
        END LOOP;
      END;
      $$;
    `);
    
    console.log('6. Criando índices para melhor performance...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "follow_up_current_stage_name_idx" ON "follow_up_schema"."follow_ups"("current_stage_name");
      CREATE INDEX IF NOT EXISTS "follow_up_waiting_for_response_idx" ON "follow_up_schema"."follow_ups"("waiting_for_response");
      CREATE INDEX IF NOT EXISTS "follow_up_state_transitions_follow_up_id_idx" ON "follow_up_schema"."follow_up_state_transitions"("follow_up_id");
      CREATE INDEX IF NOT EXISTS "follow_up_client_responses_follow_up_id_idx" ON "follow_up_schema"."follow_up_client_responses"("follow_up_id");
    `);
    
    // Atualizar o Prisma Client
    console.log('7. Gerando Prisma Client...');
    await execPromise('npx prisma generate');
    
    console.log('✅ Migração aplicada com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    throw error;
  }
}

async function verifyDataIntegrity() {
  try {
    console.log('🔍 Verificando integridade dos dados...');
    
    // 1. Verificar quantidade de follow-ups
    const followUpCount = await prisma.followUp.count();
    console.log(`📊 Total de follow-ups encontrados: ${followUpCount}`);
    
    // 2. Verificar dados migrados
    const followUpsWithoutStageName = await prisma.followUp.count({
      where: {
        current_stage_id: { not: null },
        current_stage_name: null
      }
    });
    
    if (followUpsWithoutStageName > 0) {
      console.warn(`⚠️ ${followUpsWithoutStageName} follow-ups têm current_stage_id mas não têm current_stage_name`);
      
      // Tentar resolver
      console.log('🔄 Tentando resolver inconsistências...');
      const stageIds = await prisma.followUp.findMany({
        where: {
          current_stage_id: { not: null },
          current_stage_name: null
        },
        select: {
          id: true,
          current_stage_id: true
        }
      });
      
      for (const followUp of stageIds) {
        const stage = await prisma.followUpFunnelStage.findUnique({
          where: { id: followUp.current_stage_id }
        });
        
        if (stage) {
          await prisma.followUp.update({
            where: { id: followUp.id },
            data: { current_stage_name: stage.name }
          });
          console.log(`✅ Corrigido follow-up ${followUp.id} com stage_name: ${stage.name}`);
        } else {
          console.warn(`⚠️ Não foi possível encontrar nome de estágio para o follow-up ${followUp.id}`);
        }
      }
    }
    
    // 3. Verificar transições de estado
    const transitionsCount = await prisma.followUpStateTransition.count();
    console.log(`📊 Total de transições de estado registradas: ${transitionsCount}`);
    
    // 4. Verificar respostas de clientes
    const responsesCount = await prisma.followUpClientResponse.count();
    console.log(`📊 Total de respostas de clientes registradas: ${responsesCount}`);
    
    console.log('✅ Verificação de integridade concluída');
  } catch (error) {
    console.error('❌ Erro ao verificar integridade dos dados:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Iniciando processo de refatoração do follow-up');
    
    await runPrismaMigrations();
    await verifyDataIntegrity();
    
    console.log('✅ Processo de refatoração concluído com sucesso');
  } catch (error) {
    console.error('❌ Erro durante o processo de refatoração:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();