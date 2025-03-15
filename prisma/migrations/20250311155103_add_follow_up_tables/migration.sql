-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "follow_up_schema";

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "steps" JSONB NOT NULL,

    CONSTRAINT "follow_up_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_ups" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "next_message_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "is_responsive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_messages" (
    "id" TEXT NOT NULL,
    "follow_up_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "follow_up_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_ups_client_id_idx" ON "follow_up_schema"."follow_ups"("client_id");

-- CreateIndex
CREATE INDEX "follow_ups_status_idx" ON "follow_up_schema"."follow_ups"("status");

-- CreateIndex
CREATE INDEX "follow_up_messages_follow_up_id_step_idx" ON "follow_up_schema"."follow_up_messages"("follow_up_id", "step");

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_ups" ADD CONSTRAINT "follow_ups_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_messages" ADD CONSTRAINT "follow_up_messages_follow_up_id_fkey" FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
