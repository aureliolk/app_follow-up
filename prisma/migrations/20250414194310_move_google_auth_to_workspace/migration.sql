/*
  Warnings:

  - You are about to drop the column `google_access_token_expires_at` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `google_account_email` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `google_calendar_scopes` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `google_refresh_token` on the `clients` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "conversation_schema"."clients" DROP COLUMN "google_access_token_expires_at",
DROP COLUMN "google_account_email",
DROP COLUMN "google_calendar_scopes",
DROP COLUMN "google_refresh_token";

-- AlterTable
ALTER TABLE "workspace_schema"."workspaces" ADD COLUMN     "google_access_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "google_account_email" TEXT,
ADD COLUMN     "google_calendar_scopes" TEXT[],
ADD COLUMN     "google_refresh_token" TEXT;
