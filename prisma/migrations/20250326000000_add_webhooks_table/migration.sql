-- CreateTable
CREATE TABLE "workspace_schema"."workspace_webhooks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,

    CONSTRAINT "workspace_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_webhooks_workspace_id_idx" ON "workspace_schema"."workspace_webhooks"("workspace_id");

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_webhooks" ADD CONSTRAINT "workspace_webhooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "workspace_schema"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_webhooks" ADD CONSTRAINT "workspace_webhooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;