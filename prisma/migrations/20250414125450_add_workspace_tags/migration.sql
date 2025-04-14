-- CreateTable
CREATE TABLE "workspace_schema"."WorkspaceTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceTag_workspace_id_idx" ON "workspace_schema"."WorkspaceTag"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceTag_workspace_id_name_key" ON "workspace_schema"."WorkspaceTag"("workspace_id", "name");

-- AddForeignKey
ALTER TABLE "workspace_schema"."WorkspaceTag" ADD CONSTRAINT "WorkspaceTag_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
