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

-- Create index for improved performance
CREATE INDEX IF NOT EXISTS idx_follow_up_steps_funnel_stage_id ON follow_up_steps(funnel_stage_id);