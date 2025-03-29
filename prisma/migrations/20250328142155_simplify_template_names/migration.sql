/*
  Warnings:

  - You are about to drop the column `template_name` on the `follow_up_steps` table. All the data in the column will be lost.
  - You are about to drop the column `template_name_whatsapp` on the `follow_up_steps` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_steps" DROP COLUMN "template_name",
DROP COLUMN "template_name_whatsapp",
ADD COLUMN     "is_hsm" BOOLEAN NOT NULL DEFAULT false;
