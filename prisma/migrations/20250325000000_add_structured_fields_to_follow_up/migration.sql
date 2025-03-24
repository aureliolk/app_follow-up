-- AlterTable para adicionar o campo completion_reason na tabela follow_ups
ALTER TABLE "follow_up_schema"."follow_ups" ADD COLUMN "completion_reason" TEXT;
