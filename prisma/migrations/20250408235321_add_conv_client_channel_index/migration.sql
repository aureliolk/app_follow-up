/*
  Warnings:

  - A unique constraint covering the columns `[workspace_id,client_id,channel]` on the table `conversations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "conversations_workspace_id_client_id_channel_key" ON "conversation_schema"."conversations"("workspace_id", "client_id", "channel");
