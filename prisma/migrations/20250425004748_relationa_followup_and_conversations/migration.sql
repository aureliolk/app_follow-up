/*
  Warnings:

  - A unique constraint covering the columns `[conversationId]` on the table `follow_ups` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "follow_up_schema"."follow_ups" ADD COLUMN     "conversationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_conversationId_key" ON "follow_up_schema"."follow_ups"("conversationId");

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_ups" ADD CONSTRAINT "follow_ups_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation_schema"."conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
