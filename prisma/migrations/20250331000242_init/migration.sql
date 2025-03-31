-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "follow_up_schema";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "products_schema";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "prompts_schema";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "workspace_schema";

-- CreateTable
CREATE TABLE "products_schema"."products" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "gender" TEXT,
    "image" TEXT,
    "categories" JSONB NOT NULL,
    "variations" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompts_schema"."prompts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_current" BOOLEAN DEFAULT false,
    "instruction" TEXT NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompts_schema"."prompt_contents" (
    "id" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "prompt_created" TEXT,
    "prompt_removed" TEXT,
    "prompt_complete" TEXT,

    CONSTRAINT "prompt_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "idLumibot" TEXT,
    "tokenAgentLumibot" TEXT,
    "ai_prompt_product_name" TEXT DEFAULT '',
    "ai_prompt_target_audience" TEXT DEFAULT '',
    "ai_prompt_pain_point" TEXT DEFAULT '',
    "ai_prompt_main_benefit" TEXT DEFAULT '',
    "ai_prompt_tone_of_voice" TEXT DEFAULT '',
    "ai_prompt_extra_instructions" TEXT DEFAULT '',
    "ai_prompt_cta_link" TEXT DEFAULT '',
    "ai_prompt_cta_text" TEXT DEFAULT '',

    CONSTRAINT "follow_up_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_funnel_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_id" TEXT NOT NULL DEFAULT '',
    "requires_response" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,

    CONSTRAINT "follow_up_funnel_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_steps" (
    "id" TEXT NOT NULL,
    "funnel_stage_id" TEXT NOT NULL,
    "template_name" TEXT NOT NULL DEFAULT '',
    "wait_time" TEXT NOT NULL,
    "wait_time_ms" INTEGER NOT NULL,
    "message_content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "is_hsm" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "follow_up_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_ups" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "next_message_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "current_stage_id" TEXT,
    "waiting_for_response" BOOLEAN NOT NULL DEFAULT false,
    "last_response" TEXT,
    "last_response_at" TIMESTAMP(3),
    "last_client_message_at" TIMESTAMP(3),
    "next_evaluation_at" TIMESTAMP(3),
    "paused_reason" TEXT,
    "ai_suggestion" TEXT,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_messages" (
    "id" TEXT NOT NULL,
    "follow_up_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "delivered_at" TIMESTAMP(3),
    "is_from_client" BOOLEAN NOT NULL DEFAULT false,
    "step_id" TEXT,
    "error_sending" TEXT,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "template_used" TEXT,

    CONSTRAINT "follow_up_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_schema"."follow_up_ai_analyses" (
    "id" TEXT NOT NULL,
    "follow_up_id" TEXT NOT NULL,
    "message_id" TEXT,
    "sentiment" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "topics" TEXT[],
    "next_action" TEXT NOT NULL,
    "suggested_stage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "workspace_schema"."workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."workspace_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."workspace_invitations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by" TEXT NOT NULL,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."workspace_follow_up_campaigns" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_follow_up_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."workspace_api_tokens" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "workspace_api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_schema"."workspace_webhooks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,

    CONSTRAINT "workspace_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_contents_prompt_id_key" ON "prompts_schema"."prompt_contents"("prompt_id");

-- CreateIndex
CREATE INDEX "follow_ups_client_id_idx" ON "follow_up_schema"."follow_ups"("client_id");

-- CreateIndex
CREATE INDEX "follow_ups_status_idx" ON "follow_up_schema"."follow_ups"("status");

-- CreateIndex
CREATE INDEX "follow_up_messages_follow_up_id_idx" ON "follow_up_schema"."follow_up_messages"("follow_up_id");

-- CreateIndex
CREATE INDEX "follow_up_ai_analyses_follow_up_id_idx" ON "follow_up_schema"."follow_up_ai_analyses"("follow_up_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "workspace_schema"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "workspace_schema"."accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "workspace_schema"."sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "workspace_schema"."verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "workspace_schema"."verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspace_schema"."workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_schema"."workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invitations_token_key" ON "workspace_schema"."workspace_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invitations_workspace_id_email_key" ON "workspace_schema"."workspace_invitations"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_follow_up_campaigns_workspace_id_campaign_id_key" ON "workspace_schema"."workspace_follow_up_campaigns"("workspace_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_api_tokens_token_key" ON "workspace_schema"."workspace_api_tokens"("token");

-- CreateIndex
CREATE INDEX "workspace_api_tokens_workspace_id_idx" ON "workspace_schema"."workspace_api_tokens"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_webhooks_workspace_id_idx" ON "workspace_schema"."workspace_webhooks"("workspace_id");

-- AddForeignKey
ALTER TABLE "prompts_schema"."prompt_contents" ADD CONSTRAINT "prompt_contents_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts_schema"."prompts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_funnel_stages" ADD CONSTRAINT "follow_up_funnel_stages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_steps" ADD CONSTRAINT "follow_up_steps_funnel_stage_id_fkey" FOREIGN KEY ("funnel_stage_id") REFERENCES "follow_up_schema"."follow_up_funnel_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_ups" ADD CONSTRAINT "follow_ups_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "follow_up_schema"."follow_up_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_messages" ADD CONSTRAINT "follow_up_messages_follow_up_id_fkey" FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_up_ai_analyses" ADD CONSTRAINT "follow_up_ai_analyses_follow_up_id_fkey" FOREIGN KEY ("follow_up_id") REFERENCES "follow_up_schema"."follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "workspace_schema"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "workspace_schema"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "workspace_schema"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "workspace_schema"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "workspace_schema"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_follow_up_campaigns" ADD CONSTRAINT "workspace_follow_up_campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_api_tokens" ADD CONSTRAINT "workspace_api_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "workspace_schema"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_api_tokens" ADD CONSTRAINT "workspace_api_tokens_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_webhooks" ADD CONSTRAINT "workspace_webhooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "workspace_schema"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_schema"."workspace_webhooks" ADD CONSTRAINT "workspace_webhooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace_schema"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
