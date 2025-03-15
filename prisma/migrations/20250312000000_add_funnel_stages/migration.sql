-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_funnel_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_funnel_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_steps" (
    "id" TEXT NOT NULL,
    "funnel_stage_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "wait_time" TEXT NOT NULL,
    "wait_time_ms" INTEGER NOT NULL,
    "message_content" TEXT NOT NULL,
    "message_category" TEXT,
    "auto_respond" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'created',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FollowUpCampaignToFollowUpFunnelStage" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_ups" ADD COLUMN "current_stage_id" TEXT;

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_messages" ADD COLUMN "category" TEXT;
ALTER TABLE "follow_up_schema"."follow_up_messages" ADD COLUMN "funnel_stage" TEXT;
ALTER TABLE "follow_up_schema"."follow_up_messages" ADD COLUMN "template_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "_FollowUpCampaignToFollowUpFunnelStage_AB_unique" ON "_FollowUpCampaignToFollowUpFunnelStage"("A", "B");

-- CreateIndex
CREATE INDEX "_FollowUpCampaignToFollowUpFunnelStage_B_index" ON "_FollowUpCampaignToFollowUpFunnelStage"("B");

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_steps" ADD CONSTRAINT "follow_up_steps_funnel_stage_id_fkey" FOREIGN KEY ("funnel_stage_id") REFERENCES "follow_up_schema"."follow_up_funnel_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FollowUpCampaignToFollowUpFunnelStage" ADD CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_A_fkey" FOREIGN KEY ("A") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FollowUpCampaignToFollowUpFunnelStage" ADD CONSTRAINT "_FollowUpCampaignToFollowUpFunnelStage_B_fkey" FOREIGN KEY ("B") REFERENCES "follow_up_schema"."follow_up_funnel_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;