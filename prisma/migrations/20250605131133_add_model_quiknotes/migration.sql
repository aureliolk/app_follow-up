-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "workspace_schema"."AIStageActionType" ADD VALUE 'SEND_TEXT_MESSAGE';
ALTER TYPE "workspace_schema"."AIStageActionType" ADD VALUE 'SEND_IMAGE';
ALTER TYPE "workspace_schema"."AIStageActionType" ADD VALUE 'SEND_DOCUMENT';

-- DropIndex
DROP INDEX "workspace_schema"."WorkspaceTag_workspace_id_name_key";

-- CreateTable
CREATE TABLE "workspace_schema"."QuickNote" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" TEXT,

    CONSTRAINT "QuickNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickNote_workspace_id_idx" ON "workspace_schema"."QuickNote"("workspace_id");

-- AddForeignKey
ALTER TABLE "workspace_schema"."QuickNote" ADD CONSTRAINT "QuickNote_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
