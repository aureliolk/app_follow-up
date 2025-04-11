-- AlterTable
ALTER TABLE "conversation_schema"."messages" ADD COLUMN     "ai_media_analysis" TEXT,
ALTER COLUMN "content" DROP NOT NULL,
ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;
