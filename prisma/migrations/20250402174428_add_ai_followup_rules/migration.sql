-- CreateTable
CREATE TABLE "workspace_schema"."workspace_ai_follow_up_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "delay_milliseconds" BIGINT NOT NULL,
    "message_content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_ai_follow_up_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_ai_follow_up_rules_workspace_id_created_at_idx" ON "workspace_schema"."workspace_ai_follow_up_rules"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_ai_follow_up_rules" ADD CONSTRAINT "workspace_ai_follow_up_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
