/*
  Warnings:

  - Added the required column `workspace_id` to the `follow_ups` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "follow_up_schema"."follow_ups" ADD COLUMN     "workspace_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_ups" ADD CONSTRAINT "follow_ups_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
