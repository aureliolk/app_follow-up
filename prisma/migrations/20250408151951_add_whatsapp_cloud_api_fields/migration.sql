-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" ADD COLUMN     "whatsapp_access_token" TEXT,
ADD COLUMN     "whatsapp_business_account_id" TEXT,
ADD COLUMN     "whatsapp_phone_number_id" TEXT,
ADD COLUMN     "whatsapp_webhook_verify_token" TEXT;
