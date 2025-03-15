/*
  Warnings:

  - You are about to drop the column `analysis` on the `prompts` table. All the data in the column will be lost.
  - You are about to drop the column `prompt` on the `prompts` table. All the data in the column will be lost.
  - You are about to drop the column `quality_checks` on the `prompts` table. All the data in the column will be lost.
  - Added the required column `instruction` to the `prompts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "prompts_schema"."prompts" DROP COLUMN "analysis",
DROP COLUMN "prompt",
DROP COLUMN "quality_checks",
ADD COLUMN     "instruction" TEXT NOT NULL;
