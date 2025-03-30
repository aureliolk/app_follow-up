/*
  Warnings:

  - You are about to drop the column `name` on the `follow_up_steps` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_campaigns" ADD COLUMN     "ai_prompt_cta_link" TEXT DEFAULT '',
ADD COLUMN     "ai_prompt_cta_text" TEXT DEFAULT '',
ADD COLUMN     "ai_prompt_extra_instructions" TEXT DEFAULT '',
ADD COLUMN     "ai_prompt_main_benefit" TEXT DEFAULT '',
ADD COLUMN     "ai_prompt_pain_point" TEXT DEFAULT '',
ADD COLUMN     "ai_prompt_product_name" TEXT DEFAULT '',
ADD COLUMN     "ai_prompt_target_audience" TEXT DEFAULT '',
ADD COLUMN     "ai_prompt_tone_of_voice" TEXT DEFAULT '';

-- AlterTable
ALTER TABLE "follow_up_schema"."follow_up_steps" DROP COLUMN "name";
