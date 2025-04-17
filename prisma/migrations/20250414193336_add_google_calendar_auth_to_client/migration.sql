-- AlterTable
ALTER TABLE "conversation_schema"."clients" ADD COLUMN     "google_access_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "google_account_email" TEXT,
ADD COLUMN     "google_calendar_scopes" TEXT[],
ADD COLUMN     "google_refresh_token" TEXT;
