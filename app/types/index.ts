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
  created_at: string | Date; // Pode ser string ou Date dependendo da API/contexto
  updated_at: string | Date;
  metadata?: any | null; // Manter 'any' ou definir uma estrutura se conhecida
  // Relações (opcionais aqui, geralmente não enviadas em forms)
  // conversations?: any[];
  // workspace?: any;
}

// Adicionado: Tipo para o formulário de Cliente
export type ClientFormData = {
  name: string | null; // Nome é importante para a UI
  phone_number: string | null; // Telefone também
  external_id?: string | null; // Opcional no form?
  channel?: string | null; // Opcional no form?
  // Metadata não será editável via form simples
};


// Representa uma mensagem no histórico da conversa
export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'CLIENT' | 'AI' | 'SYSTEM'; // Do Prisma Enum
  content: string;
  timestamp: string | Date; // Vem como string da API, converter para Date se necessário
  channel_message_id?: string | null;
  metadata?: any | null;

  // --- Campos adicionados do schema.prisma --- 
  media_url?: string | null;
  media_mime_type?: string | null;
  media_filename?: string | null;
  status?: string | null; // Ex: PENDING, SENT, FAILED
  providerMessageId?: string | null;
  sentAt?: string | Date | null; // Timestamp de envio
  errorMessage?: string | null;
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

// Representa uma conversa como vinda da API de listagem (/api/conversations)
export interface ClientConversation {
  id: string; // Conversation ID
  workspace_id: string;
  client_id: string;
  channel?: string | null;
  channel_conversation_id?: string | null;
  status: string; // Ex: 'ACTIVE', 'CLOSED' (do Prisma Enum ConversationStatus)
  is_ai_active: boolean;
  last_message_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  metadata?: any | null;
  client: { // Dados do cliente incluídos
    id: string;
    name?: string | null;
    phone_number?: string | null;
  };
  last_message?: { // Última mensagem incluída
    content: string;
    timestamp: string | Date;
    sender_type: 'CLIENT' | 'AI' | 'SYSTEM';
  } | null;

  // <<< CAMPO ADICIONADO >>>
  // Guarda o ID e status do follow-up ativo/pausado encontrado pela API
  activeFollowUp: {
    id: string;
    status: string; // Ou FollowUpStatus se usar Enum
  } | null;

  // Campos opcionais
  unread_count?: number;
}

// --- Tipo Campaign Atualizado (com FormData) ---
export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string | Date; // Vem como string/Date da API
  active: boolean;

  // Campos de IA
  ai_prompt_product_name?: string | null;
  ai_prompt_target_audience?: string | null;
  ai_prompt_pain_point?: string | null;
  ai_prompt_main_benefit?: string | null;
  ai_prompt_tone_of_voice?: string | null;
  ai_prompt_extra_instructions?: string | null;
  ai_prompt_cta_link?: string | null;
  ai_prompt_cta_text?: string | null;

  // Campos Lumibot (se aplicável)
  idLumibot?: string | null;
  tokenAgentLumibot?: string | null;

  // Campos agregados (geralmente não no form)
  stepsCount?: number;
  activeFollowUps?: number;

  // Relações e campos necessários no formulário/initialData
  funnel_stage_id?: string | null; // Adicionado
  followUpId?: string | null;      // Adicionado
  steps?: CampaignStep[] | FunnelStep[]; // Adicionado (usando tipos existentes)
}

// --- DEFINIÇÃO DE CampaignFormData ---
// Cria um tipo baseado em Campaign, omitindo campos não editáveis no formulário.
export type CampaignFormData = Omit<Campaign,
  // 'id' |                // NÃO OMITIR ID - necessário para update
  'createdAt' |        // Gerado pelo banco
  'stepsCount' |        // Calculado/Agregado
  'activeFollowUps' |    // Calculado/Agregado
  'steps'                // Relação complexa, não editada diretamente no form principal
  // Não omitir funnel_stage_id e followUpId se forem parte do form
>;


