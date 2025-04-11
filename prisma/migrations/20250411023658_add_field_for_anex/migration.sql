-- AlterTable
ALTER TABLE "conversation_schema"."messages" ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "media_filename" TEXT DEFAULT '',
ADD COLUMN     "media_mime_type" TEXT DEFAULT '',
ADD COLUMN     "media_url" TEXT DEFAULT '',
ADD COLUMN     "provider_message_id" TEXT,
ADD COLUMN     "sent_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT DEFAULT 'PENDING';
