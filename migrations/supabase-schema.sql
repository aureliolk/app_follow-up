-- Create follow_up_campaigns table
CREATE TABLE IF NOT EXISTS follow_up_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create follow_up_funnel_stages table
CREATE TABLE IF NOT EXISTS follow_up_funnel_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create campaign_stages junction table
CREATE TABLE IF NOT EXISTS campaign_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES follow_up_campaigns(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES follow_up_funnel_stages(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id, stage_id)
);

-- Create follow_up_steps table
CREATE TABLE IF NOT EXISTS follow_up_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  funnel_stage_id UUID REFERENCES follow_up_funnel_stages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  wait_time TEXT NOT NULL,
  wait_time_ms BIGINT NOT NULL,
  message_content TEXT NOT NULL,
  message_category TEXT DEFAULT 'Utility',
  auto_respond BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create follow_ups table
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES follow_up_campaigns(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_step INTEGER DEFAULT 0,
  current_stage_id UUID REFERENCES follow_up_funnel_stages(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  next_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_responsive BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create follow_up_messages table
CREATE TABLE IF NOT EXISTS follow_up_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follow_up_id UUID REFERENCES follow_ups(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  content TEXT NOT NULL,
  template_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  funnel_stage TEXT,
  metadata JSONB
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_follow_ups_client_id ON follow_ups(client_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_campaign_id ON follow_ups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_messages_follow_up_id ON follow_up_messages(follow_up_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_messages_client_id ON follow_up_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_steps_funnel_stage_id ON follow_up_steps(funnel_stage_id);

