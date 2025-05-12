/*
  Warnings:

  - A unique constraint covering the columns `[evolution_webhook_token]` on the table `workspaces` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" ADD COLUMN     "evolution_webhook_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_evolution_webhook_token_key" ON "workspace_schema"."workspaces"("evolution_webhook_token");
