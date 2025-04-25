/**
 * Representa a estrutura de um template do WhatsApp,
 * conforme recuperado do contexto ou API.
 */
export interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  // Adicione outros campos se necessário, como header, footer, buttons
} 