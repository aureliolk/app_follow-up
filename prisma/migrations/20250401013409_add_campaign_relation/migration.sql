-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_follow_up_campaigns" ADD CONSTRAINT "workspace_follow_up_campaigns_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
