-- CreateEnum
CREATE TYPE "workspace_schema"."DealSource" AS ENUM ('WEBSITE', 'LINKEDIN', 'GOOGLE_ADS', 'FACEBOOK_ADS', 'REFERRAL', 'EMAIL_MARKETING', 'COLD_CALL', 'EVENT', 'IMPORT', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "workspace_schema"."TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "workspace_schema"."ActivitySource" AS ENUM ('AI', 'USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "workspace_schema"."pipeline_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#cccccc',
    "order" INTEGER NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."deals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "probability" DOUBLE PRECISION DEFAULT 0,
    "expected_close_date" TIMESTAMP(3),
    "source" "workspace_schema"."DealSource",
    "workspace_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "ai_controlled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."deal_notes" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."deal_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3),
    "status" "workspace_schema"."TaskStatus" NOT NULL DEFAULT 'PENDING',
    "deal_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."deal_documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."deal_activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "user_id" TEXT,
    "source" "workspace_schema"."ActivitySource" NOT NULL DEFAULT 'AI',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."pipeline_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "condition" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_stages_workspace_id_order_idx" ON "workspace_schema"."pipeline_stages"("workspace_id", "order");

-- CreateIndex
CREATE INDEX "deals_workspace_id_idx" ON "workspace_schema"."deals"("workspace_id");

-- CreateIndex
CREATE INDEX "deals_client_id_idx" ON "workspace_schema"."deals"("client_id");

-- CreateIndex
CREATE INDEX "deals_stage_id_idx" ON "workspace_schema"."deals"("stage_id");

-- CreateIndex
CREATE INDEX "deals_assigned_to_id_idx" ON "workspace_schema"."deals"("assigned_to_id");

-- CreateIndex
CREATE INDEX "deal_notes_deal_id_idx" ON "workspace_schema"."deal_notes"("deal_id");

-- CreateIndex
CREATE INDEX "deal_notes_author_id_idx" ON "workspace_schema"."deal_notes"("author_id");

-- CreateIndex
CREATE INDEX "deal_tasks_deal_id_idx" ON "workspace_schema"."deal_tasks"("deal_id");

-- CreateIndex
CREATE INDEX "deal_tasks_assigned_to_id_idx" ON "workspace_schema"."deal_tasks"("assigned_to_id");

-- CreateIndex
CREATE INDEX "deal_tasks_status_idx" ON "workspace_schema"."deal_tasks"("status");

-- CreateIndex
CREATE INDEX "deal_documents_deal_id_idx" ON "workspace_schema"."deal_documents"("deal_id");

-- CreateIndex
CREATE INDEX "deal_documents_uploaded_by_id_idx" ON "workspace_schema"."deal_documents"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "deal_activity_logs_deal_id_idx" ON "workspace_schema"."deal_activity_logs"("deal_id");

-- CreateIndex
CREATE INDEX "deal_activity_logs_user_id_idx" ON "workspace_schema"."deal_activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "pipeline_rules_stage_id_idx" ON "workspace_schema"."pipeline_rules"("stage_id");

-- AddForeignKey
ALTER TABLE "workspace_schema"."pipeline_stages" ADD CONSTRAINT "pipeline_stages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deals" ADD CONSTRAINT "deals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deals" ADD CONSTRAINT "deals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "conversation_schema"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "workspace_schema"."pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deals" ADD CONSTRAINT "deals_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "workspace_schema"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deal_notes" ADD CONSTRAINT "deal_notes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "workspace_schema"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deal_notes" ADD CONSTRAINT "deal_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "workspace_schema"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deal_tasks" ADD CONSTRAINT "deal_tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "workspace_schema"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deal_tasks" ADD CONSTRAINT "deal_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "workspace_schema"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deal_documents" ADD CONSTRAINT "deal_documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "workspace_schema"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deal_documents" ADD CONSTRAINT "deal_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "workspace_schema"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deal_activity_logs" ADD CONSTRAINT "deal_activity_logs_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "workspace_schema"."deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."deal_activity_logs" ADD CONSTRAINT "deal_activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "workspace_schema"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."pipeline_rules" ADD CONSTRAINT "pipeline_rules_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "workspace_schema"."pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
