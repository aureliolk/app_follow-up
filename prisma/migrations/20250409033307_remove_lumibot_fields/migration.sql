/*
  Warnings:

  - You are about to drop the column `lumibot_account_id` on the `workspaces` table. All the data in the column will be lost.
  - You are about to drop the column `lumibot_api_token` on the `workspaces` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" DROP COLUMN "lumibot_account_id",
DROP COLUMN "lumibot_api_token";
