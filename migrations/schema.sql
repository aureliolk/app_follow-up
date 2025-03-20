-- Create follow_up_campaigns table
CREATE TABLE IF NOT EXISTS follow_up_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  steps JSONB,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create follow_up_funnel_stages table
CREATE TABLE IF NOT EXISTS follow_up_funnel_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL,
  campaign_id UUID REFERENCES follow_up_campaigns(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create follow_ups table
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id VARCHAR(255) NOT NULL,
  campaign_id UUID REFERENCES follow_up_campaigns(id),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  current_step INTEGER DEFAULT 0,
  current_stage_id UUID REFERENCES follow_up_funnel_stages(id),
  is_responsive BOOLEAN DEFAULT FALSE,
  next_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);

-- Create follow_up_messages table
CREATE TABLE IF NOT EXISTS follow_up_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follow_up_id UUID REFERENCES follow_ups(id),
  client_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  template_name VARCHAR(255),
  step_number INTEGER,
  funnel_stage VARCHAR(255),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered BOOLEAN DEFAULT TRUE,
  delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create follow_up_scheduled_messages table
CREATE TABLE IF NOT EXISTS follow_up_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follow_up_id UUID REFERENCES follow_ups(id),
  client_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  template_name VARCHAR(255),
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_follow_ups_client_id ON follow_ups(client_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_campaign_id ON follow_ups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_messages_follow_up_id ON follow_up_messages(follow_up_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_scheduled_messages_follow_up_id ON follow_up_scheduled_messages(follow_up_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_scheduled_messages_status ON follow_up_scheduled_messages(status);