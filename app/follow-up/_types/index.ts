// app/follow-up/_types/index.ts

export interface FollowUpMessage {
  id: string;
  follow_up_id: string;
  step: number;
  content: string;
  sent_at: string;
  delivered: boolean;
  delivered_at: string | null;
  template_name?: string;
  category?: string;
  funnel_stage?: string;
}

export interface FollowUp {
  id: string;
  campaign_id: string;
  client_id: string;
  current_step: number;
  current_stage_id?: string;
  current_stage_name?: string;
  status: string;
  started_at: string;
  next_message_at: string | null;
  completed_at: string | null;
  is_responsive: boolean;
  campaign: {
    id: string;
    name: string;
  };
  messages: FollowUpMessage[];
  metadata?: string | Record<string, any>;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  active: boolean;
  stepsCount: number;
  activeFollowUps: number;
  default_stage_id?: string;
  steps?: any[];
}

export interface FunnelStage {
  id: string;
  name: string;
  description?: string;
  order: number;
}

export interface FunnelStep {
  id: string;
  stage_id: string;
  template_name: string;
  wait_time: string;
  message_content: string;
}

export interface CampaignStep {
  id: string;
  stage_name: string;        // Nome do estágio
  wait_time: string;         // Tempo de espera (formato "1d", "2h", "30m")
  template_name: string;     // Nome do template
  message: string;           // Conteúdo da mensagem
  stage_id?: string;         // ID do estágio de funil relacionado
  stage_order?: number;      // Ordem no estágio
  category?: string;         // Categoria da mensagem
  auto_respond?: boolean;    // Se responde automaticamente
}