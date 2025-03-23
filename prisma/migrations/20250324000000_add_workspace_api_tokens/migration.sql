-- CreateTable
CREATE TABLE "workspace_schema"."workspace_api_tokens" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "workspace_api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_api_tokens_token_key" ON "workspace_schema"."workspace_api_tokens"("token");

-- CreateIndex
CREATE INDEX "workspace_api_tokens_workspace_id_idx" ON "workspace_schema"."workspace_api_tokens"("workspace_id");

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_api_tokens" ADD CONSTRAINT "workspace_api_tokens_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_api_tokens" ADD CONSTRAINT "workspace_api_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "workspace_schema"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;