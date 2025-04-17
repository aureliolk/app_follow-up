-- DropForeignKey
ALTER TABLE "follow_up_schema"."follow_ups" DROP CONSTRAINT "follow_ups_campaign_id_fkey";

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_ups" ALTER COLUMN "campaign_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_ups" ADD CONSTRAINT "follow_ups_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
