/*
  Warnings:

  - You are about to drop the column `steps` on the `follow_up_campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `follow_up_messages` table. All the data in the column will be lost.
  - You are about to drop the column `funnel_stage` on the `follow_up_messages` table. All the data in the column will be lost.
  - You are about to drop the column `step` on the `follow_up_messages` table. All the data in the column will be lost.
  - You are about to drop the column `template_name` on the `follow_up_messages` table. All the data in the column will be lost.
  - You are about to drop the column `auto_respond` on the `follow_up_steps` table. All the data in the column will be lost.
  - You are about to drop the column `campaign_id` on the `follow_up_steps` table. All the data in the column will be lost.
  - You are about to drop the column `message_category` on the `follow_up_steps` table. All the data in the column will be lost.
  - You are about to drop the column `completion_reason` on the `follow_ups` table. All the data in the column will be lost.
  - You are about to drop the column `current_step` on the `follow_ups` table. All the data in the column will be lost.
  - You are about to drop the column `is_responsive` on the `follow_ups` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `follow_ups` table. All the data in the column will be lost.
  - You are about to drop the `_FollowUpCampaignToFollowUpFunnelStage` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `description` on table `follow_up_funnel_stages` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `category` to the `follow_up_steps` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "follow_up_schema"."_FollowUpCampaignToFollowUpFunnelStage" DROP CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_A_fkey";

-- DropForeignKey
ALTER TABLE "follow_up_schema"."_FollowUpCampaignToFollowUpFunnelStage" DROP CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_B_fkey";

-- DropForeignKey
ALTER TABLE "follow_up_schema"."follow_up_messages" DROP CONSTRAINT "follow_up_messages_follow_up_id_fkey";

-- DropForeignKey
ALTER TABLE "follow_up_schema"."follow_up_steps" DROP CONSTRAINT "follow_up_steps_campaign_id_fkey";

-- DropIndex
DROP INDEX "follow_up_schema"."follow_up_messages_follow_up_id_step_idx";

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_campaigns" DROP COLUMN "steps",
ADD COLUMN     "idLumibot" TEXT,
ADD COLUMN     "tokenAgentLumibot" TEXT;

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_funnel_stages" ADD COLUMN     "campaign_id" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requires_response" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "order" SET DEFAULT 0,
ALTER COLUMN "description" SET NOT NULL;

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_messages" DROP COLUMN "category",
DROP COLUMN "funnel_stage",
DROP COLUMN "step",
DROP COLUMN "template_name",
ADD COLUMN     "error_sending" TEXT,
ADD COLUMN     "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_from_client" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "step_id" TEXT,
ADD COLUMN     "template_used" TEXT;

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_steps" DROP COLUMN "auto_respond",
DROP COLUMN "campaign_id",
DROP COLUMN "message_category",
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "template_name_whatsapp" TEXT;

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_ups" DROP COLUMN "completion_reason",
DROP COLUMN "current_step",
DROP COLUMN "is_responsive",
DROP COLUMN "metadata",
ADD COLUMN     "ai_suggestion" TEXT,
ADD COLUMN     "last_client_message_at" TIMESTAMP(3),
ADD COLUMN     "last_response" TEXT,
ADD COLUMN     "last_response_at" TIMESTAMP(3),
ADD COLUMN     "next_evaluation_at" TIMESTAMP(3),
ADD COLUMN     "paused_reason" TEXT,
ADD COLUMN     "waiting_for_response" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'active';

-- DropTable
DROP TABLE "follow_up_schema"."_FollowUpCampaignToFollowUpFunnelStage";

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_ai_analyses" (
    "id" TEXT NOT NULL,
    "follow_up_id" TEXT NOT NULL,
    "message_id" TEXT,
    "sentiment" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "topics" TEXT[],
    "next_action" TEXT NOT NULL,
    "suggested_stage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_up_ai_analyses_follow_up_id_idx" ON "follow_up_schema"."follow_up_ai_analyses"("follow_up_id");

-- CreateIndex
CREATE INDEX "follow_up_messages_follow_up_id_idx" ON "follow_up_schema"."follow_up_messages"("follow_up_id");

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_funnel_stages" ADD CONSTRAINT "follow_up_funnel_stages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_messages" ADD CONSTRAINT "follow_up_messages_follow_up_id_fkey" FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_ai_analyses" ADD CONSTRAINT "follow_up_ai_analyses_follow_up_id_fkey" FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
