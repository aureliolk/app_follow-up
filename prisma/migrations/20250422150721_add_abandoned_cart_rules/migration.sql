-- CreateTable
CREATE TABLE "workspace_schema"."abandoned_cart_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "delay_milliseconds" BIGINT NOT NULL,
    "message_content" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abandoned_cart_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "abandoned_cart_rules_workspace_id_sequenceOrder_idx" ON "workspace_schema"."abandoned_cart_rules"("workspace_id", "sequenceOrder");

-- AddForeignKey
ALTER TABLE "workspace_schema"."abandoned_cart_rules" ADD CONSTRAINT "abandoned_cart_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
