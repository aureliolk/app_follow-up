/*
  Warnings:

  - Added the required column `updated_at` to the `workspace_invitations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "workspace_schema"."InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "workspace_schema"."workspace_invitations" ADD COLUMN     "status" "workspace_schema"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;
