/*
  Warnings:

  - You are about to drop the column `active_whatsapp_integration_type` on the `workspaces` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" DROP COLUMN "active_whatsapp_integration_type";

-- DropEnum
DROP TYPE "workspace_schema"."whatsapp_integration_type";
