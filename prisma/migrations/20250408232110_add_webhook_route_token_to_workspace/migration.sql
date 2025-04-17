/*
  Warnings:

  - A unique constraint covering the columns `[whatsapp_webhook_route_token]` on the table `workspaces` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" ADD COLUMN     "whatsapp_webhook_route_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_whatsapp_webhook_route_token_key" ON "workspace_schema"."workspaces"("whatsapp_webhook_route_token");
