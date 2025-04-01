/*
  Warnings:

  - A unique constraint covering the columns `[webhook_ingress_secret]` on the table `workspaces` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "conversation_schema";

-- CreateEnum
CREATE TYPE "conversation_schema"."ConversationStatus" AS ENUM ('ACTIVE', 'PAUSED_BY_USER', 'PAUSED_BY_AI', 'CLOSED');

-- CreateEnum
CREATE TYPE "conversation_schema"."MessageSenderType" AS ENUM ('CLIENT', 'AI', 'SYSTEM');

-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" ADD COLUMN     "ai_default_system_prompt" TEXT,
ADD COLUMN     "ai_model_preference" TEXT,
ADD COLUMN     "webhook_ingress_secret" TEXT;

-- CreateTable
CREATE TABLE "conversation_schema"."clients" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "external_id" TEXT,
    "phone_number" TEXT,
    "name" TEXT,
    "channel" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_schema"."conversations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "channel" TEXT,
    "channel_conversation_id" TEXT,
    "status" "conversation_schema"."ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_ai_active" BOOLEAN NOT NULL DEFAULT true,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_schema"."messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_type" "conversation_schema"."MessageSenderType" NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "channel_message_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_workspace_id_idx" ON "conversation_schema"."clients"("workspace_id");

-- CreateIndex
CREATE INDEX "clients_external_id_idx" ON "conversation_schema"."clients"("external_id");

-- CreateIndex
CREATE INDEX "clients_phone_number_idx" ON "conversation_schema"."clients"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "clients_workspace_id_phone_number_channel_key" ON "conversation_schema"."clients"("workspace_id", "phone_number", "channel");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_idx" ON "conversation_schema"."conversations"("workspace_id");

-- CreateIndex
CREATE INDEX "conversations_client_id_idx" ON "conversation_schema"."conversations"("client_id");

-- CreateIndex
CREATE INDEX "conversations_channel_conversation_id_idx" ON "conversation_schema"."conversations"("channel_conversation_id");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversation_schema"."conversations"("status");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversation_schema"."conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "conversation_schema"."messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_timestamp_idx" ON "conversation_schema"."messages"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_webhook_ingress_secret_key" ON "workspace_schema"."workspaces"("webhook_ingress_secret");

-- AddForeignKey
ALTER TABLE "conversation_schema"."clients" ADD CONSTRAINT "clients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_schema"."conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_schema"."conversations" ADD CONSTRAINT "conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "conversation_schema"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_schema"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation_schema"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
