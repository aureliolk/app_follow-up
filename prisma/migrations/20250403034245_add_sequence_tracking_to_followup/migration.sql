-- AlterTable
ALTER TABLE "follow_up_schema"."follow_ups" ADD COLUMN     "current_sequence_step_order" INTEGER DEFAULT 0,
ADD COLUMN     "next_sequence_message_at" TIMESTAMP(3);
