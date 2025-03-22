-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_campaigns" ALTER COLUMN "steps" DROP NOT NULL;

-- Adicionar a coluna como nullable primeiro
ALTER TABLE "follow_up_schema"."follow_up_steps" ADD COLUMN "campaign_id" TEXT;

-- Criar uma tabela temporária para mapear estágios para campanhas
CREATE TEMP TABLE stage_campaign_map AS
SELECT DISTINCT fs.id AS stage_id, fc.id AS campaign_id
FROM "follow_up_schema"."follow_up_funnel_stages" fs
JOIN "follow_up_schema"."follow_up_campaigns" fc ON fc.id IN (
    SELECT unnest(array_agg(c.id))
    FROM "follow_up_schema"."follow_up_campaigns" c
    JOIN "follow_up_schema"."follow_up_funnel_stages" s ON s.id = fs.id
);

-- Atualizar os passos existentes com base no mapeamento
UPDATE "follow_up_schema"."follow_up_steps" AS steps
SET campaign_id = (
    SELECT map.campaign_id
    FROM stage_campaign_map map
    WHERE map.stage_id = steps.funnel_stage_id
    LIMIT 1
)
WHERE steps.campaign_id IS NULL;

-- Se ainda tiver registros sem campaign_id, usar a primeira campanha disponível
UPDATE "follow_up_schema"."follow_up_steps" AS steps
SET campaign_id = (
    SELECT id FROM "follow_up_schema"."follow_up_campaigns" LIMIT 1
)
WHERE steps.campaign_id IS NULL;

-- Alterar a coluna para NOT NULL
ALTER TABLE "follow_up_schema"."follow_up_steps" ALTER COLUMN "campaign_id" SET NOT NULL;

-- Limpar a tabela temporária
DROP TABLE stage_campaign_map;

-- Adicionar a Foreign Key
ALTER TABLE "follow_up_schema"."follow_up_steps" ADD CONSTRAINT "follow_up_steps_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
