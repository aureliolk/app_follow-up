-- CreateEnum
CREATE TYPE "workspace_schema"."AIStageActionType" AS ENUM ('API_CALL', 'SEND_VIDEO', 'CONNECT_CALENDAR', 'TRANSFER_HUMAN');

-- CreateTable
CREATE TABLE "workspace_schema"."ai_stage_actions" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "type" "workspace_schema"."AIStageActionType" NOT NULL,
    "order" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_stage_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_stage_actions_stageId_order_idx" ON "workspace_schema"."ai_stage_actions"("stageId", "order");

-- AddForeignKey
ALTER TABLE "workspace_schema"."ai_stage_actions" ADD CONSTRAINT "ai_stage_actions_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "workspace_schema"."ai_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
