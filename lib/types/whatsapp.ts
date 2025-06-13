/**
 * Representa a estrutura de um template do WhatsApp,
 * conforme recuperado do contexto ou API.
 */
export enum WhatsappTemplateCategory {
  ACCOUNT_UPDATE = 'ACCOUNT_UPDATE',
  PAYMENT_UPDATE = 'PAYMENT_UPDATE',
  PERSONAL_FINANCE_UPDATE = 'PERSONAL_FINANCE_UPDATE',
  SHIPPING_UPDATE = 'SHIPPING_UPDATE',
  RESERVATION_UPDATE = 'RESERVATION_UPDATE',
  ISSUE_RESOLUTION = 'ISSUE_RESOLUTION',
  APPOINTMENT_UPDATE = 'APPOINTMENT_UPDATE',
  TRANSPORTATION_UPDATE = 'TRANSPORTATION_UPDATE',
  TICKET_UPDATE = 'TICKET_UPDATE',
  ALERT_UPDATE = 'ALERT_UPDATE',
  AUTO_REPLY = 'AUTO_REPLY',
  TRANSACTIONAL = 'TRANSACTIONAL',
  OTP = 'OTP',
  UTILITY = 'UTILITY',
  MARKETING = 'MARKETING',
  AUTHENTICATION = 'AUTHENTICATION',
}

export enum WhatsappTemplateStatus {
  APPROVED = 'APPROVED',
  IN_APPEAL = 'IN_APPEAL',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  PENDING_DELETION = 'PENDING_DELETION',
  DELETED = 'DELETED',
  DISABLED = 'DISABLED',
  PAUSED = 'PAUSED',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
  ARCHIVED = 'ARCHIVED',
}

export interface WhatsappTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    buttons?: string[];
  };
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'PHONE_NUMBER' | 'URL' | 'COPY_CODE';
    text: string;
    url?: string;
    phone_number?: string;
    url_type?: 'STATIC' | 'DYNAMIC';
  }>;
}

/**
 * Representa a estrutura de um template do WhatsApp,
 * conforme recuperado do contexto ou API.
 */
export interface WhatsappTemplate {
  id?: string; // Optional for creation
  name: string;
  language: string;
  category: WhatsappTemplateCategory;
  components: WhatsappTemplateComponent[];
  status?: WhatsappTemplateStatus; // Optional for creation
  allow_category_change?: boolean;
  message_send_ttl_seconds?: number;
  parameter_format?: 'NAMED' | 'POSITIONAL';
  sub_category?: 'ORDER_DETAILS' | 'ORDER_STATUS';
}