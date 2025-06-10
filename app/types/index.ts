// app/follow-up/_types/index.ts

// --- Tipos Originais Fornecidos ---
export interface FollowUpMessage {
  id: string;
  follow_up_id: string;
  // step: number; // 'step_id' parece mais apropriado, verificar schema/API
  step_id?: string; // Adicionado opcionalmente
  content: string;
  sent_at: string; // Idealmente Date, mas mantendo como string se a API retorna assim
  delivered: boolean;
  delivered_at: string | null; // Idealmente Date | null
  template_name?: string;
  category?: string;
  // funnel_stage?: string; // 'current_stage_name' está no FollowUp, talvez não precise aqui?
  is_from_client?: boolean; // Adicionado do schema
  is_ai_generated?: boolean; // Adicionado do schema
  error_sending?: string | null; // Adicionado do schema
}

export interface FollowUp {
  id: string;
  campaign_id: string;
  client_id: string;
  workspace_id: string;

  // current_step: number; // O schema usa current_stage_id
  current_stage_id?: string | null;
  current_stage_name?: string; // Adicionado para conveniência na UI
  status: string; // 'active', 'completed', 'paused', 'cancelled' etc.
  started_at: string; // Idealmente Date
  updated_at: string; // Idealmente Date
  next_message_at: string | null; // Idealmente Date | null
  completed_at: string | null; // Idealmente Date | null
  current_sequence_step_order?: number | null;
  // is_responsive: boolean; // O schema usa waiting_for_response
  waiting_for_response?: boolean;
  last_response?: string | null;
  last_response_at?: string | null; // Idealmente Date | null
  last_client_message_at?: string | null; // Idealmente Date | null
  next_evaluation_at?: string | null; // Idealmente Date | null
  paused_reason?: string | null;
  ai_suggestion?: string | null;
  campaign?: { // Relação parcial para exibição
    id: string;
    name: string;
  };
  messages: FollowUpMessage[];
  // metadata?: string | Record<string, any>; // O schema não tem metadata diretamente em FollowUp
}

// --- Outros Tipos Fornecidos ---
export interface FunnelStage {
  id: string;
  name: string;
  description?: string | null; // Ajustado para null
  order: number;
  campaign_id?: string; // Adicionado do schema (opcional aqui, pois pode vir da campanha pai)
  requires_response?: boolean; // Adicionado do schema
  created_at?: string; // Adicionado do schema
  // Relações (evitar em tipos simples se possível, carregar sob demanda)
  // campaign?: Campaign;
  // steps?: FunnelStep[];
}

export interface FunnelStep {
  id: string;
  funnel_stage_id: string; // Mantido do schema
  template_name: string;
  wait_time: string; // Formato "1d", "2h", "30m" etc.
  // message_content: string; // O schema chama de message_content
  message: string; // Nome usado no CampaignStep, vamos padronizar? Usando 'message' por enquanto.
  order?: number; // Adicionado do schema
  category?: string; // Adicionado do schema
  is_hsm?: boolean; // Adicionado do schema
  status?: string; // Adicionado do schema
  created_at?: string; // Adicionado do schema

  // Campos do tipo CampaignStep que parecem sobrepor (escolher um padrão)
  stage_name?: string; // Pode ser derivado do stage_id
  stage_id?: string; // Redundante com funnel_stage_id?
  auto_respond?: boolean; // Não presente no schema FollowUpStep
}


// Este tipo parece redundante com FunnelStep ou uma view específica.
// Se for usado, precisa ser bem definido.
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

// Adicionar tipos relacionados a Workspace/Membros/Auth se necessário aqui também
// Exemplo:
// export interface Member { ... }
// export interface Invitation { ... }

export interface Client {
  id: string;
  workspace_id: string;
  external_id?: string | null;
  phone_number?: string | null;
  name?: string | null;
  channel?: string | null;
  tags?: string[] | null; // Campo adicionado para suportar as tags no ClientList
  created_at: string | Date; // Pode ser string ou Date dependendo da API/contexto
  updated_at: string | Date;
  metadata?: any | null; // Manter 'any' ou definir uma estrutura se conhecida
  // Relações (opcionais aqui, geralmente não enviadas em forms)
  // conversations?: any[];
  // workspace?: any;
}

// Adicionado: Tipo para o formulário de Cliente
export type ClientFormData = {
  name?: string | null; // Tornar opcional para corresponder ao update
  phone_number?: string | null; // Tornar opcional para corresponder ao update
  external_id?: string | null; // Opcional no form?
  channel?: string | null; // Opcional no form?
  tags?: string[] | null; // Campo adicionado para editar tags no formulário de cliente
  // Metadata não será editável via form simples
};


// Representa uma mensagem no histórico da conversa
export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'CLIENT' | 'AI' | 'SYSTEM' | 'AGENT' | 'AUTOMATION';
  message_type: string;
  content: string | null;
  timestamp: string | Date;
  channel_message_id?: string | null;
  metadata?: any | null;

  // --- Campos adicionados do schema.prisma ---
  ai_media_analysis?: string | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  media_filename?: string | null;
  status?: string | null; // Ex: PENDING, SENT, FAILED, DELIVERED, READ
  provider_message_id?: string | null;
  client_id?: string;
  workspace_id?: string;
  llm_summary?: string | null;
  operator_name?: string | null; // Adicionar campo para o nome do operador/IA
  privates_notes?: boolean; // Adicionar campo para notas privadas
  errorMessage?: string | null; // Adicionar campo para mensagens de erro
}

// <<< INÍCIO DA NOVA INTERFACE >>>
// Representa um template de mensagem do WhatsApp
export interface WhatsappTemplate {
  id: string;       // ID único do template (pode ser o da Meta ou interno)
  name: string;     // Nome do template (ex: "pedido_confirmado")
  language: string; // Código do idioma (ex: "pt_BR")
  category: string; // Categoria do template (ex: "UTILITY", "MARKETING")
  body: string;     // Corpo principal do template, pode conter variáveis como {{1}}
  // Opcional: Adicionar mais campos se a API retornar (header, footer, botões, etc.)
  // header?: { type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT', content: string | { link: string } };
  // footer?: { text: string };
  // buttons?: { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER', text: string, value?: string }[];
}
// <<< FIM DA NOVA INTERFACE >>>

// Adicionar tipo para o FollowUp resumido
// Remover import do enum aqui, pois a API enviará string
// import { FollowUpStatus } from '@prisma/client';

export interface ActiveFollowUpInfo {
  id: string;
  status: string; // <<< Alterar para string
  // Adicionar outros campos se necessário no futuro (ex: next_sequence_message_at)
}

// Representa uma conversa como vinda da API de listagem (/api/conversations)
export interface ClientConversation {
  id: string; // Conversation ID
  workspace_id: string;
  client_id: string;
  channel?: string | null;
  channel_conversation_id?: string | null;
  status: string; // Ex: 'ACTIVE', 'CLOSED' (Status da CONVERSA)
  is_ai_active: boolean;
  last_message_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  metadata?: any | null;
  client: { 
    id: string;
    name?: string | null;
    phone_number?: string | null;
    // Metadata do CLIENTE pode estar aqui se a API incluir
    metadata?: any | null; 
  } | null; // Tornar client opcional para segurança
  last_message?: { 
    id?: string;
    content: string | null; // Permitir null para mídia sem texto
    timestamp: string | Date;
    sender_type: 'CLIENT' | 'AI' | 'SYSTEM' | 'AGENT' | 'AUTOMATION'; // Atualizado
  } | null;

  // <<< RE-ADICIONAR/ATUALIZAR CAMPO AQUI >>>
  activeFollowUp?: ActiveFollowUpInfo | null; // Status do FollowUp ativo/pausado do CLIENTE

  unread_count?: number; // Se aplicável

  // <<< ADICIONAR ESTE CAMPO >>>
  last_message_timestamp?: string | null;
  // Adicionar propriedade workspace para acessar ai_name
  workspace?: {
    ai_name?: string | null;
  } | null;
}

// --- Tipos de Follow-up/Campanha Removidos ---
// export interface FollowUpMessage { ... }
// export interface FollowUp { ... }
// export interface FunnelStage { ... }
// export interface FunnelStep { ... }
// export interface CampaignStep { ... }
// export interface Campaign { ... }
// export type CampaignFormData = Omit<...>;

// +++ RE-ADICIONAR TIPOS DE CAMPANHA NECESSÁRIOS +++
export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  active: boolean;
  ai_prompt_product_name?: string | null;
  ai_prompt_target_audience?: string | null;
  ai_prompt_pain_point?: string | null;
  ai_prompt_main_benefit?: string | null;
  ai_prompt_tone_of_voice?: string | null;
  ai_prompt_extra_instructions?: string | null;
  ai_prompt_cta_text?: string | null;
  ai_prompt_cta_link?: string | null;
  funnel_stage_id?: string | null; // ID do estágio de funil (ou poderia ser um nome/tipo?)
  followUpId?: string; // Se houver relacionamento com FollowUp
  idLumibot?: string | null; // Adicionado
  tokenAgentLumibot?: string | null; // Adicionado
  createdAt: string | Date; // Ajustado para não opcional
  updatedAt: string | Date; // Ajustado para não opcional
  // Relações opcionais que podem ser úteis
  // funnelStage?: FunnelStage | null;
  // steps?: FunnelStep[] // Ou CampaignStep[]?
}

// Tipo para o formulário de Campanha
export type CampaignFormData = Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'workspace_id'> & {
  id?: string; // ID opcional para edição
};
// +++ FIM RE-ADICIONAR TIPOS DE CAMPANHA +++

// +++ INÍCIO TIPOS DE TRIGGER +++
// Estrutura principal do Trigger (similar ao model do Prisma, provavelmente)
export interface Trigger {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  eventType: string; // Ex: 'contact_created', 'tag_added', 'webhook_received', 'scheduled'
  eventFilters?: Record<string, any> | null; // Ex: { tag: 'vip', customField: 'value' }
  actionType: string; // Ex: 'send_message_template', 'add_contact_tag', 'call_webhook'
  actionConfig: Record<string, any>; // Ex: { templateName: '...', delaySeconds: 0, tag: 'processed' }
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Adicionar outros campos conforme necessário (ex: lastExecution, executionCount)
}

// Estrutura de dados para o formulário de criação/edição
export interface TriggerFormData {
  id?: string; // Opcional para criação
  name: string;
  description?: string | null;
  eventType: string;
  eventFilters?: Record<string, any> | null;
  actionType: string;
  actionConfig: Record<string, any>;
  active: boolean;
  // workspaceId geralmente vem do contexto/URL, não do formulário
}
// +++ FIM TIPOS DE TRIGGER +++


