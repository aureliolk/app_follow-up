-- CreateEnum
CREATE TYPE "workspace_schema"."HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateTable
CREATE TABLE "workspace_schema"."custom_http_tools" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "method" "workspace_schema"."HttpMethod" NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB,
    "queryParametersSchema" JSONB,
    "requestBodySchema" JSONB,
    "responseSchema" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_http_tools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_http_tools_workspaceId_idx" ON "workspace_schema"."custom_http_tools"("workspaceId");

-- CreateIndex
CREATE INDEX "custom_http_tools_workspaceId_isEnabled_idx" ON "workspace_schema"."custom_http_tools"("workspaceId", "isEnabled");

-- AddForeignKey
ALTER TABLE "workspace_schema"."custom_http_tools" ADD CONSTRAINT "custom_http_tools_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
