-- AlterTable
ALTER TABLE "workspace_schema"."users" ADD COLUMN     "is_super_admin" BOOLEAN NOT NULL DEFAULT false;
