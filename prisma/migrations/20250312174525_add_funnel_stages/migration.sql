/*
  Warnings:

  - You are about to drop the `_FollowUpCampaignToFollowUpFunnelStage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."_FollowUpCampaignToFollowUpFunnelStage" DROP CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_FollowUpCampaignToFollowUpFunnelStage" DROP CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_B_fkey";

-- DropTable
DROP TABLE "public"."_FollowUpCampaignToFollowUpFunnelStage";

-- CreateTable
CREATE TABLE "follow_up_schema"."_FollowUpCampaignToFollowUpFunnelStage" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_FollowUpCampaignToFollowUpFunnelStage_B_index" ON "follow_up_schema"."_FollowUpCampaignToFollowUpFunnelStage"("B");

-- AddForeignKey
ALTER TABLE "follow_up_schema"."_FollowUpCampaignToFollowUpFunnelStage" ADD CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_A_fkey" FOREIGN KEY ("A") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."_FollowUpCampaignToFollowUpFunnelStage" ADD CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_B_fkey" FOREIGN KEY ("B") REFERENCES "follow_up_schema"."follow_up_funnel_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
