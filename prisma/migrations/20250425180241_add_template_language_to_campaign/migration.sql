-- AlterTable
ALTER TABLE "workspace_schema"."campaign_contacts" ADD COLUMN     "variables" JSONB DEFAULT '{}';

-- AlterTable
ALTER TABLE "workspace_schema"."campaigns" ADD COLUMN     "template_language" TEXT;
