-- Enable RLS (Row Level Security)
ALTER DATABASE postgres SET "app.jwt_secret" = 'your-jwt-secret-here';

-- Create schemas
CREATE SCHEMA IF NOT EXISTS conversation_schema;
CREATE SCHEMA IF NOT EXISTS follow_up_schema;
CREATE SCHEMA IF NOT EXISTS products_schema;
CREATE SCHEMA IF NOT EXISTS prompts_schema;
CREATE SCHEMA IF NOT EXISTS workspace_schema;

-- Create enums
CREATE TYPE conversation_schema.conversation_status AS ENUM ('ACTIVE', 'PAUSED_BY_USER', 'PAUSED_BY_AI', 'CLOSED');
CREATE TYPE conversation_schema.message_sender_type AS ENUM ('CLIENT', 'AI', 'SYSTEM');

-- Create tables
CREATE TABLE workspace_schema.workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ai_default_system_prompt TEXT,
  ai_model_preference TEXT,
  webhook_ingress_secret TEXT UNIQUE,
  whatsapp_phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  whatsapp_access_token TEXT,
  whatsapp_app_secret TEXT,
  whatsapp_webhook_verify_token TEXT,
  whatsapp_webhook_route_token TEXT UNIQUE,
  ai_name TEXT DEFAULT 'Beatriz',
  google_refresh_token TEXT,
  google_access_token_expires_at TIMESTAMP WITH TIME ZONE,
  google_calendar_scopes TEXT[],
  google_account_email TEXT
);

CREATE TABLE workspace_schema.workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspace_schema.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE workspace_schema.workspace_api_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspace_schema.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL
);

CREATE TABLE conversation_schema.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspace_schema.workspaces(id) ON DELETE CASCADE,
  external_id TEXT,
  phone_number TEXT,
  name TEXT,
  channel TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB,
  UNIQUE(workspace_id, phone_number, channel)
);

CREATE TABLE conversation_schema.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspace_schema.workspaces(id) ON DELETE CASCADE,
  client_id UUID REFERENCES conversation_schema.clients(id) ON DELETE CASCADE,
  channel TEXT,
  channel_conversation_id TEXT,
  status conversation_schema.conversation_status DEFAULT 'ACTIVE',
  is_ai_active BOOLEAN DEFAULT TRUE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB,
  UNIQUE(workspace_id, client_id, channel),
  UNIQUE(workspace_id, channel_conversation_id)
);

CREATE TABLE conversation_schema.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversation_schema.conversations(id) ON DELETE CASCADE,
  sender_type conversation_schema.message_sender_type,
  content TEXT,
  ai_media_analysis TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  channel_message_id TEXT,
  metadata JSONB,
  media_url TEXT DEFAULT '',
  media_mime_type TEXT DEFAULT '',
  media_filename TEXT DEFAULT '',
  status TEXT DEFAULT 'PENDING',
  provider_message_id TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

CREATE TABLE follow_up_schema.follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID,
  client_id UUID REFERENCES conversation_schema.clients(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  next_message_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  current_stage_id UUID,
  waiting_for_response BOOLEAN DEFAULT FALSE,
  last_response TEXT,
  last_response_at TIMESTAMP WITH TIME ZONE,
  last_client_message_at TIMESTAMP WITH TIME ZONE,
  next_evaluation_at TIMESTAMP WITH TIME ZONE,
  paused_reason TEXT,
  ai_suggestion TEXT,
  workspace_id UUID REFERENCES workspace_schema.workspaces(id) ON DELETE CASCADE,
  current_sequence_step_order INTEGER DEFAULT 0,
  next_sequence_message_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE follow_up_schema.follow_up_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follow_up_id UUID REFERENCES follow_up_schema.follow_ups(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered BOOLEAN DEFAULT FALSE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  is_from_client BOOLEAN DEFAULT FALSE,
  step_id UUID,
  error_sending TEXT,
  is_ai_generated BOOLEAN DEFAULT FALSE,
  template_used TEXT
);

CREATE TABLE follow_up_schema.follow_up_ai_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follow_up_id UUID REFERENCES follow_up_schema.follow_ups(id) ON DELETE CASCADE,
  message_id UUID,
  sentiment TEXT NOT NULL,
  intent TEXT NOT NULL,
  topics TEXT[],
  next_action TEXT NOT NULL,
  suggested_stage TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_clients_workspace_id ON conversation_schema.clients(workspace_id);
CREATE INDEX idx_clients_external_id ON conversation_schema.clients(external_id);
CREATE INDEX idx_clients_phone_number ON conversation_schema.clients(phone_number);

CREATE INDEX idx_conversations_workspace_id ON conversation_schema.conversations(workspace_id);
CREATE INDEX idx_conversations_client_id ON conversation_schema.conversations(client_id);
CREATE INDEX idx_conversations_channel_conversation_id ON conversation_schema.conversations(channel_conversation_id);
CREATE INDEX idx_conversations_status ON conversation_schema.conversations(status);
CREATE INDEX idx_conversations_last_message_at ON conversation_schema.conversations(last_message_at);

CREATE INDEX idx_messages_conversation_id ON conversation_schema.messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON conversation_schema.messages(timestamp);

CREATE INDEX idx_follow_ups_client_id ON follow_up_schema.follow_ups(client_id);
CREATE INDEX idx_follow_ups_status ON follow_up_schema.follow_ups(status);

-- Enable Row Level Security (RLS)
ALTER TABLE workspace_schema.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_schema.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_schema.workspace_api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_schema.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_schema.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_schema.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_schema.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_schema.follow_up_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_schema.follow_up_ai_analyses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read for workspace members" ON workspace_schema.workspaces
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM workspace_schema.workspace_members 
      WHERE workspace_id = id
    )
  );

CREATE POLICY "Enable read for workspace members" ON workspace_schema.workspace_members
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM workspace_schema.workspace_members 
      WHERE workspace_id = workspace_id
    )
  );

-- Add more policies as needed for other tables 