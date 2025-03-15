-- Criar tabela de prompts
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  analysis TEXT,
  prompt_created TEXT,
  prompt_removed TEXT,
  prompt_complete TEXT,
  quality_checks JSONB
);

-- Criar índice para melhorar a performance das consultas por account_id
CREATE INDEX IF NOT EXISTS prompts_account_id_idx ON prompts(account_id);

-- Criar índice para ordenar por data de criação decrescente
CREATE INDEX IF NOT EXISTS prompts_created_at_desc_idx ON prompts(created_at DESC);