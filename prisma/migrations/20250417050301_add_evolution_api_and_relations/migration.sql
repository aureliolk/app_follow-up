-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" ADD COLUMN     "evolution_api_endpoint" TEXT,
ADD COLUMN     "evolution_api_instance_name" TEXT,
ADD COLUMN     "evolution_api_key" TEXT;
