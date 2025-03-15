/*
  Warnings:

  - You are about to drop the column `prompt_complete` on the `prompts` table. All the data in the column will be lost.
  - You are about to drop the column `prompt_created` on the `prompts` table. All the data in the column will be lost.
  - You are about to drop the column `prompt_removed` on the `prompts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "prompts_schema"."prompts" DROP COLUMN "prompt_complete",
DROP COLUMN "prompt_created",
DROP COLUMN "prompt_removed";

-- CreateTable
CREATE TABLE "prompts_schema"."prompt_contents" (
    "id" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "prompt_created" TEXT,
    "prompt_removed" TEXT,
    "prompt_complete" TEXT,

    CONSTRAINT "prompt_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_contents_prompt_id_key" ON "prompts_schema"."prompt_contents"("prompt_id");

-- AddForeignKey
ALTER TABLE "prompts_schema"."prompt_contents" ADD CONSTRAINT "prompt_contents_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts_schema"."prompts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
