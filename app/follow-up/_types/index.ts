// app/follow-up/_types/index.ts

export interface FollowUpMessage {
  id: string
  follow_up_id: string
  step: number
  content: string
  sent_at: string
  delivered: boolean
  delivered_at: string | null
  template_name?: string
  category?: string
  funnel_stage?: string
}

export interface FollowUp {
  id: string
  campaign_id: string
  client_id: string
  current_step: number
  current_stage_id?: string
  current_stage_name?: string
  status: string
  started_at: string
  next_message_at: string | null
  completed_at: string | null
  is_responsive: boolean
  campaign: {
    id: string
    name: string
  }
  messages: FollowUpMessage[]
  metadata?: string | Record<string, any>
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  created_at: string
  active: boolean
  stepsCount: number
  activeFollowUps: number
  default_stage_id?: string
  steps?: any[]
}

export interface FunnelStage {
  id: string
  name: string
  description?: string
  order: number
}

export interface FunnelStep {
  id: string
  stage_id: string
  template_name: string
  wait_time: string
  message_content: string
}

export interface CampaignStep {
  id: string
  etapa: string
  stage_name?: string
  tempo_de_espera: string
  wait_time?: string
  template_name: string
  message: string
  mensagem?: string
  stage_id?: string
  stage_order?: number
  condicionais?: string
}

