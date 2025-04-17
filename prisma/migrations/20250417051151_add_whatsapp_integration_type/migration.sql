-- CreateEnum
CREATE TYPE "workspace_schema"."whatsapp_integration_type" AS ENUM ('WHATSAPP_CLOUD_API', 'EVOLUTION_API');

-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" ADD COLUMN     "active_whatsapp_integration_type" "workspace_schema"."whatsapp_integration_type" NOT NULL DEFAULT 'WHATSAPP_CLOUD_API';
