-- CreateTable
CREATE TABLE "workspace_schema"."ai_stages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dataToCollect" JSONB,
    "finalResponseInstruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_stages_workspaceId_idx" ON "workspace_schema"."ai_stages"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_stages_workspaceId_name_key" ON "workspace_schema"."ai_stages"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "workspace_schema"."ai_stages" ADD CONSTRAINT "ai_stages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
