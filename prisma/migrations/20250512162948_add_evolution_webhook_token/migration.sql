/*
  Warnings:

  - You are about to drop the column `evolution_webhook_token` on the `workspaces` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[evolution_api_token]` on the table `workspaces` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[evolution_webhook_route_token]` on the table `workspaces` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "workspace_schema"."workspaces_evolution_webhook_token_key";

-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" DROP COLUMN "evolution_webhook_token",
ADD COLUMN     "evolution_api_token" TEXT,
ADD COLUMN     "evolution_webhook_route_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_evolution_api_token_key" ON "workspace_schema"."workspaces"("evolution_api_token");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_evolution_webhook_route_token_key" ON "workspace_schema"."workspaces"("evolution_webhook_route_token");
