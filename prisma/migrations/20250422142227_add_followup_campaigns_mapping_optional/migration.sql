-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_campaigns" ADD COLUMN     "isDefaultInactivity" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "workspace_schema"."workspace_ai_follow_up_rules" ADD COLUMN     "followUpCampaignId" TEXT,
ADD COLUMN     "sequenceOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "workspace_schema"."event_follow_up_mappings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "followUpCampaignId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_follow_up_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_follow_up_mappings_workspaceId_isActive_idx" ON "workspace_schema"."event_follow_up_mappings"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "event_follow_up_mappings_workspaceId_eventName_key" ON "workspace_schema"."event_follow_up_mappings"("workspaceId", "eventName");

-- CreateIndex
CREATE INDEX "follow_up_campaigns_isDefaultInactivity_idx" ON "follow_up_schema"."follow_up_campaigns"("isDefaultInactivity");

-- CreateIndex
CREATE INDEX "workspace_ai_follow_up_rules_followUpCampaignId_sequenceOrd_idx" ON "workspace_schema"."workspace_ai_follow_up_rules"("followUpCampaignId", "sequenceOrder");

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_ai_follow_up_rules" ADD CONSTRAINT "workspace_ai_follow_up_rules_followUpCampaignId_fkey" FOREIGN KEY ("followUpCampaignId") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."event_follow_up_mappings" ADD CONSTRAINT "event_follow_up_mappings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."event_follow_up_mappings" ADD CONSTRAINT "event_follow_up_mappings_followUpCampaignId_fkey" FOREIGN KEY ("followUpCampaignId") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
