-- AlterTable
ALTER TABLE "workspace_schema"."campaigns" ADD COLUMN     "is_template" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "template_category" TEXT,
ADD COLUMN     "template_name" TEXT;
